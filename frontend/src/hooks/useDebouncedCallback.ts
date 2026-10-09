import { useEffect, useMemo, useRef } from 'react'

// Calls `fn` once a burst of calls has stopped for `waitMs`, with the last arguments. Pending calls are dropped on
// unmount.
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, waitMs: number) {
  const latest = useRef(fn)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    latest.current = fn
  }, [fn])
  useEffect(() => () => clearTimeout(timer.current), [])
  return useMemo(
    () =>
      (...args: A) => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => latest.current(...args), waitMs)
      },
    [waitMs],
  )
}
