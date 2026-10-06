import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setViewportWidth } from '@/test/matchMedia'
import { useBreakpoint } from './useBreakpoint'

afterEach(() => {
  setViewportWidth(1280)
})

describe('useBreakpoint', () => {
  it.each([
    [1440, 'desktop'],
    [1000, 'desktop'],
    [999, 'tablet'],
    [820, 'tablet'],
    [819, 'mobile'],
    [375, 'mobile'],
  ])('%ipx → %s (design breakpoints ≥1000 / 820–999 / <820)', (width, expected) => {
    setViewportWidth(width)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe(expected)
  })

  it('follows the window when it is resized', () => {
    setViewportWidth(1280)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('desktop')
    act(() => setViewportWidth(390))
    expect(result.current).toBe('mobile')
  })
})
