import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RegisterForm } from './RegisterForm'
import { ApiError } from '../api'

const submitButton = () => screen.getByRole('button', { name: /register/i })

describe('RegisterForm', () => {
  it('cannot be submitted while the username is blank', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn().mockResolvedValue(undefined)
    render(<RegisterForm onRegister={onRegister} />)

    expect(submitButton()).toBeDisabled()

    await user.type(screen.getByLabelText('Username'), '   ')

    expect(submitButton()).toBeDisabled()
    expect(onRegister).not.toHaveBeenCalled()
  })

  it('submits the trimmed username and clears the input', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn().mockResolvedValue(undefined)
    render(<RegisterForm onRegister={onRegister} />)

    const input = screen.getByLabelText('Username')
    await user.type(input, '  alice  ')
    await user.click(submitButton())

    expect(onRegister).toHaveBeenCalledTimes(1)
    expect(onRegister).toHaveBeenCalledWith('alice')
    expect(input).toHaveValue('')
  })

  it('shows the API message and keeps the value when registration fails', async () => {
    const user = userEvent.setup()
    const onRegister = vi
      .fn()
      .mockRejectedValue(new ApiError('USERNAME_TAKEN', 'Username is already registered'))
    render(<RegisterForm onRegister={onRegister} />)

    const input = screen.getByLabelText('Username')
    await user.type(input, 'alice')
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Username is already registered')
    expect(input).toHaveValue('alice')
    expect(submitButton()).toBeEnabled()
  })

  it('reports an unreachable API in plain language', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    render(<RegisterForm onRegister={onRegister} />)

    await user.type(screen.getByLabelText('Username'), 'alice')
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the API. Please try again.',
    )
  })

  it('clears a previous error on the next attempt', async () => {
    const user = userEvent.setup()
    const onRegister = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('USERNAME_TAKEN', 'Username is already registered'))
      .mockResolvedValueOnce(undefined)
    render(<RegisterForm onRegister={onRegister} />)

    const input = screen.getByLabelText('Username')
    await user.type(input, 'alice')
    await user.click(submitButton())
    await screen.findByRole('alert')

    await user.clear(input)
    await user.type(input, 'bob')
    await user.click(submitButton())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
