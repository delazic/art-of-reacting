import { describe, expect, it } from 'vitest'
import { ApiError, listUsers, registerUser } from './api'
import { jsonResponse, nonJsonResponse, stubFetch } from './test/http'

const alice = { id: 'ecc4d0f6-0e1a-4c3f-9f4f-8f5a2f0f1a11', username: 'alice', createdAt: '2026-08-16T10:15:30Z' }

describe('listUsers', () => {
  it('GETs the relative /api/users path', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []))

    await listUsers()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/users')
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined()
  })

  it('returns the users the API sent', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [alice]))

    await expect(listUsers()).resolves.toEqual([alice])
  })

  it('throws the message from the API error body', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: 'INTERNAL_ERROR', message: 'Something broke' }),
    )

    await expect(listUsers()).rejects.toThrow('Something broke')
  })
})

describe('registerUser', () => {
  it('POSTs the username as JSON to the relative path', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(201, alice))

    await expect(registerUser('alice')).resolves.toEqual(alice)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/users')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ username: 'alice' })
  })

  it('reports a taken username with the API code and message', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: 'USERNAME_TAKEN', message: 'Username is already registered' }),
    )

    await expect(registerUser('alice')).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
      message: 'Username is already registered',
    })
  })

  it('reports a validation failure', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'Username must contain between 3 and 50 characters',
      }),
    )

    await expect(registerUser('ab')).rejects.toThrow(
      'Username must contain between 3 and 50 characters',
    )
  })

  it('falls back to a status message when the body is not JSON', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValueOnce(nonJsonResponse(502))

    await expect(registerUser('alice')).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'The server responded with status 502.',
    })
  })

  it('lets a transport failure through as-is, not as an ApiError', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(registerUser('alice')).rejects.not.toBeInstanceOf(ApiError)
  })
})
