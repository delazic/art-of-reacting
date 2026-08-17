import { useState, type FormEvent } from 'react'
import { toMessage } from '../errors'

type RegisterFormProps = {
  /** Rejects when registration failed; the rejection is shown to the user. */
  onRegister: (username: string) => Promise<void>
}

/** Server-side rule, mirrored only as an input cap. The API stays the authority. */
const MAX_USERNAME_LENGTH = 50

export function RegisterForm({ onRegister }: RegisterFormProps) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const trimmed = username.trim()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await onRegister(trimmed)
      setUsername('')
    } catch (caught) {
      setError(toMessage(caught, 'Could not reach the API. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="register-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="username">Username</label>
      <div className="register-form__row">
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="off"
          maxLength={MAX_USERNAME_LENGTH}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={submitting}
          aria-describedby={error ? 'register-error' : undefined}
        />
        <button type="submit" disabled={submitting || trimmed === ''}>
          {submitting ? 'Registering…' : 'Register'}
        </button>
      </div>
      {error !== null && (
        <p className="error" id="register-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
