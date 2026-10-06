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
  // threshold: per-pixel colour tolerance. Playwright's default (0.2) let a changed button colour (#416180 → #4a6a80)
  // pass; 0.05 catches it. maxDiffPixelRatio absorbs the few anti-aliased pixels WebGL may vary between runs.
  await expect(page).toHaveScreenshot(`${name}.png`, { threshold: 0.05, maxDiffPixelRatio: 0.01 })
}

// Desktop shows the map next to the panels; on the phone the list/detail pages come without it.
test('visual - home', async ({ page, isMobile }) => {
  await page.goto('/')
  await expect(page.locator('.spot-card')).toHaveCount(11)
  if (!isMobile) await waitForPins(page)
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
    await expect(page.locator('.spot-card--stacked')).toHaveCount(11)
    await shoot(page, 'tablet-grid', false)
  })
})
