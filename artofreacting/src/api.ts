import type { User } from './types'

/**
 * Relative on purpose. Every environment resolves `/api/*` through its own
 * proxy (Vite dev server, nginx, CloudFront), so this build is identical
 * everywhere and there is no CORS to configure.
 *
 * Do not turn this into an absolute URL or a `VITE_API_URL` env var.
 * See docs/architecture.md#same-origin-routing-design-rule
 */
const USERS_PATH = '/api/users'

const JSON_HEADERS = { Accept: 'application/json' }

/** An error the API reported as `{ "error": "...", "message": "..." }`. */
export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export async function listUsers(): Promise<User[]> {
  const response = await fetch(USERS_PATH, { headers: JSON_HEADERS })

  if (!response.ok) {
    throw await toApiError(response)
  }

  return (await response.json()) as User[]
}

export async function registerUser(username: string): Promise<User> {
  const response = await fetch(USERS_PATH, {
    method: 'POST',
    headers: { ...JSON_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  return (await response.json()) as User
}

/**
 * The API returns a consistent `{ error, message }` body for 4xx responses.
 * Anything else (5xx HTML, a dead proxy) falls back to a status-based message.
 */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown }

    if (typeof body?.message === 'string' && body.message.length > 0) {
      return new ApiError(typeof body.error === 'string' ? body.error : 'UNKNOWN', body.message)
    }
  } catch {
    // Body was absent or not JSON — fall through to the generic message.
  }

  return new ApiError('UNKNOWN', `The server responded with status ${response.status}.`)
}
