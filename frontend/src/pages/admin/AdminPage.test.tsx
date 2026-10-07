import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { fakeFetch, identityServer, json, renderWithApp } from '@/test/render'
import AdminPage from './AdminPage'

const t = createTranslator('vi')
const user = (over: Record<string, unknown>) => ({
  id: 'u1',
  name: 'Minh',
  email: 'minh@team.example',
  username: null,
  role: 'participant',
  is_anonymous: false,
  posting_suspended_until: null,
  created_at: '2026-10-01T00:00:00Z',
  spots: 2,
  photos: 5,
  ...over,
})

function renderAdmin(role: 'reviewer' | 'admin', setRole?: () => Response) {
  const calls: { path: string; body: unknown }[] = []
  const record = (path: string) => (_url: URL, init: RequestInit | undefined) => {
    calls.push({ path, body: JSON.parse(String(init?.body)) })
    return path === '/set-role' && setRole ? setRole() : json(200, {})
  }
  vi.stubGlobal(
    'fetch',
    fakeFetch({
      ...identityServer({ name: 'Admin', termsAccepted: true, hasRecoveryCode: true, role }).routes,
      'POST /api/v1/admin/users/list': () =>
        json(200, {
          items: [
            user({}),
            user({ id: 'u2', name: 'Lữ khách 1234', email: null, is_anonymous: true }),
            user({ id: 'u3', name: 'Linh', email: null, username: 'linh', role: 'reviewer' }),
          ],
          total: 2,
          offset: 0,
          limit: 50,
        }),
      'POST /api/v1/admin/users/set-role': record('/set-role'),
      'POST /api/v1/admin/users/suspend': record('/suspend'),
      'POST /api/v1/admin/users/delete': record('/delete'),
    }),
  )
  const u = userEvent.setup()
  renderWithApp(<AdminPage />, { route: '/admin' })
  return { user: u, calls }
}

describe('AdminPage', () => {
  it('reviewers are told the page is for admins only', async () => {
    renderAdmin('reviewer')
    expect(await screen.findByText(t('admin.adminOnly'))).toBeInTheDocument()
  })

  it('lists users; an anonymous identity cannot be given a staff role', async () => {
    renderAdmin('admin')
    const anon = await screen.findByRole('listitem', { name: 'Lữ khách 1234' })
    expect(anon).toHaveTextContent(t('account.anonymous'))
    const select = within(anon).getByLabelText(t('admin.roleOf', { name: 'Lữ khách 1234' }))
    expect(within(select).getByRole('option', { name: t('role.reviewer') })).toBeDisabled()
    const minh = screen.getByRole('listitem', { name: 'Minh' })
    expect(minh).toHaveTextContent('minh@team.example')
    expect(minh).toHaveTextContent(t('admin.counts', { spots: 2, photos: 5 }))
    expect(screen.getByRole('listitem', { name: 'Linh' })).toHaveTextContent('@linh')
  })

  it('changing a role calls the API; a refusal (last admin) is shown', async () => {
    const { user: u, calls } = renderAdmin('admin', () =>
      json(409, { error: { code: 'LAST_ADMIN', message: 'last', status: 409 } }),
    )
    const minh = await screen.findByRole('listitem', { name: 'Minh' })
    await u.selectOptions(within(minh).getByLabelText(t('admin.roleOf', { name: 'Minh' })), 'reviewer')
    await waitFor(() => expect(calls).toEqual([{ path: '/set-role', body: { user_id: 'u1', role: 'reviewer' } }]))
    expect(await screen.findByRole('alert')).toHaveTextContent(t('errors.LAST_ADMIN'))
  })

  it('deleting an account asks for confirmation first', async () => {
    const { user: u, calls } = renderAdmin('admin')
    const minh = await screen.findByRole('listitem', { name: 'Minh' })
    await u.click(within(minh).getByRole('button', { name: t('admin.delete') }))
    const dialog = screen.getByRole('dialog', { name: t('admin.deleteTitle', { name: 'Minh' }) })
    expect(dialog).toHaveTextContent(t('admin.deleteWarning'))
    expect(calls).toEqual([])
    await u.click(within(dialog).getByRole('button', { name: t('admin.deleteConfirm') }))
    await waitFor(() => expect(calls).toEqual([{ path: '/delete', body: { user_id: 'u1' } }]))
  })

  it('suspends for 30 days', async () => {
    const { user: u, calls } = renderAdmin('admin')
    const minh = await screen.findByRole('listitem', { name: 'Minh' })
    await u.click(within(minh).getByRole('button', { name: t('admin.suspend30') }))
    await waitFor(() => expect(calls).toHaveLength(1))
    const { until } = calls[0]?.body as { until: string }
    const days = (new Date(until).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })
})
