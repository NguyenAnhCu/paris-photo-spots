import { useCallback, useEffect, useRef, useState } from 'react'

// Renders a long list one page at a time: the next page comes when the end of the list scrolls into view (or the
// "show more" button is used — keyboard users, browsers without IntersectionObserver). A new list starts again from
// the first page.
export function useIncrementalList<T>(items: T[], pageSize: number, rootMargin = '300px') {
  const [state, setState] = useState({ items, count: pageSize })
  let count = state.count
  // Same content in a new array (a caller that does not memoise) must not reset — nor loop on setState.
  if (state.items !== items && !sameItems(state.items, items)) {
    // Adjusting state while rendering (React's documented pattern): no frame with the old count.
    count = pageSize
    setState({ items, count })
  }

  const hasMore = count < items.length
  const loadMore = useCallback(() => setState((s) => ({ ...s, count: s.count + pageSize })), [pageSize])

  const observer = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback(
    (el: Element | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (!el || typeof IntersectionObserver === 'undefined') return
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) loadMore()
        },
        { rootMargin },
      )
      observer.current.observe(el)
    },
    [loadMore, rootMargin],
  )
  useEffect(() => () => observer.current?.disconnect(), [])

  return { shown: items.slice(0, count), hasMore, remaining: Math.max(items.length - count, 0), loadMore, sentinelRef }
}

const sameItems = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i])
