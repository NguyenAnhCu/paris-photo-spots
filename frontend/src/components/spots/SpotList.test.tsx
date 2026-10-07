import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { spotKeys } from '@/hooks/useSpots'
import { createTranslator } from '@/i18n/translate'
import {
  collection,
  createTestQueryClient,
  currentLocation,
  fakeFetch,
  identityServer,
  json,
  renderWithApp,
  spot,
} from '@/test/render'
import { SpotList } from './SpotList'

const t = createTranslator('vi')
const SPOTS = collection([
  spot({ id: 'a', name: 'Pont Alexandre III', photoCategory: 'bridge' }),
  spot({ id: 'b', name: 'Jardin du Luxembourg', photoCategory: 'park' }),
])

function withSpots() {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(spotKeys.all('vi'), SPOTS)
  return queryClient
}

describe('SpotList', () => {
  it('lists the spots with their count', () => {
    renderWithApp(<SpotList layout="panel" />, { queryClient: withSpots() })
    expect(screen.getAllByRole('button', { name: /Pont Alexandre III|Jardin du Luxembourg/ })).toHaveLength(2)
    expect(screen.getByText(t('list.count', { count: 2 }))).toBeInTheDocument()
  })

  it('applies the URL filters', () => {
    renderWithApp(<SpotList layout="panel" />, { queryClient: withSpots(), route: '/?cat=park' })
    expect(screen.getByRole('button', { name: /Jardin du Luxembourg/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pont Alexandre III/ })).not.toBeInTheDocument()
  })

  it('empty result → message with a "clear filters" button that brings the list back', async () => {
    const user = userEvent.setup()
    renderWithApp(<SpotList layout="panel" />, { queryClient: withSpots(), route: '/?q=tour+eiffel&lang=vi' })
    expect(screen.getByText(t('list.empty'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t('list.clearFilters') }))
    expect(screen.getAllByRole('button', { name: /Pont|Jardin/ })).toHaveLength(2)
    expect(currentLocation(screen.getByTestId('location')).search).toBe('?lang=vi')
  })

  it('opening a card keeps the filters in the URL', async () => {
    const user = userEvent.setup()
    renderWithApp(<SpotList layout="panel" />, { queryClient: withSpots(), route: '/?cat=park' })
    await user.click(screen.getByRole('button', { name: /Jardin du Luxembourg/ }))
    expect(currentLocation(screen.getByTestId('location'))).toEqual({ path: '/spots/b', search: '?cat=park' })
  })

  it('shows an error with a retry button when the API fails', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }))
    vi.stubGlobal('fetch', fetchMock)
    renderWithApp(<SpotList layout="column" />)
    const message = await screen.findByText(new RegExp(t('list.error')))
    expect(message).toHaveTextContent(t('errors.generic'))
    fetchMock.mockImplementation(async () => json(200, { type: 'FeatureCollection', features: [] }))
    await user.click(within(message.closest('div') ?? document.body).getByRole('button'))
    expect(await screen.findByText(t('list.empty'))).toBeInTheDocument()
  })
})

describe('SpotList: own spots waiting for review', () => {
  it('a participant sees their pending spot first, marked; the public list stays as it is', async () => {
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        ...identityServer({ name: 'Linh', termsAccepted: true, hasRecoveryCode: true }).routes,
        'GET /api/v1/spots': () =>
          json(200, {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [2.34, 48.85] },
                properties: {
                  id: 'pub',
                  name: 'Pont Neuf',
                  photo_category: 'bridge',
                  crowd_level: 2,
                  best_time: null,
                  cover_thumb_url: null,
                  photo_count: 0,
                },
              },
            ],
          }),
        'GET /api/v1/me/submissions': () =>
          json(200, {
            spots: [
              {
                id: 'mine',
                name: 'Canal du coin',
                photo_category: 'street',
                status: 'pending',
                lng: 2.36,
                lat: 48.87,
                created_at: 'x',
                decision: null,
              },
              {
                id: 'old',
                name: 'Refusé',
                photo_category: 'street',
                status: 'rejected',
                lng: 2.3,
                lat: 48.8,
                created_at: 'x',
                decision: null,
              },
            ],
            photos: [],
          }),
      }),
    )
    renderWithApp(<SpotList layout="panel" />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Canal du coin|Pont Neuf/ })).toHaveLength(2))
    const cards = screen.getAllByRole('button', { name: /Canal du coin|Pont Neuf/ })
    expect(cards[0]).toHaveTextContent('Canal du coin')
    expect(cards[0]).toHaveTextContent(t('status.pending'))
    expect(cards[1]).not.toHaveTextContent(t('status.pending'))
    // Rejected ones are not on the list (they are in "My posts").
    expect(screen.queryByText('Refusé')).toBeNull()
  })
})
