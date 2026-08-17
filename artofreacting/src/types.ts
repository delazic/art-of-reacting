/** Mirrors the API's `User` record (see artofreacting-api). */
export type User = {
  /** Server-generated UUID. */
  id: string
  username: string
  /** Server-generated ISO-8601 instant, e.g. `2026-08-17T09:41:12.345Z`. */
  createdAt: string
}
