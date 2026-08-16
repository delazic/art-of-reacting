# CLAUDE.md

Guidance for Claude Code when working in this repository. Read this first every session.

## Project intent

art-of-reacting is a **deliberately-simple full-stack demo** whose purpose is to teach Docker packaging + AWS deployment + sound engineering practices. The deployment story and engineering discipline are the artifacts, **not** the app itself. Feature richness is not a goal.

If you are tempted to add complexity "because a real app would have it" — stop. The value here is showing the minimum viable pipeline end-to-end. See [`docs/architecture.md`](./docs/architecture.md).

## Locked scope (v1)

Two apps in one repo:

- `artofreacting/` — React + TypeScript SPA (Vite)
- `artofreacting-api/` — Java 21 + Spring Boot 3 + Maven

Two operations only: **register a user** and **list registered users**.

User model: `{ id: UUID, username: string, createdAt: timestamp }` — **username only**, no email/name.

Storage: `ConcurrentHashMap` behind a `UserRepository` interface. Data is lost on restart — this is intentional and documented.

## Do NOT add without explicit user approval

- Any database (Postgres, RDS, DynamoDB, H2, SQLite)
- Any ORM, JPA/Hibernate, migrations (Flyway/Liquibase)
- Authentication (Cognito, Auth0, JWT, sessions, Spring Security)
- Redis or any cache
- ECS, Fargate, EKS, or any container orchestrator
- ALB, Auto Scaling Group, multi-AZ setup
- Route 53, ACM (until a real domain is chosen)
- Terraform (runbook-first for v1 — codify infra later once stable)
- GitHub Actions / any CI/CD (Phase 5+)
- Tailwind, shadcn, MUI, or any UI component library
- React Router, Redux, TanStack Query, Zustand, axios
- Lombok
- Monorepo tooling (npm workspaces, Nx, Turborepo)

The `UserRepository` interface is a **deliberate** exception to the "no abstraction without a second implementation" rule — its purpose is to make the future JDBC swap trivial.

## Design rules

- **Same-origin routing:** the frontend always calls **relative** paths (`/api/*`). Each environment resolves that path via its own proxy (Vite dev proxy → `localhost:8080`; docker-compose nginx → `api:8080`; CloudFront behavior → EC2 origin). **Never** introduce a `VITE_API_URL` env var or a hard-coded absolute API URL in the frontend.
- **AWS region:** `eu-west-1` everywhere in docs, config, and code.
- **Simplicity mandate:** before adding a dependency, framework, Spring starter, or AWS service, justify it against a concrete v1 requirement. "It's the standard choice" or "we'll probably need it later" are not valid justifications. Removing complexity later is much harder than deferring it.

## Repository layout

```
art-of-reacting/
├── artofreacting/            # React + TS frontend                 (Phase 2)
├── artofreacting-api/        # Spring Boot API                     (Phase 1)
├── docker-compose.yml        # Local multi-container run           (Phase 3)
├── docs/
│   ├── architecture.md       # Single source of truth for the design
│   ├── adr/                  # Architecture Decision Records
│   └── runbook/              # AWS deployment runbooks             (Phase 4)
├── CLAUDE.md
├── README.md
└── .gitignore
```

## Phased delivery

Do not implement Phase N+1 while Phase N is under review.

- **Phase 0** — Foundation (this scaffold)
- **Phase 1** — Spring Boot API
- **Phase 2** — React frontend
- **Phase 3** — Dockerfiles + docker-compose
- **Phase 4** — AWS deployment via documented runbook
- **Phase 5** — CI/CD, then Terraform

## Working rules

- **Ask before doing anything with real-world side effects.** Never run `git commit`, `git push`, `docker build`, `docker push`, `aws …` (create/modify), `terraform apply`, or `mvn install`/`npm install` unless the user explicitly asks in the current turn.
- **Read [`docs/architecture.md`](./docs/architecture.md) first** before proposing structural or infra changes. If you propose a change, update that doc in the same turn — do not leave parallel/stale documents.
- **ADRs for reversal-of-decisions.** If we agree to change a locked choice (e.g. introduce a DB), record it as a new ADR in `docs/adr/` and update `CLAUDE.md` and `docs/architecture.md` in the same turn.
- **Windows environment.** The primary shell is PowerShell (with Bash also available). Prefer commands that work in both; when they diverge, PowerShell wins.
- **Prefer editing existing docs** over creating parallel ones.
