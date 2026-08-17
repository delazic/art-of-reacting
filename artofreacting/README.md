# artofreacting

React + TypeScript frontend for art-of-reacting.

**Status:** Implemented in **Phase 2**.

## Stack

- Vite (bundler + dev server)
- React 18 with TypeScript (strict)
- Plain CSS (no Tailwind, no UI component library)
- `fetch` for HTTP (no axios)
- Vitest + React Testing Library, `fetch` mocked at the boundary

No router, no state library, no data-fetching library — one page, two operations.

## Commands

```powershell
npm install        # once, after cloning
npm run dev        # Vite dev server on http://localhost:5173
npm test           # Vitest, single run
npm run test:watch # Vitest, watch mode
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the built bundle
```

The dev server expects the API on `http://localhost:8080`:

```powershell
cd ..\artofreacting-api ; .\mvnw spring-boot:run
```

Without the API running, the page loads and shows "Could not reach the API." with a **Try again** button.

## Surface

Single page:

- A form to register a new user (username only)
- A list of registered users, newest first

The API returns users in `ConcurrentHashMap` iteration order, which is arbitrary, so ordering is applied client-side in `App.tsx`.

## API contract

The frontend calls **relative** paths — `/api/users` — never an absolute URL. See [`../docs/architecture.md`](../docs/architecture.md#same-origin-routing-design-rule) for how each environment resolves `/api/*`. In dev, `vite.config.ts` proxies `/api` → `http://localhost:8080`.

Do not introduce a `VITE_API_URL` environment variable.

Errors come back as `{ "error": "CODE", "message": "..." }`; `src/api.ts` turns those into an `ApiError` and the UI shows the server's `message` verbatim — the API is the authority on validation (3–50 characters) and uniqueness (case-insensitive).

## Layout

```
artofreacting/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts            # dev proxy + Vitest config
└── src/
    ├── main.tsx              # mounts App
    ├── App.tsx               # load / register / order state
    ├── api.ts                # the only place that knows about /api/users
    ├── errors.ts             # thrown value → user-facing message
    ├── types.ts              # User, mirroring the API record
    ├── styles.css
    ├── components/
    │   ├── RegisterForm.tsx
    │   └── UserList.tsx
    └── test/
        ├── setup.ts          # jest-dom matchers + cleanup
        └── http.ts           # fetch stub + fake responses
```
