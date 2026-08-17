import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserList } from './UserList'
import type { User } from '../types'

const users: User[] = [
  { id: 'a', username: 'alice', createdAt: '2026-08-16T10:15:30Z' },
  { id: 'b', username: 'bob', createdAt: '2026-08-16T12:00:00Z' },
]

describe('UserList', () => {
  it('shows an empty state when nobody is registered', () => {
    render(<UserList users={[]} />)

    expect(screen.getByText('No users registered yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders one entry per user, in the order given', () => {
    render(<UserList users={users} />)

    const entries = screen.getAllByRole('listitem')

    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('alice')
    expect(entries[1]).toHaveTextContent('bob')
  })

  it('keeps the raw timestamp machine-readable regardless of locale formatting', () => {
    const { container } = render(<UserList users={users} />)

    const timestamps = [...container.querySelectorAll('time')].map((element) =>
      element.getAttribute('datetime'),
    )

    expect(timestamps).toEqual(['2026-08-16T10:15:30Z', '2026-08-16T12:00:00Z'])
  })
})
