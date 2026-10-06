import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { createTranslator } from '@/i18n/translate'
import { spot } from '@/test/render'
import type { SpotSummary } from '@/types/spot'
import { SpotCard } from './SpotCard'

const t = createTranslator('vi')
// The words the removed crowd labels used (vi), checked literally: their message keys no longer exist.
const CROWD_WORDS = ['Vắng', 'Vừa', 'Đông']

function renderCard(s: SpotSummary, variant: 'overlay' | 'stacked', handlers = {}) {
  const props = { onOpen: vi.fn(), onHover: vi.fn(), ...handlers }
  render(
    <I18nProvider initialLocale="vi">
      <SpotCard spot={s} variant={variant} active={false} {...props} />
    </I18nProvider>,
  )
  return props
}

describe('SpotCard', () => {
  it('desktop card: category alone when the best time is unknown (no "Giờ đẹp: Chưa rõ")', () => {
    renderCard(spot({ bestTime: null }), 'overlay')
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent(t('category.bridge'))
    expect(button).not.toHaveTextContent(t('bestTime.unknown'))
  })

  it('desktop card: "category · Giờ đẹp: time" when the best time is known', () => {
    renderCard(spot({ bestTime: 'sunset' }), 'overlay')
    expect(screen.getByRole('button')).toHaveTextContent(
      t('card.meta', { category: t('category.bridge'), time: t('bestTime.sunset') }),
    )
  })

  it('grid card: best-time tag only when known', () => {
    renderCard(spot({ bestTime: null }), 'stacked')
    expect(screen.queryByText(t('bestTime.unknown'))).not.toBeInTheDocument()
  })

  // Crowd levels are hidden until real crowd data exists (decision 2026-10-06).
  it.each([1, 2, 3] as const)('shows no crowd label on either card (level %i)', (crowdLevel) => {
    renderCard(spot({ crowdLevel, bestTime: 'sunset' }), 'overlay')
    renderCard(spot({ crowdLevel, bestTime: 'sunset' }), 'stacked')
    for (const label of CROWD_WORDS) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })

  it('opens on click and reports hover/focus so the matching pin lights up', async () => {
    const user = userEvent.setup()
    const { onOpen, onHover } = renderCard(spot({ id: 'pont' }), 'overlay')
    const card = screen.getByRole('button', { name: /Pont Alexandre III/ })
    await user.hover(card)
    expect(onHover).toHaveBeenLastCalledWith('pont')
    await user.unhover(card)
    expect(onHover).toHaveBeenLastCalledWith(null)
    await user.click(card)
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
