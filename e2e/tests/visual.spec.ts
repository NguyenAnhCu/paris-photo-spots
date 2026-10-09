// Screenshots of the main screens, compared with baselines made on CI (Linux). macOS renders text and WebGL slightly
// differently, so these run on Linux only. New or intentionally changed screens: delete the PNG, push, and commit the
// one CI writes (artifact playwright-report → e2e/tests/visual.spec.ts-snapshots).
import type { Page } from '@playwright/test'
import { spotId } from '../support/db.js'
import { waitForIdle, waitForPins } from '../support/map.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

test.skip(process.platform !== 'linux', 'baselines are made on CI (Linux)')

// Every font face used and every image on screen loaded, so the shot does not catch a half-loaded page. Lazy images
// below the fold never load without scrolling: only the visible ones are awaited.
async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    const onScreen = [...document.images].filter((img) => {
      const r = img.getBoundingClientRect()
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
    })
    await Promise.all(
      onScreen.map((img) =>
        img.complete
          ? null
          : new Promise((done) => {
              img.addEventListener('load', done)
              img.addEventListener('error', done)
            }),
      ),
    )
  })
}

async function shoot(page: Page, name: string, map = true) {
  if (map) await waitForIdle(page)
  await settled(page)
  // Tolerances were tuned by changing the primary button colour (#416180 → #4a6a80), which must fail:
  // - threshold: per-pixel colour difference; Playwright's default (0.2) treats those two colours as equal.
  // - maxDiffPixels: a whole button is ~0.5 % of the page, so a ratio of 1 % let it pass; 200 px still absorbs the few
  //   anti-aliased pixels WebGL may vary between runs.
  await expect(page).toHaveScreenshot(`${name}.png`, { threshold: 0.05, maxDiffPixels: 200 })
}

// Desktop shows the map next to the panels; on the phone the list/detail pages come without it.
// The list shows the spots in the map area; the (possibly hidden) map reports that area once loaded, then the list
// settles after the debounce. Wait for that final state, or the shot catches the list changing.
async function listSettled(page: Page, cards: number) {
  await waitForPins(page)
  await page.waitForTimeout(VIEW_DEBOUNCE_MS + 100)
  await expect(page.locator('.spot-card')).toHaveCount(cards)
}
const VIEW_DEBOUNCE_MS = 250 // frontend config.viewDebounceMs

test('visual - home', async ({ page, isMobile }) => {
  await page.goto('/')
  await listSettled(page, isMobile ? 7 : 10)
  await shoot(page, 'home', !isMobile)
})

test('visual - spot detail', async ({ page, isMobile }) => {
  await page.goto(`/spots/${await spotId('eiffel')}`)
  await expect(page.getByText('21°C · Có mây').first()).toBeVisible()
  if (!isMobile) await waitForPins(page)
  await shoot(page, 'spot', !isMobile)
})

test('visual - add mark form', async ({ page, isMobile }) => {
  await page.goto('/add')
  await expect(page.getByRole('heading', { name: 'Thêm mark' })).toBeVisible()
  if (!isMobile) await waitForPins(page)
  await shoot(page, 'add-mark', !isMobile)
})

test('visual - phone map tab', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only')
  await page.goto('/')
  await page.getByRole('tab', { name: 'Bản đồ' }).tap()
  await waitForPins(page)
  await shoot(page, 'map-tab')
})

test.describe('tablet', () => {
  test.use({ viewport: { width: 900, height: 1180 } })
  test.skip(({ isMobile }) => isMobile, 'tablet layout is shot from the desktop project')

  test('visual - tablet card grid', async ({ page }) => {
    await page.goto('/')
    await listSettled(page, 10)
    await shoot(page, 'tablet-grid', false)
  })
})
