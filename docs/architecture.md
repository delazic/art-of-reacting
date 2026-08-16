# Architecture

Single source of truth for the design of art-of-reacting. Update this file whenever a structural decision changes.

## Purpose

art-of-reacting is a **deliberately-simple full-stack demo**. Its goals, in order:

1. Demonstrate sound engineering practices
2. Demonstrate Docker packaging
3. Demonstrate AWS deployment

Feature richness is explicitly **not** a goal. Every additional dependency, abstraction, or AWS service must be justified against a concrete v1 requirement.

## Applications

| App                  | Directory              | Stack                                      | Runtime |
| -------------------- | ---------------------- | ------------------------------------------ | ------- |
| Frontend SPA         | `artofreacting/`       | React 18+ + TypeScript, built with Vite    | Static  |
| REST API             | `artofreacting-api/`   | Java 21, Spring Boot 3, Maven              | JVM     |

## Product surface

Two operations only:

1. **Register a user** — `POST /api/users` with `{ "username": "..." }`
2. **List users** — `GET /api/users`

## Data model

```
User {
  id:        UUID       # server-generated
  username:  String     # unique, case-insensitive, validated
  createdAt: Instant    # server-generated
}
```

Username only. No email, no name, no profile. See [ADR-0001](./adr/0001-deliberately-simple-v1.md).

## REST API design

```
POST /api/users
  Request:  { "username": "alice" }
  201 Created
  Response: { "id": "...", "username": "alice", "createdAt": "2026-08-16T..." }
  400 Bad Request  — validation failure (blank, too long, invalid chars)
  409 Conflict     — username already registered

GET /api/users
  200 OK
  Response: [ { "id": "...", "username": "alice", "createdAt": "..." }, ... ]

GET /actuator/health
  200 OK  { "status": "UP" }
```

Consistent JSON error body: `{ "error": "USERNAME_TAKEN", "message": "..." }`.

## Storage

`ConcurrentHashMap<UUID, User>` behind a `UserRepository` interface with a single `InMemoryUserRepository` implementation.

- Data is lost on restart. **This is intentional.**
- The interface abstraction exists so a future JDBC/JPA implementation can be swapped in without touching the controller. It is a deliberate exception to the "no abstractions without a second implementation" rule.

## Same-origin routing (design rule)

The frontend calls **relative** paths (`/api/*`). Every environment resolves `/api/*` via its own reverse proxy:

| Environment      | Resolver                              |
| ---------------- | ------------------------------------- |
| Local dev        | Vite dev proxy → `localhost:8080`     |
| docker-compose   | web nginx → `api:8080` (Docker DNS)   |
| AWS (preferred)  | CloudFront behavior → EC2 origin      |
| AWS (fallback)   | EC2 nginx → local API container       |

**Why:** Same-origin eliminates CORS everywhere, avoids the HTTPS-frontend-to-HTTP-API mixed-content trap, and keeps the frontend build identical across environments (no `VITE_API_URL` to manage).

**Never** introduce an absolute API URL or `VITE_API_URL` env var in the frontend.

## Local development

Two independent processes, each hot-reloading:

```
Terminal 1:  cd artofreacting-api && ./mvnw spring-boot:run     → :8080
Terminal 2:  cd artofreacting     && npm run dev                → :5173
```

Vite dev server proxies `/api` → `http://localhost:8080`, so the browser only ever talks to `:5173`.

`docker compose up` is a **parity check**, not the primary inner loop — Windows bind-mount performance into containers is too slow for HMR.

## Docker

**API image** (`artofreacting-api/Dockerfile`) — multi-stage:

1. Builder: `eclipse-temurin:21-jdk`, warms the Maven dep cache, then `mvn package -DskipTests`
2. Runtime: `eclipse-temurin:21-jre`, non-root user, `EXPOSE 8080`, `ENTRYPOINT ["java","-jar","/app/app.jar"]`

**Frontend image** (`artofreacting/Dockerfile`) — multi-stage:

1. Builder: `node:20-alpine`, `npm ci && npm run build`
2. Runtime: `nginx:alpine`, serves `dist/`, SPA fallback to `index.html`, reverse-proxies `/api/*` to the API upstream

**`docker-compose.yml`** (root): `api` service + `web` service on a shared bridge network. Browser only talks to `web`; `web` proxies `/api` to `api:8080`.

## AWS architecture (initial)

Region: **`eu-west-1`** (Ireland).

```
                ┌──────────────────────────────┐
   users ──▶    │  CloudFront distribution     │
                │  ┌────────────────────────┐  │
                │  │ default → S3 origin    │──┼──▶ S3 (React static build, private + OAC)
                │  │ /api/*  → EC2 origin   │──┼──▶ EC2 (Elastic IP), Docker, :80 → API :8080
                │  └────────────────────────┘  │
                └──────────────────────────────┘

   ECR repo: artofreacting-api  (source of truth for API image)
```

Components:

- **1× EC2** (`t3.micro` or `t3.small`) in the default VPC. User-data installs Docker, logs into ECR, runs the API container with `--restart=unless-stopped`. Elastic IP for a stable address.
- **1× ECR** private repo for the API image.
- **1× IAM instance profile** with `AmazonEC2ContainerRegistryReadOnly` (so `docker pull` needs no static creds).
- **1× S3 bucket** for the frontend static bundle, private, accessed only via CloudFront OAC.
- **1× CloudFront distribution** with two behaviors:
  - `/api/*` → EC2 origin (HTTPS viewer, HTTP origin)
  - `default` → S3 origin

**Fallback** (if S3+CloudFront setup slips): serve the frontend nginx container from the same EC2, reverse-proxying `/api` to the API container. Lose HTTPS and the CDN; still get public URLs quickly.

Deployment shape is codified as a **runbook** (`docs/runbook/`) — no Terraform in v1.

## Testing approach

**Backend**
- Unit tests for `InMemoryUserRepository` including one concurrency test
- `@WebMvcTest(UserController.class)` + `MockMvc` for controller behavior, validation, status codes, JSON shape
- One `@SpringBootTest` smoke test that boots the context and hits `/actuator/health`

**Frontend**
- Vitest + React Testing Library for the register form and the user list; `fetch` mocked at the boundary

**Deferred**: Playwright / e2e, contract tests, load tests, coverage gates.

## Explicitly deferred (do NOT add without approval)

| Item | Reason |
| ---- | ------ |
| Any database (Postgres, RDS, DynamoDB, H2, SQLite) | Spec: in-memory only |
| ORM / JPA / Flyway / Liquibase | No DB to migrate |
| Authentication (Cognito, Auth0, JWT, sessions, Spring Security) | Spec: no auth in v1 |
| Redis / any cache | In-memory *is* the store |
| ECS / Fargate / EKS | One container on one host doesn't need orchestration |
| ALB / ASG / multi-AZ | Not an HA demo |
| Custom VPC | Default VPC is fine |
| Secrets Manager / Parameter Store | Nothing secret yet |
| Route 53 / ACM | No domain chosen |
| Terraform | Runbook-first — codify once shape stabilizes |
| CI/CD (GitHub Actions) | Manual deploy first; automate in Phase 5 |
| Tailwind, shadcn, UI component libraries | Two views |
| React Router, Redux, TanStack Query, Zustand, axios | Nothing to route or globally cache |
| Lombok | Java 21 `record`s cover the DTOs |
| Monorepo tooling | Two apps, no shared code |
| Playwright / e2e | Vitest + `@WebMvcTest` cover the risk |

## Deployment sequence

1. Both apps run locally (`./mvnw spring-boot:run` + `npm run dev`) with Vite proxy wired
2. Each app has a Dockerfile; `docker compose up` brings both up locally
3. AWS baselines: IAM role/instance profile, ECR repo, EC2 key pair
4. First `docker push` of API image to ECR (manual, from a laptop)
5. Launch EC2, attach EIP, user-data pulls image and runs it; verify `http://<eip>/api/users`
6. Create S3 bucket, upload built frontend, create CloudFront with two behaviors; verify SPA loads and `/api/*` reaches EC2
7. (Phase 5) Add GitHub Actions for build/push/deploy; add Terraform once topology stops changing
8. (Later) Add a domain, ACM cert, Route 53

## Phase status

- [x] **Phase 0** — Foundation
- [ ] **Phase 1** — Spring Boot API
- [ ] **Phase 2** — React frontend
- [ ] **Phase 3** — Dockerfiles + docker-compose
- [ ] **Phase 4** — AWS deployment (runbook)
- [ ] **Phase 5** — CI/CD, then Terraform
