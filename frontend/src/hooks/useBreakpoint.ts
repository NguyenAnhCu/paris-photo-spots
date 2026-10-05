import { useSyncExternalStore } from 'react'
import { config } from '../config'

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

const desktopQuery = `(min-width: ${config.breakpoints.desktop}px)`
const tabletQuery = `(min-width: ${config.breakpoints.tablet}px)`

function current(): Breakpoint {
  if (window.matchMedia(desktopQuery).matches) return 'desktop'
  if (window.matchMedia(tabletQuery).matches) return 'tablet'
  return 'mobile'
}

function subscribe(onChange: () => void) {
  const lists = [window.matchMedia(desktopQuery), window.matchMedia(tabletQuery)]
  lists.forEach((l) => l.addEventListener('change', onChange))
  return () => lists.forEach((l) => l.removeEventListener('change', onChange))
}

// Layout switches (desktop floating panels vs stacked tablet/mobile pages) follow the design's breakpoints.
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, current, () => 'desktop')
}
