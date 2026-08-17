import { useCallback, useEffect, useState } from 'react'
import { listUsers, registerUser } from './api'
import { RegisterForm } from './components/RegisterForm'
import { UserList } from './components/UserList'
import { toMessage } from './errors'
import type { User } from './types'

export default function App() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      setUsers(newestFirst(await listUsers()))
    } catch (caught) {
      setLoadError(toMessage(caught, 'Could not reach the API.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRegister(username: string) {
    const created = await registerUser(username)

    if (loadError !== null) {
      // The list was never loaded, so appending would show a misleading
      // one-entry list. The API is clearly reachable now — fetch the real state.
      await load()
      return
    }

    setUsers((previous) => newestFirst([created, ...previous]))
  }

  return (
    <main className="app">
      <header>
        <h1>art-of-reacting</h1>
        <p className="muted">
          Register a username, see who is registered. Users live in memory and vanish when the API
          restarts.
        </p>
      </header>

      <section>
        <h2>Register</h2>
        <RegisterForm onRegister={handleRegister} />
      </section>

      <section>
        <h2>Registered users</h2>
        {loading ? (
          <p className="muted">Loading users…</p>
        ) : loadError !== null ? (
          <div className="error" role="alert">
            <p>{loadError}</p>
            <button type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <UserList users={users} />
        )}
      </section>
    </main>
  )
}

/**
 * The API returns users in `ConcurrentHashMap` iteration order, which is
 * arbitrary. Ordering is a presentation concern, so it happens here.
 */
function newestFirst(users: User[]): User[] {
  return [...users].sort((a, b) => createdAtMillis(b) - createdAtMillis(a))
}

function createdAtMillis(user: User): number {
  const parsed = Date.parse(user.createdAt)

  return Number.isNaN(parsed) ? 0 : parsed
}
