import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { collection, spot } from '@/test/render'
import { useFilteredSpots, useSpotFilters } from './useSpotFilters'

function setup(route: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider initialLocale="vi">
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </I18nProvider>
  )
  return renderHook(() => ({ filters: useSpotFilters(), location: useLocation() }), { wrapper })
}

describe('useSpotFilters (filters live in the URL)', () => {
  it('reads ?cat= and ?q=, ignoring unknown categories', () => {
    expect(setup('/?cat=bridge&q=cau').result.current.filters).toMatchObject({
      category: 'bridge',
      query: 'cau',
      active: true,
    })
    expect(setup('/?cat=beach').result.current.filters).toMatchObject({ category: 'all', query: '', active: false })
  })

  it('writes changes to the URL, keeping other params (lang)', () => {
    const { result } = setup('/?lang=en')
    act(() => result.current.filters.setCategory('park'))
    act(() => result.current.filters.setQuery('luxembourg'))
    expect(new URLSearchParams(result.current.location.search)).toEqual(
      new URLSearchParams('lang=en&cat=park&q=luxembourg'),
    )
    act(() => result.current.filters.setCategory('all'))
    act(() => result.current.filters.setQuery(''))
    expect(result.current.location.search).toBe('?lang=en')
  })

  it('clear() removes both filters', () => {
    const { result } = setup('/?cat=park&q=x&lang=fr')
    act(() => result.current.filters.clear())
    expect(result.current.location.search).toBe('?lang=fr')
    expect(result.current.filters.active).toBe(false)
  })

  it('treats a blank query as no filter', () => {
    expect(setup('/?q=%20%20').result.current.filters.active).toBe(false)
  })
})

describe('useFilteredSpots', () => {
  const spots = collection([
    spot({ id: 'a', name: 'Pont Alexandre III', photoCategory: 'bridge' }),
    spot({ id: 'b', name: 'Jardin du Luxembourg', photoCategory: 'park' }),
    spot({ id: 'c', name: 'Église de la Madeleine', photoCategory: 'landmark' }),
  ])
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider initialLocale="vi">{children}</I18nProvider>
  const ids = (category: Parameters<typeof useFilteredSpots>[1], query: string) =>
    renderHook(() => useFilteredSpots(spots, category, query), { wrapper }).result.current.map((f) => f.properties.id)

  it('filters by category and by accent-insensitive name', () => {
    expect(ids('all', '')).toEqual(['a', 'b', 'c'])
    expect(ids('park', '')).toEqual(['b'])
    expect(ids('all', 'eglise')).toEqual(['c'])
    expect(ids('bridge', 'luxembourg')).toEqual([])
  })

  it('also searches the translated category label ("cầu" finds bridges)', () => {
    expect(ids('all', 'cau')).toEqual(['a'])
  })

  it('returns an empty list while spots are loading', () => {
    expect(renderHook(() => useFilteredSpots(undefined, 'all', ''), { wrapper }).result.current).toEqual([])
  })
})
