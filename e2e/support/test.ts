// The `test` every spec imports. On top of Playwright's it:
// - answers every request that would leave the machine (map style, glyphs, weather, Commons photos, Google Fonts) from
//   local fixtures, and fails the test on any other external request;
// - fails the test on an uncaught page error or a console error, unless the test lists that message as expected.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test as base, expect, type Route } from '@playwright/test'
import { resetAndSeed } from './db.js'
import { E2E_DIR } from './env.js'
import { IMAGES } from './images.js'

// Current weather the detail page shows for every spot: 21 °C, partly cloudy (WMO code 2).
export const WEATHER = { current: { temperature_2m: 21.4, weather_code: 2 } }

const fixture = (...parts: string[]) => readFile(path.join(E2E_DIR, 'fixtures', ...parts))

async function answerLocally(route: Route): Promise<boolean> {
  const url = new URL(route.request().url())
  if (url.pathname === '/e2e/map-style.json') {
    await route.fulfill({ contentType: 'application/json', body: await fixture('map-style.json') })
    return true
  }
  if (url.pathname.startsWith('/e2e/glyphs/')) {
    const [fontstack = '', range = ''] = url.pathname.slice('/e2e/glyphs/'.length).split('/').map(decodeURIComponent)
    const body = await fixture('glyphs', fontstack, range).catch(() => null)
    await (body
      ? route.fulfill({ contentType: 'application/x-protobuf', body })
      : route.fulfill({ status: 404, body: '' }))
    return true
  }
  switch (url.hostname) {
    case 'api.open-meteo.com':
      await route.fulfill({ json: WEATHER })
      return true
    case 'upload.wikimedia.org':
      await route.fulfill({ contentType: 'image/jpeg', body: await readFile(IMAGES.cover) })
      return true
    case 'fonts.googleapis.com':
      // Fallback fonts are fine for behaviour tests.
      await route.fulfill({ contentType: 'text/css', body: '' })
      return true
  }
  return false
}

type Options = { allowedConsoleErrors: RegExp[] }

export const test = base.extend<Options & { guards: void }>({
  allowedConsoleErrors: [[], { option: true }],
  guards: [
    async ({ context, page, allowedConsoleErrors }, use) => {
      const external: string[] = []
      const errors: string[] = []
      await context.route('**/*', async (route) => {
        if (await answerLocally(route)) return
        const { hostname } = new URL(route.request().url())
        if (hostname === 'localhost' || hostname === '127.0.0.1') return route.fallback()
        external.push(route.request().url())
        return route.abort('blockedbyclient')
      })
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (!allowedConsoleErrors.some((re) => re.test(text))) errors.push(`console.error: ${text}`)
      })
      await use()
      expect(external, 'requests that would leave the machine').toEqual([])
      expect(errors, 'page errors / console errors').toEqual([])
    },
    { auto: true },
  ],
})

// Fresh, known data for the spec file that calls this (specs run one at a time on a shared database).
export function useFreshDatabase() {
  test.beforeAll(async () => {
    await resetAndSeed()
  })
}

export { expect }
