import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { fakeFetch, identityServer, json, renderWithApp } from '@/test/render'
import { MyPostsPage } from './MyPostsPage'

const t = createTranslator('vi')

describe('MyPostsPage', () => {
  it('lists posts with their status and the reason of a refusal, then marks the decisions as seen', async () => {
    let seen = 0
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        ...identityServer({ name: 'Linh', termsAccepted: true, hasRecoveryCode: true, unreadDecisions: 1 }).routes,
        'GET /api/v1/me/submissions': () =>
          json(200, {
            spots: [
              {
                id: 's1',
                name: 'Canal',
                photo_category: 'bridge',
                status: 'pending',
                lng: 2.36,
                lat: 48.87,
                created_at: 'x',
                decision: null,
              },
              {
                id: 's2',
                name: 'Quai',
                photo_category: 'street',
                status: 'rejected',
                lng: 2.35,
                lat: 48.85,
                created_at: 'x',
                decision: { action: 'reject', reason_code: 'duplicate', at: 'x' },
              },
            ],
            photos: [],
          }),
        'POST /api/v1/me/notifications/seen': () => {
          seen++
          return json(200, {})
        },
      }),
    )
    renderWithApp(<MyPostsPage />, { route: '/me/posts' })
    expect(await screen.findByRole('link', { name: 'Canal' })).toHaveAttribute('href', '/spots/s1')
    expect(screen.getByText(t('status.pending'))).toBeInTheDocument()
    // A refused spot cannot be opened any more: its name only, with the reason.
    expect(screen.queryByRole('link', { name: 'Quai' })).toBeNull()
    expect(screen.getByText(t('status.rejected'))).toBeInTheDocument()
    expect(screen.getByText(t('reason.duplicate'))).toBeInTheDocument()
    await waitFor(() => expect(seen).toBe(1))
  })
})
