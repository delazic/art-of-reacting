# ADR-0001: Deliberately simple v1 — no DB, no auth, in-memory storage

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

art-of-reacting is a demonstration project. Its stated goals are (1) sound engineering practices, (2) Docker packaging, (3) AWS deployment. Feature richness is not a goal.

An earlier proposal added Postgres/RDS, Drizzle, authentication, TanStack Query, Tailwind, and Fargate — a plausible "real" stack. That proposal was rejected because those pieces obscure the demo's actual value: showing the minimum viable pipeline from source → container → AWS end-to-end.

## Decision

For v1, art-of-reacting has:

- **Two operations only**: register a user, list users
- **User model**: `{ id, username, createdAt }` — username only, no email or profile fields
- **Storage**: `ConcurrentHashMap` behind a `UserRepository` interface. Data is lost on restart
- **No database** of any kind (Postgres, RDS, DynamoDB, H2, SQLite)
- **No ORM**, no JPA/Hibernate, no migrations (Flyway/Liquibase)
- **No authentication**, no user accounts/sessions, no Cognito/Auth0/JWT, no Spring Security
- **No cache** (Redis or otherwise) — the in-memory map *is* the store
- **No orchestrator** (ECS/Fargate/EKS) — one API container, one EC2

The `UserRepository` interface is a deliberate exception to the "no abstraction without a second implementation" rule. Its purpose is to make a future JDBC swap cheap when the demo evolves past v1.

## Consequences

**Easier:**
- Deployment story fits in a single runbook page
- No secrets to manage in v1
- No schema migrations to coordinate with releases
- Contributors can read the whole app in an afternoon

**Harder:**
- Data does not survive process restart — must be documented on the UI (or at least the README) so users are not surprised
- Uniqueness check on username is a compare-and-put on the in-memory map, not a DB constraint — safe for a demo, honest about what it is
- Adding auth or persistence later is a real (but bounded) project, tracked by a superseding ADR

**Off the table** (require a new ADR to reopen):
- Any database or ORM
- Any auth provider
- Any cache
- Any container orchestrator beyond single-container-on-EC2
