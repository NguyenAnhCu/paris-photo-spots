import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { spotKeys } from '@/hooks/useSpots'
import { createTranslator } from '@/i18n/translate'
import { collection, createTestQueryClient, currentLocation, json, renderWithApp, spot } from '@/test/render'
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
