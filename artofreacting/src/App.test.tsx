import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { jsonResponse, stubFetch } from './test/http'

const alice = { id: 'a', username: 'alice', createdAt: '2026-08-16T10:15:30Z' }
const bob = { id: 'b', username: 'bob', createdAt: '2026-08-16T12:00:00Z' }

describe('App', () => {
  it('loads the registered users on mount', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValue(jsonResponse(200, [alice]))
    render(<App />)

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/users')
  })

  it('orders users newest first, whatever order the API returned', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValue(jsonResponse(200, [alice, bob]))
    render(<App />)

    await screen.findByText('alice')
    const entries = screen.getAllByRole('listitem')

    expect(entries[0]).toHaveTextContent('bob')
    expect(entries[1]).toHaveTextContent('alice')
  })

  it('shows the empty state when no users are registered', async () => {
    const fetchMock = stubFetch()
    fetchMock.mockResolvedValue(jsonResponse(200, []))
    render(<App />)

    expect(await screen.findByText('No users registered yet.')).toBeInTheDocument()
  })

  it('adds a newly registered user to the list without refetching', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [alice]))
      .mockResolvedValueOnce(jsonResponse(201, bob))
    render(<App />)
    await screen.findByText('alice')

    await user.type(screen.getByLabelText('Username'), 'bob')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByText('bob')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the existing list when registration is rejected', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [alice]))
      .mockResolvedValueOnce(
        jsonResponse(409, { error: 'USERNAME_TAKEN', message: 'Username is already registered' }),
      )
    render(<App />)
    await screen.findByText('alice')

    await user.type(screen.getByLabelText('Username'), 'alice')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Username is already registered')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('offers a retry when the API is unreachable at first paint', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch()
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, [alice]))
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the API.')

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
