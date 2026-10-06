// Screenshots of the main screens, compared with baselines made on CI (Linux). macOS renders text and WebGL slightly
// differently, so these run on Linux only. New or intentionally changed screens: delete the PNG, push, and commit the
// one CI writes (artifact playwright-report → e2e/tests/visual.spec.ts-snapshots).
import type { Page } from '@playwright/test'
import { spotId } from '../support/db.js'
import { waitForIdle, waitForPins } from '../support/map.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

test.skip(process.platform !== 'linux', 'baselines are made on CI (Linux)')

// Every font face used and every image decoded, so the shot does not catch a half-loaded page.
async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map((img) => (img.complete ? null : new Promise((r) => img.addEventListener('load', r)))),
    )
  })
}

async function shoot(page: Page, name: string, map = true) {
  if (map) await waitForIdle(page)
  await settled(page)
  // WebGL on SwiftShader can differ by a few anti-aliased pixels between runs.
  await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.01 })
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
