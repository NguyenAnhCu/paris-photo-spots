import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIncrementalList } from './useIncrementalList'

// A controllable IntersectionObserver: tests decide when the sentinel comes into view.
class FakeObserver {
  static last: FakeObserver | undefined
  constructor(public callback: IntersectionObserverCallback) {
    FakeObserver.last = this
  }
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  show() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

afterEach(() => {
  FakeObserver.last = undefined
  vi.unstubAllGlobals()
})

describe('useIncrementalList', () => {
  it('shows the first page, then one more page each time', () => {
    const items = range(45)
    const { result } = renderHook(() => useIncrementalList(items, 20))
    expect(result.current.shown).toHaveLength(20)
    expect(result.current.remaining).toBe(25)
    act(() => result.current.loadMore())
    expect(result.current.shown).toHaveLength(40)
    act(() => result.current.loadMore())
    expect(result.current.shown).toEqual(items)
    expect(result.current.hasMore).toBe(false)
  })

  it('starts again from the first page when the list changes (map moved, filter changed)', () => {
    const { result, rerender } = renderHook(({ items }) => useIncrementalList(items, 20), {
      initialProps: { items: range(45) },
    })
    act(() => result.current.loadMore())
    expect(result.current.shown).toHaveLength(40)
    rerender({ items: range(30) })
    expect(result.current.shown).toHaveLength(20)
    expect(result.current.remaining).toBe(10)
  })

  it('the same list keeps what was already shown, even as a new array each render', () => {
    const { result, rerender } = renderHook(() => useIncrementalList(range(45), 20))
    act(() => result.current.loadMore())
    rerender()
    expect(result.current.shown).toHaveLength(40)
  })

  it('loads the next page when the end of the list scrolls into view', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const { result } = renderHook(() => useIncrementalList(range(45), 20))
    act(() => result.current.sentinelRef(document.createElement('div')))
    expect(FakeObserver.last?.observe).toHaveBeenCalled()
    act(() => FakeObserver.last?.show())
    expect(result.current.shown).toHaveLength(40)
  })
})
