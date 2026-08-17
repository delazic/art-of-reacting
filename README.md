# art-of-reacting

A deliberately-simple full-stack demo built to demonstrate **Docker packaging** and **AWS deployment** with sound engineering practices. Feature richness is explicitly **not** a goal — the deployment story and engineering discipline are the artifacts.

## What it does

Two operations, exposed by a tiny UI on top of a REST API:

1. **Register a user** (username only)
2. **List registered users**

Users are stored in memory. Data is lost on restart. This is intentional.

## Applications

| App                                          | Directory              | Stack                                       |
| -------------------------------------------- | ---------------------- | ------------------------------------------- |
| [Frontend](./artofreacting/README.md)        | `artofreacting/`       | React + TypeScript (Vite)                   |
| [Backend](./artofreacting-api/README.md)     | `artofreacting-api/`   | Java 21 + Spring Boot 3 + Maven             |

## Repository layout

```
art-of-reacting/
├── artofreacting/            # React + TS frontend                 (Phase 2)
│   ├── Dockerfile            #   node build → nginx runtime        (Phase 3)
│   └── nginx.conf            #   SPA serving + /api/* proxy        (Phase 3)
├── artofreacting-api/        # Spring Boot API                     (Phase 1)
│   └── Dockerfile            #   maven build → Temurin JRE runtime (Phase 3)
├── docker-compose.yml        # Local multi-container orchestration (Phase 3)
├── docs/
│   ├── architecture.md       # Single source of truth for the design
│   ├── adr/                  # Architecture Decision Records
│   └── runbook/              # AWS deployment runbooks             (Phase 4)
├── CLAUDE.md                 # Guidance for Claude Code sessions
├── README.md
└── .gitignore
```

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — full architectural design, scope, and deferred items
- [`docs/adr/`](./docs/adr/) — Architecture Decision Records
- [`docs/runbook/`](./docs/runbook/) — AWS deployment runbooks (from Phase 4)
- [`CLAUDE.md`](./CLAUDE.md) — constraints and working rules for AI-assisted development

## What v1 does NOT include

Deliberately excluded — see [`docs/architecture.md`](./docs/architecture.md) for the reasoning:

- No database, ORM, or migrations
- No authentication, sessions, or user accounts
- No cache (Redis or otherwise)
- No container orchestrator (ECS, Fargate, EKS)
- No load balancer, auto-scaling group, or multi-AZ setup
- No Terraform in v1 — runbook-first, codified later

## Deployment target

AWS region **`eu-west-1`** (Ireland).

- Backend: Docker image in ECR, pulled and run on a single EC2 instance
- Frontend: static bundle in S3 (private, OAC), served through CloudFront
- Same CloudFront distribution routes `/api/*` to the EC2 origin — one origin per environment for the browser, no CORS

## Phase status

- [x] **Phase 0** — Foundation: repo scaffold, docs, `.gitignore`, `CLAUDE.md`
- [x] **Phase 1** — Spring Boot API (endpoints, in-memory repo, tests)
- [x] **Phase 2** — React frontend (register form, user list, Vite proxy)
- [x] **Phase 3** — Dockerfiles + `docker-compose.yml` — statically validated; local runtime verification blocked by an obsolete local Docker engine, see [known limitation](./docs/architecture.md#known-limitation-phase-3-runtime-verification)
- [ ] **Phase 4** — AWS deployment via documented runbook
- [ ] **Phase 5** — CI/CD, then Terraform

## Opening the app in a browser

One rule holds in every environment: **open the frontend's URL, never the API's.** The frontend requests relative `/api/*` paths, and whatever serves the page also proxies those paths to the API. There is no second URL to configure and no CORS to enable.

| Environment | Open this in a browser | What resolves `/api/*` |
| ----------- | ---------------------- | ---------------------- |
| Local dev (Phase 2) | <http://localhost:5173> | Vite dev proxy → `localhost:8080` |
| `docker compose up` (Phase 3) | <http://localhost/> or <http://192.168.99.100/> | nginx in the `web` container → `api:8080` |
| AWS, preferred (Phase 4) | `https://<distribution-id>.cloudfront.net` | CloudFront `/api/*` behavior → EC2 origin |
| AWS, fallback (Phase 4) | `http://<elastic-ip>` | nginx on the EC2 host → API container |

To check the API on its own, request a path rather than expecting a UI — `http://localhost:8080/api/users` in dev returns JSON, and `http://localhost:8080/` returns a 404 because the API serves no pages.

### Local development

Two independent processes, each hot-reloading. The browser only ever talks to `:5173`; Vite proxies `/api/*` to the API.

```powershell
# Terminal 1 — API on :8080
cd artofreacting-api ; .\mvnw spring-boot:run

# Terminal 2 — frontend on :5173
cd artofreacting ; npm install ; npm run dev
```

Then open <http://localhost:5173>. Register a username and it appears in the list below the form. With the API stopped, the page still loads and shows "Could not reach the API." with a **Try again** button.

Tests:

```powershell
cd artofreacting-api ; .\mvnw test
cd artofreacting ; npm test
```

### Both apps in containers

A parity check against production packaging, not the inner loop — there is no hot reload here, so rebuild after changing code.

This repo's reference environment runs Docker Engine in a Docker Machine VirtualBox VM (no Docker Desktop, no WSL2), so the Docker CLI needs pointing at that VM once per shell:

```powershell
docker-machine start default                                    # if it is not already running
docker-machine env default --shell powershell | Invoke-Expression
docker compose up --build
```

Then open <http://localhost/> — or <http://192.168.99.100/>, the VM's own address, which `docker-machine ip default` prints. Only the `web` container publishes a port; the API is reachable only from inside the compose network, exactly as on AWS. Stop with `docker compose down`.

The published port binds inside the VM rather than on Windows, so `localhost` works here only because a VirtualBox NAT rule forwards `127.0.0.1:80 → VM:80`. That is also why `web` publishes port 80 rather than 3000. See [`docs/architecture.md`](./docs/architecture.md#docker-machine--virtualbox-on-windows) for the full set of consequences, including why compose declares no bind mounts.

> **Heads-up:** on the current local engine (Docker 19.03.12 / Boot2Docker, kernel 4.19.130) the Java 21 container fails to start with `pthread_create failed (EPERM)`. That is a limitation of that engine, not of this configuration, and the Docker files are deliberately **not** adapted to it — see [known limitation](./docs/architecture.md#known-limitation-phase-3-runtime-verification). The API image is verified for real on EC2 in Phase 4.

### On AWS (from Phase 4)

The browser URL is an output of deployment, not something configured in the app. Once the runbooks exist, retrieve it with:

```powershell
# Preferred: the CloudFront domain (serves the SPA and proxies /api/* to EC2)
aws cloudfront list-distributions --region eu-west-1 --query "DistributionList.Items[].DomainName"

# Fallback: the EC2 Elastic IP
aws ec2 describe-addresses --region eu-west-1 --query "Addresses[].PublicIp"
```

See [`docs/architecture.md`](./docs/architecture.md#local-development) for the reasoning behind this layout, and [`docs/runbook/`](./docs/runbook/) for the deployment procedures.
