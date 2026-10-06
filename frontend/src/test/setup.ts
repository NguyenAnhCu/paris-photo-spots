// Runs before every test file (vitest.config.ts → setupFiles).
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { installMatchMedia } from './matchMedia'

// Node ≥ 25 ships its own global localStorage (throws without --localstorage-file) and it shadows jsdom's.
// Point both names at jsdom's storage so tests behave the same on Node 22 (CI) and newer local Node versions.
const { jsdom } = globalThis as unknown as { jsdom: { window: Pick<Window, 'localStorage' | 'sessionStorage'> } }
for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, { value: jsdom.window[name], configurable: true, writable: true })
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// jsdom has no layout engine: these browser APIs are missing and the app calls them.
installMatchMedia(1280)
Element.prototype.scrollIntoView = function scrollIntoView() {}
URL.createObjectURL = () => 'blob:test-preview'
URL.revokeObjectURL = () => {}
