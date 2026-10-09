import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedCallback } from './useDebouncedCallback'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedCallback', () => {
  it('a burst of calls (zoom in, out, in…) runs once, with the last value, after the pause', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 250))
    for (const zoom of [12, 13, 14, 13, 12]) {
      result.current(zoom)
      vi.advanceTimersByTime(100)
    }
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(12)
  })

  it('nothing runs after unmount (no state update on a gone component)', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 250))
    result.current(1)
    unmount()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })
})
