# Architecture Decision Records

Short, immutable records of significant architectural decisions.

## When to write an ADR

Write one when a decision:

- Constrains future work in a non-obvious way
- Was contested or has a real alternative
- Is expensive to reverse

Do **not** write an ADR for style-level choices, obvious defaults, or ephemeral implementation details.

## How to write one

1. Copy [`template.md`](./template.md) to `NNNN-short-slug.md`, using the next number
2. Fill in **Context**, **Decision**, **Consequences**
3. Set **Status** to `Accepted`
4. Never edit an accepted ADR to change the decision — write a new ADR that **supersedes** the old one, and mark the old one `Superseded by ADR-NNNN`

## Index

| # | Title | Status |
| - | ----- | ------ |
| [0001](./0001-deliberately-simple-v1.md) | Deliberately simple v1: no DB, no auth, in-memory storage | Accepted |
