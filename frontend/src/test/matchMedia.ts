// jsdom has no window.matchMedia. This fake answers (min-width: Npx) / (max-width: Npx) queries against a viewport width
// tests can change with setViewportWidth(); other queries (prefers-reduced-motion…) never match.
type Listener = (e: MediaQueryListEvent) => void

let width = 1280
const lists = new Set<{ query: string; listeners: Set<Listener> }>()

function evaluate(query: string): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query)
  const max = /\(max-width:\s*(\d+)px\)/.exec(query)
  if (!min && !max) return false
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
}

export function installMatchMedia(initialWidth: number) {
  width = initialWidth
  window.matchMedia = (query: string) => {
    const entry = { query, listeners: new Set<Listener>() }
    lists.add(entry)
    return {
      get matches() {
        return evaluate(query)
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, l: Listener) => entry.listeners.add(l),
      removeEventListener: (_type: string, l: Listener) => entry.listeners.delete(l),
      addListener: (l: Listener) => entry.listeners.add(l),
      removeListener: (l: Listener) => entry.listeners.delete(l),
      dispatchEvent: () => true,
    } as MediaQueryList
  }
}

export function setViewportWidth(next: number) {
  width = next
  for (const { query, listeners } of lists) {
    listeners.forEach((l) => l({ matches: evaluate(query), media: query } as MediaQueryListEvent))
  }
}
