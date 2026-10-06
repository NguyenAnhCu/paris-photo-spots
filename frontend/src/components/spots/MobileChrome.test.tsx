import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { formatCoords } from '@/lib/geo'
import { useMapUi } from '@/pages/mapUi'
import { renderWithApp, spot } from '@/test/render'
import { BottomSegmented, MiniSpotCard, PlacingBar } from './MobileChrome'

const t = createTranslator('vi')
const mapUi = () => screen.getByTestId('map-ui')
const placement = () => JSON.parse(mapUi().dataset.placement ?? 'null') as { position: [number, number] | null } | null

// Stands in for a tap on the map while picking a location.
function MapTap({ at }: { at: [number, number] }) {
  const { setPlacement } = useMapUi()
  return (
    <button type="button" onClick={() => setPlacement((cur) => ({ category: cur?.category ?? null, position: at }))}>
      tap map
    </button>
  )
}

describe('PlacingBar ("Chọn trên bản đồ")', () => {
  it('asks for a tap and keeps "Xong" disabled until a location exists', async () => {
    const user = userEvent.setup()
    renderWithApp(
      <>
        <PlacingBar />
        <MapTap at={[2.2945, 48.8584]} />
      </>,
      { mapUi: { placement: { position: null, category: null }, pickingOnMap: true } },
    )
    expect(screen.getByRole('status')).toHaveTextContent(t('add.locationTapHint'))
    expect(screen.getByRole('button', { name: t('add.locationDone') })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'tap map' }))
    expect(screen.getByRole('status')).toHaveTextContent(formatCoords(48.8584, 2.2945))
    await user.click(screen.getByRole('button', { name: t('add.locationDone') }))
    expect(mapUi().dataset.picking).toBe('false')
    expect(placement()?.position).toEqual([2.2945, 48.8584])
  })

  it('"Huỷ" puts back the location the form had before and closes the map', async () => {
    const user = userEvent.setup()
    renderWithApp(
      <>
        <PlacingBar />
        <MapTap at={[2.35, 48.85]} />
      </>,
      { mapUi: { placement: { position: [2.3, 48.86], category: 'park' }, pickingOnMap: true } },
    )
    await user.click(screen.getByRole('button', { name: 'tap map' }))
    await user.click(screen.getByRole('button', { name: t('common.cancel') }))
    expect(placement()).toEqual({ position: [2.3, 48.86], category: 'park' })
    expect(mapUi().dataset.picking).toBe('false')
  })
})

describe('BottomSegmented', () => {
  it('switches between list and map tabs', async () => {
    const user = userEvent.setup()
    renderWithApp(<BottomSegmented />)
    expect(screen.getByRole('navigation', { name: t('nav.views') })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: t('nav.list') })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: t('nav.map') }))
    expect(screen.getByRole('tab', { name: t('nav.map') })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('MiniSpotCard', () => {
  it('has an accessible name and opens the spot', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    renderWithApp(<MiniSpotCard spot={spot({ bestTime: null })} onOpen={onOpen} />)
    const card = screen.getByRole('button', { name: t('card.open', { name: 'Pont Alexandre III' }) })
    expect(card).not.toHaveTextContent(t('bestTime.unknown'))
    await user.click(card)
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
