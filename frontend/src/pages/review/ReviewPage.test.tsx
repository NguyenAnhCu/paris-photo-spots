import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { fakeFetch, identityServer, json, renderWithApp } from '@/test/render'
import ReviewPage from './ReviewPage'

const t = createTranslator('vi')
const author = { id: 'u9', name: 'Lữ khách 1234', is_anonymous: true, approved: 0, rejected: 2, suspended_until: null }
const photo = {
  id: 'p1',
  spot_id: 's1',
  spot_name: 'Pont Neuf',
  url: '/media/photos/p1.jpg',
  thumb_url: '/media/photos/p1_thumb.jpg',
  focal: '35mm',
  aperture: null,
  shutter: null,
  iso: null,
  camera: null,
  gps_distance: 'far',
  duplicate_of: 'p0',
  created_at: '2026-10-07T10:00:00Z',
  author,
}
const queue = (items: unknown[]) => json(200, { items, total: items.length, offset: 0, limit: 20 })

function renderReview(role: 'participant' | 'reviewer') {
  const decisions: unknown[] = []
  const suspensions: unknown[] = []
  let photos: unknown[] = [photo]
  vi.stubGlobal(
    'fetch',
    fakeFetch({
      ...identityServer({ name: 'Linh', termsAccepted: true, hasRecoveryCode: true, role }).routes,
      'POST /api/v1/moderation/queue/list': (_url, init) => {
        const { kind } = JSON.parse(String(init?.body)) as { kind: string }
        return queue(kind === 'photo' ? photos : [])
      },
      'POST /api/v1/moderation/decide': (_url, init) => {
        decisions.push(JSON.parse(String(init?.body)))
        photos = []
        return json(200, { status: 'approved' })
      },
      'POST /api/v1/moderation/suspend': (_url, init) => {
        suspensions.push(JSON.parse(String(init?.body)))
        return json(200, { posting_suspended_until: '2026-10-10T00:00:00Z' })
      },
    }),
  )
  const user = userEvent.setup()
  renderWithApp(<ReviewPage />, { route: '/review' })
  return { user, decisions, suspensions }
}

describe('ReviewPage', () => {
  it('participants get a staff-only message and a link to the staff sign-in', async () => {
    renderReview('participant')
    expect(await screen.findByText(t('review.staffOnly'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t('staff.title') })).toHaveAttribute('href', '/staff/sign-in')
  })

  it('shows pending photos with the reviewer hints (author history, GPS far, possible duplicate)', async () => {
    renderReview('reviewer')
    const card = await screen.findByRole('article', { name: 'Pont Neuf' })
    expect(card).toHaveTextContent('Lữ khách 1234')
    expect(card).toHaveTextContent(t('review.history', { approved: 0, rejected: 2 }))
    expect(card).toHaveTextContent(t('review.gps.far'))
    expect(card).toHaveTextContent(t('review.duplicatePhoto'))
    expect(screen.getByRole('tab', { name: `${t('review.tab.photo')} (1)` })).toHaveAttribute('aria-selected', 'true')
  })

  it('reject sends the chosen reason; the item leaves the queue', async () => {
    const { user, decisions } = renderReview('reviewer')
    const card = await screen.findByRole('article', { name: 'Pont Neuf' })
    await user.selectOptions(within(card).getByLabelText(t('review.reason')), 'people_identifiable')
    await user.click(within(card).getByRole('button', { name: t('review.reject') }))
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull())
    expect(decisions).toEqual([
      { target_type: 'photo', target_id: 'p1', action: 'reject', reason_code: 'people_identifiable' },
    ])
    expect(screen.getByText(t('review.empty'))).toBeInTheDocument()
  })

  it('"A" approves the first item; typing in a field does not', async () => {
    const { user, decisions } = renderReview('reviewer')
    const card = await screen.findByRole('article', { name: 'Pont Neuf' })
    within(card).getByLabelText(t('review.reason')).focus()
    await user.keyboard('a')
    expect(decisions).toEqual([])
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('a')
    await waitFor(() => expect(decisions).toEqual([{ target_type: 'photo', target_id: 'p1', action: 'approve' }]))
  })

  it('suspends the author for the chosen number of days with the reason', async () => {
    const { user, suspensions } = renderReview('reviewer')
    const card = await screen.findByRole('article', { name: 'Pont Neuf' })
    await user.selectOptions(within(card).getByLabelText(t('review.reason')), 'spam')
    await user.selectOptions(within(card).getByLabelText(t('review.suspendDays')), '7')
    await user.click(within(card).getByRole('button', { name: t('review.suspend') }))
    await waitFor(() => expect(suspensions).toEqual([{ user_id: 'u9', days: 7, reason_code: 'spam' }]))
  })
})
