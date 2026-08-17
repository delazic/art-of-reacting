import type { User } from '../types'

type UserListProps = {
  users: User[]
}

export function UserList({ users }: UserListProps) {
  if (users.length === 0) {
    return <p className="muted">No users registered yet.</p>
  }

  return (
    <ul className="user-list">
      {users.map((user) => (
        <li key={user.id}>
          <span className="user-list__name">{user.username}</span>
          <time className="user-list__time" dateTime={user.createdAt}>
            {formatCreatedAt(user.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  )
}

/** Falls back to the raw value if the API ever sends something unparseable. */
function formatCreatedAt(createdAt: string): string {
  const parsed = new Date(createdAt)

  return Number.isNaN(parsed.getTime()) ? createdAt : parsed.toLocaleString()
}
