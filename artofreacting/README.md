# artofreacting

React + TypeScript frontend for art-of-reacting.

**Status:** Not yet implemented — arrives in **Phase 2**.

## Planned stack

- Vite (bundler + dev server)
- React 18+ with TypeScript
- Plain CSS / CSS Modules (no Tailwind, no UI component library)
- `fetch` for HTTP (no axios)
- Vitest + React Testing Library

## Planned surface

Single page with:
- A form to register a new user (username only)
- A list of currently registered users

## API contract

The frontend calls **relative** paths — `/api/users` — never an absolute URL. See [`../docs/architecture.md`](../docs/architecture.md#same-origin-routing-design-rule) for how each environment resolves `/api/*`.

Do not introduce a `VITE_API_URL` environment variable.
