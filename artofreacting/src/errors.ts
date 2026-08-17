import { ApiError } from './api'

/**
 * Turns anything thrown by the api module into something worth showing a user.
 * `fetch` rejects with a bare `TypeError` when the request never reached the
 * server, and "Failed to fetch" is not a useful thing to render.
 */
export function toMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message
  }

  return fallback
}
