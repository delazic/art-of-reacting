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

| Environment      | Browser entry point                          | Resolver                              |
| ---------------- | -------------------------------------------- | ------------------------------------- |
| Local dev        | `http://localhost:5173`                      | Vite dev proxy → `localhost:8080`     |
| docker-compose   | `http://localhost/` or `http://192.168.99.100/` | web nginx → `api:8080` (Docker DNS) |
| AWS (preferred)  | `https://<distribution-id>.cloudfront.net`   | CloudFront behavior → EC2 origin      |
| AWS (fallback)   | `http://<elastic-ip>`                        | EC2 nginx → local API container       |

The browser entry point is always the **frontend's** URL; the API is never opened directly. In dev the API's port is published for convenience, but from docker-compose onwards it is not published at all — the only way to reach it is through whatever serves the page.

**Why:** Same-origin eliminates CORS everywhere, avoids the HTTPS-frontend-to-HTTP-API mixed-content trap, and keeps the frontend build identical across environments (no `VITE_API_URL` to manage).

**Never** introduce an absolute API URL or `VITE_API_URL` env var in the frontend.

## Local development

Two independent processes, each hot-reloading:

```
Terminal 1:  cd artofreacting-api && ./mvnw spring-boot:run     → :8080
Terminal 2:  cd artofreacting     && npm run dev                → :5173
```

Vite dev server proxies `/api` → `http://localhost:8080`, so the browser only ever talks to `:5173`.

`docker compose up` is a **parity check**, not the primary inner loop: the containers have no hot reload, and in the reference environment the repository cannot be bind-mounted into the Docker VM at all — see [Docker Machine + VirtualBox on Windows](#docker-machine--virtualbox-on-windows).

## Docker

**API image** (`artofreacting-api/Dockerfile`) — multi-stage:

1. Builder: `maven:3.9-eclipse-temurin-21`, resolves dependencies from `pom.xml` in a layer of its own, then `mvn package -DskipTests`
2. Runtime: `eclipse-temurin:21-jre`, non-root uid 10001, `EXPOSE 8080`, `ENTRYPOINT ["java","-jar","/app/app.jar"]`

The builder is the Maven image rather than `eclipse-temurin:21-jdk` + `./mvnw` because `mvnw` is committed as git mode `100644` — not executable, so `./mvnw` fails in a Linux container — and its `distributionType=script` downloads the Maven distribution at build time, which would need `wget` and `unzip` in the builder. The image carries Maven on the same 3.9 line the wrapper pins; `./mvnw` remains authoritative for local builds.

**Frontend image** (`artofreacting/Dockerfile`) — multi-stage:

1. Builder: `node:22-alpine`, `npm ci` in a layer of its own, then `npm run build` — which typechecks first, so a type error fails the image build
2. Runtime: `nginx:alpine`, serves `dist/`, SPA fallback to `index.html`, reverse-proxies `/api/*` to `api:8080`

Node 22 rather than 20: Vite 8 declares `engines.node: ^20.19.0 || >=22.12.0`, and Node 20 reached end-of-life in April 2026.

**Healthchecks** are declared in the Dockerfiles, not in `docker-compose.yml`, so the identical check travels to ECR and EC2 in Phase 4 and compose merely gates on it. `curl` in the API runtime image exists solely for its healthcheck and is the only package added to either runtime image; the frontend uses busybox `wget`, already present in `nginx:alpine`.

**`docker-compose.yml`** (root): `api` + `web` on compose's default bridge network. `web` is the only service with a published port, so the browser cannot reach the API except through the proxy. `web` gates on `api`'s healthcheck with `depends_on: condition: service_healthy`, because nginx aborts at startup if `proxy_pass` cannot resolve its upstream.

### Docker Machine + VirtualBox on Windows

The reference environment is Windows 10 **without** Docker Desktop or WSL2: Docker Engine runs in a `boot2docker` VM (`docker-machine` name `default`, driver `virtualbox`, host-only address `192.168.99.100`), and the Docker CLI must be pointed at it once per shell:

```powershell
docker-machine env default --shell powershell | Invoke-Expression
```

Three things follow that a Docker Desktop setup would hide:

| Concern | Consequence |
| ------- | ----------- |
| Published ports bind **inside the VM** | `web`'s port 80 is the *VM's* port 80. It is reachable at `http://192.168.99.100/` over the host-only adapter, and from Windows at `http://localhost/` only because a VirtualBox NAT rule forwards `127.0.0.1:80 → VM:80`. A published port with no matching NAT rule is not reachable as `localhost` at all — which is why `web` uses 80 rather than 3000. |
| Bind mounts require a VirtualBox shared folder | Only `C:\Users` and `D:\dev\docker` are shared into this VM, and the repository lives outside both. A bind mount of the source would silently present an *empty* directory to the container. compose therefore declares **no `volumes:`**. |
| The build context is uploaded to the VM over TLS | Context size costs time on every build, so both `.dockerignore` files are load-bearing: they cut `artofreacting/` from ~85 MB to ~0.2 MB (`node_modules`) and `artofreacting-api/` from ~23 MB to ~0.1 MB (`target/`). |

Two operational notes: the VM is provisioned with 1 CPU / 1024 MB, which is tight for `mvn package` and `vite build` running inside it; and a VM clock that drifts while the host sleeps makes TLS handshakes to Docker Hub and Maven Central fail mid-build — `docker-machine restart default` resyncs it.

`api:8080` is unaffected by any of this. It is compose's embedded DNS **inside** the VM, it behaves identically on AWS, and it is meaningless from Windows.

### Known limitation: Phase 3 runtime verification

Phase 3's Dockerfiles and `docker-compose.yml` are implemented and **statically validated** — `docker compose config` parses, base image tags resolve, `COPY` sources survive both `.dockerignore` files, and the jar name matches the POM's `finalName`. Full **local runtime verification could not be completed.**

The local Docker environment is an obsolete Docker Machine / Boot2Docker stack: **Docker Engine 19.03.12, Boot2Docker 19.03.12, kernel 4.19.130**. Java 21 containers fail on it with `pthread_create failed (EPERM)` / `Cannot create worker thread` — the engine's seccomp profile predates the `clone3` syscall that a modern glibc uses to start threads, so the JVM cannot create any.

This is a **local Docker infrastructure limitation, not an application defect.** It is explicitly **not** a reason to modify the Dockerfiles or the compose architecture:

- Do **not** downgrade the Java version, base images, or Node version to suit this engine.
- Do **not** add `--security-opt seccomp=unconfined` or a custom seccomp profile to the committed configuration.
- Do **not** restructure compose around it.

The constraint is the host, and it disappears on any current engine. Consequently the API image's first real runtime verification happens on the **EC2 instance in Phase 4**, where Docker and the kernel are current — see [`docs/runbook/`](./runbook/).

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

- **1× EC2** (`t3.small` for v1, downsizable to `t3.micro`) in the default VPC. User-data installs Docker and git; the API container is started by the runbook with `--restart=unless-stopped`. Elastic IP for a stable address. In v1 this instance is **also the image build host** — see below.
- **1× ECR** private repo for the API image.
- **1× IAM instance profile** with pull-only ECR permissions (so `docker pull` needs no static creds). It deliberately has **no push permissions** — see below.
- **1× S3 bucket** for the frontend static bundle, private, accessed only via CloudFront OAC.
- **1× CloudFront distribution** with two behaviors:
  - `/api/*` → EC2 origin (HTTPS viewer, HTTP origin)
  - `default` → S3 origin

**Fallback** (if S3+CloudFront setup slips): serve the frontend nginx container from the same EC2, reverse-proxying `/api` to the API container. Lose HTTPS and the CDN; still get public URLs quickly.

Deployment shape is codified as a **runbook** (`docs/runbook/`) — no Terraform in v1.

### Image build host: EC2, not the laptop (v1)

The API image is built **on the EC2 instance**, not on a developer laptop. This is a deliberate v1 concession to the local environment described in [Known limitation](#known-limitation-phase-3-runtime-verification): building the image requires running `mvn package` inside a Java 21 container, and the local Docker engine cannot run Java 21 containers at all. So `docker build` fails locally before a push is even possible.

The instance therefore has two roles in v1: build host and runtime host. That is a known compromise, not a target state — Phase 5 moves the build to CI, after which the instance is runtime-only.

**The Dockerfiles are unchanged for this.** The same committed multi-stage `artofreacting-api/Dockerfile` is what EC2 builds; nothing about the image is specific to the build host.

**Push credentials are separated from the instance's runtime identity.** The instance profile is pull-only and never gains push rights. Instead, the operator mints a short-lived ECR authorization token with **their own** AWS identity and uses it to `docker login` on the instance for the push:

| Operation | Identity | Permissions | Lifetime |
| --------- | -------- | ----------- | -------- |
| `docker push` (build step, operator-driven) | operator's own AWS credentials, via `aws ecr get-login-password` run on the laptop | whatever the operator already has | token expires in 12 hours |
| `docker pull` (runtime, unattended) | EC2 instance profile | ECR read-only, scoped to this repository | rotated automatically by IMDS |

This works because an ECR authorization token carries the permissions of the identity that requested it, so the push privilege never has to exist on the instance. The result is that the locked pull-only IAM design survives intact: no push policy on the instance profile, no IAM user, and no static access keys anywhere. The cost is one manual copy of a token per build, which Phase 5 removes.

The frontend image is **not used on AWS** in the preferred path — the SPA is a static bundle in S3. `artofreacting/Dockerfile` exists for local compose parity and for the EC2 fallback above.

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
3. AWS baselines: ECR repo, IAM role/instance profile (pull-only), key pair, security group — [`runbook/aws-baseline.md`](./runbook/aws-baseline.md)
4. Launch EC2 + Elastic IP; user-data installs Docker and git — [`runbook/deploy-api.md`](./runbook/deploy-api.md)
5. On that instance: get the source, `docker build`, `docker push` to ECR with an operator-minted token, then `docker pull` back through the instance profile and run it; verify `http://<eip>/api/users`
6. Create S3 bucket, upload built frontend, create CloudFront with OAC and two behaviors; verify SPA loads and `/api/*` reaches EC2 — [`runbook/deploy-frontend.md`](./runbook/deploy-frontend.md)
7. (Phase 5) Add GitHub Actions for build/push/deploy; add Terraform once topology stops changing
8. (Later) Add a domain, ACM cert, Route 53

## Phase status

- [x] **Phase 0** — Foundation
- [x] **Phase 1** — Spring Boot API
- [x] **Phase 2** — React frontend
- [x] **Phase 3** — Dockerfiles + docker-compose (statically validated; local runtime verification blocked — see [Known limitation](#known-limitation-phase-3-runtime-verification))
- [ ] **Phase 4** — AWS deployment ([runbooks](./runbook/) written; not yet executed against AWS)
- [ ] **Phase 5** — CI/CD, then Terraform
