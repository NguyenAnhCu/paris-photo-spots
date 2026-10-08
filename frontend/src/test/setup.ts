// Runs before every test file (vitest.config.ts → setupFiles).
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { installMatchMedia } from './matchMedia'

// Node ≥ 25 ships its own global localStorage (throws without --localstorage-file) and it shadows jsdom's.
// Point both names at jsdom's storage so tests behave the same on Node 22 (CI) and newer local Node versions.
const { jsdom } = globalThis as unknown as { jsdom: { window: Pick<Window, 'localStorage' | 'sessionStorage'> } }
for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, { value: jsdom.window[name], configurable: true, writable: true })
}

// No real network in unit tests. Unless a test stubs fetch itself (fakeFetch), the header's account button gets
// "no identity yet" and anything else fails: without this, a request would reach whatever runs on localhost:3000.
beforeEach(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    if (url.pathname === '/api/v1/me') {
      return new Response(JSON.stringify({ user: null, terms_version: 'draft-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw new Error(`Unexpected network request in a unit test: ${url.pathname}`)
  })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// jsdom has no layout engine: these browser APIs are missing and the app calls them.
installMatchMedia(1280)
Element.prototype.scrollIntoView = function scrollIntoView() {}
URL.createObjectURL = () => 'blob:test-preview'
URL.revokeObjectURL = () => {}
