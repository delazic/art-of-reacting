# Documentation

Living documentation for art-of-reacting. This is the entry point.

## Contents

| File | Purpose |
| ---- | ------- |
| [`architecture.md`](./architecture.md) | Single source of truth for the system design, scope, tech choices, and deferred items. Update this whenever a structural decision changes. |
| [`adr/`](./adr/) | Architecture Decision Records — one file per significant, reversible-with-consequences decision. |
| [`runbook/`](./runbook/) | AWS deployment runbooks — added in Phase 4 (initial deploy) and updated each time the deployment shape changes. |

## Conventions

- Prefer editing an existing doc over adding a parallel one.
- When a design decision is overturned, record it as a new ADR (do not silently edit the old one) and update `architecture.md` and `CLAUDE.md` in the same change.
- Keep `architecture.md` skimmable — link out to ADRs for reasoning.
