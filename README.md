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
├── artofreacting-api/        # Spring Boot API                     (Phase 1)
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
- [ ] **Phase 1** — Spring Boot API (endpoints, in-memory repo, tests)
- [ ] **Phase 2** — React frontend (register form, user list, Vite proxy)
- [ ] **Phase 3** — Dockerfiles + `docker-compose.yml`
- [ ] **Phase 4** — AWS deployment via documented runbook
- [ ] **Phase 5** — CI/CD, then Terraform

## Local development

Not yet available — arrives in Phase 1 (API) and Phase 2 (frontend). See [`docs/architecture.md`](./docs/architecture.md#local-development) for the planned workflow.
