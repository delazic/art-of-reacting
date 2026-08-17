import { vi } from 'vitest'

/**
 * Installs a fake `fetch` on globalThis; `setup.ts` removes it after each test.
 * Mocking at the `fetch` boundary keeps the tests honest about the wire format
 * without pulling in a mock-server dependency.
 */
export function stubFetch() {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

/** Minimal stand-in for a real `Response` — only what the api module touches. */
export function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

/** A failure whose body is not JSON at all — e.g. a proxy returning HTML. */
export function nonJsonResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0')
    },
  } as unknown as Response
}
