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
import type { BBox } from '@/lib/geo'
import type { SpotCollection, SpotSummary } from '@/types/spot'
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

// Spots at real places: two in central Paris, one in Versailles. The map shows central Paris.
const PLACED: SpotCollection = {
  type: 'FeatureCollection',
  features: [
    placed('louvre', 'Musée du Louvre', 2.3376, 48.8606, 'landmark'),
    placed('eiffel', 'Tour Eiffel', 2.2945, 48.8584, 'landmark'),
    placed('versailles', 'Château de Versailles', 2.1204, 48.8049, 'landmark'),
  ],
}
const CENTRAL_PARIS: BBox = [2.28, 48.84, 2.36, 48.88]

function placed(id: string, name: string, lng: number, lat: number, photoCategory: SpotSummary['photoCategory']) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [lng, lat] },
    properties: spot({ id, name, photoCategory }),
  }
}

function withPlaced(data: SpotCollection = PLACED) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(spotKeys.all('vi'), data)
  return queryClient
}

const cardNames = () =>
  screen.getAllByRole('button', { name: /Louvre|Eiffel|Versailles|Spot \d+/ }).map((b) => b.textContent ?? '')

describe('SpotList — only the spots in the map view', () => {
  it('lists the spots inside the visible map area; the count and a line say so', () => {
    renderWithApp(<SpotList layout="panel" />, { queryClient: withPlaced(), mapUi: { viewBounds: CENTRAL_PARIS } })
    expect(cardNames()).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Versailles/ })).toBeNull()
    expect(screen.getByText(t('list.count', { count: 2 }))).toBeInTheDocument()
    expect(screen.getByText(t('list.scope.view'))).toBeInTheDocument()
  })

  it('"show all" lists every spot, and can go back to the map area', async () => {
    const user = userEvent.setup()
    renderWithApp(<SpotList layout="column" />, { queryClient: withPlaced(), mapUi: { viewBounds: CENTRAL_PARIS } })
    await user.click(screen.getByRole('button', { name: t('list.showAll', { count: 3 }) }))
    expect(cardNames()).toHaveLength(3)
    expect(screen.getByText(t('list.scope.all'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t('list.onlyInView') }))
    expect(cardNames()).toHaveLength(2)
  })

  it('a search looks through every spot, not only the map area', () => {
    renderWithApp(<SpotList layout="panel" />, {
      queryClient: withPlaced(),
      mapUi: { viewBounds: CENTRAL_PARIS },
      route: '/?q=versailles',
    })
    expect(cardNames()).toEqual([expect.stringContaining('Versailles')])
    expect(screen.getByText(t('list.scope.search'))).toBeInTheDocument()
  })

  it('nothing in the map area: says so and offers to show all', async () => {
    const user = userEvent.setup()
    renderWithApp(<SpotList layout="panel" />, {
      queryClient: withPlaced(),
      mapUi: { viewBounds: [2.0, 49.2, 2.1, 49.3] }, // fields north of Paris
    })
    expect(screen.getByText(t('list.emptyInView'))).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: t('list.showAll', { count: 3 }) })[0] as HTMLElement)
    expect(cardNames()).toHaveLength(3)
  })

  it('long lists come 20 cards at a time; "show more" (or scrolling to the end) adds the next 20', async () => {
    const user = userEvent.setup()
    const many: SpotCollection = {
      type: 'FeatureCollection',
      features: Array.from({ length: 45 }, (_, i) => placed(`s${i}`, `Spot ${i + 1}`, 2.3 + i / 1000, 48.86, 'street')),
    }
    renderWithApp(<SpotList layout="panel" />, { queryClient: withPlaced(many), mapUi: { viewBounds: CENTRAL_PARIS } })
    expect(cardNames()).toHaveLength(20)
    expect(screen.getByText(t('list.count', { count: 45 }))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t('list.more', { count: 25 }) }))
    expect(cardNames()).toHaveLength(40)
    await user.click(screen.getByRole('button', { name: t('list.more', { count: 5 }) }))
    expect(cardNames()).toHaveLength(45)
    expect(screen.queryByRole('button', { name: /Xem thêm/ })).toBeNull()
  })
})
