import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { currentLocation, fakeFetch, identityServer, renderWithApp } from '@/test/render'
import { StaffSignInPage } from './StaffSignInPage'

const t = createTranslator('vi')

function renderPage() {
  const identity = identityServer(null)
  vi.stubGlobal('fetch', fakeFetch(identity.routes))
  const user = userEvent.setup()
  renderWithApp(<StaffSignInPage />, { route: '/staff/sign-in' })
  const fill = async (username: string, password: string) => {
    await user.type(screen.getByLabelText(t('staff.username')), username)
    await user.type(screen.getByLabelText(t('staff.password')), password)
    await user.click(screen.getByRole('button', { name: t('staff.submit') }))
  }
  return { user, identity, fill }
}

const path = () => currentLocation(screen.getByTestId('location')).path

describe('StaffSignInPage', () => {
  it('asks for a username and a password (browser password managers can fill them)', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: t('staff.title') })).toBeInTheDocument()
    expect(screen.getByLabelText(t('staff.username'))).toHaveAttribute('autocomplete', 'username')
    const password = screen.getByLabelText(t('staff.password'))
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('button', { name: t('staff.submit') })).toBeDisabled()
  })

  it('an admin lands on the admin page', async () => {
    const { identity, fill } = renderPage()
    await fill('Admin', 'admin')
    await waitFor(() => expect(path()).toBe('/admin'))
    expect(identity.calls).toEqual(['sign-in/username Admin'])
  })

  it('a reviewer lands on the review queue', async () => {
    const { fill } = renderPage()
    await fill('linh', 'secret pass')
    await waitFor(() => expect(path()).toBe('/review'))
  })

  it('a wrong password says so, without saying which part was wrong, and clears the password', async () => {
    const { fill } = renderPage()
    await fill('admin', 'nope')
    expect(await screen.findByRole('alert')).toHaveTextContent(t('errors.INVALID_USERNAME_OR_PASSWORD'))
    expect(screen.getByLabelText(t('staff.password'))).toHaveValue('')
    expect(screen.getByLabelText(t('staff.username'))).toHaveValue('admin')
    expect(path()).toBe('/staff/sign-in')
  })

  it('a malformed username gets the same message (no hint about how usernames look)', async () => {
    const { fill } = renderPage()
    await fill('ab', 'whatever')
    expect(await screen.findByRole('alert')).toHaveTextContent(t('errors.INVALID_USERNAME_OR_PASSWORD'))
  })

  it('too many attempts: asks to wait', async () => {
    const { fill } = renderPage()
    await fill('flood', 'x')
    expect(await screen.findByRole('alert')).toHaveTextContent(t('errors.RATE_LIMITED'))
  })
})
