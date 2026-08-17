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

## Opening it in a browser

Start the API first — the dev server expects it on `http://localhost:8080`:

```powershell
cd ..\artofreacting-api ; .\mvnw spring-boot:run
```

Then, with `npm run dev` running, open <http://localhost:5173>.

Open the **frontend** URL, not the API's. `http://localhost:8080/api/users` returns raw JSON and `http://localhost:8080/` returns 404 — the API serves no pages. The page you load at `:5173` fetches `/api/users` from `:5173`, and Vite forwards it. Same shape in every other environment; see the table in the [root README](../README.md#opening-the-app-in-a-browser).

Without the API running, the page still loads and shows "Could not reach the API." with a **Try again** button.

`npm run preview` (<http://localhost:4173>) serves the built bundle but has **no** `/api` proxy — the dev proxy is a dev-server feature. To exercise a production build against the API, use `docker compose up --build` from the repository root and open <http://localhost:3000>.

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
