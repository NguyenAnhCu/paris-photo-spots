// Accessibility on the main screens, desktop and phone: axe (WCAG 2.x A/AA), text ≥ 12 px, touch targets ≥ 44 px.
import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { uploadPhoto } from '../support/api.js'
import { spotId } from '../support/db.js'
import { IMAGES } from '../support/images.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

let eiffel: string
test.beforeAll(async () => {
  eiffel = await spotId('eiffel')
  await uploadPhoto(eiffel, IMAGES.noExif, { author: 'Linh', focal: '35mm' })
})

const SCREENS: { name: string; path: () => string; ready: (page: Page) => Promise<void> }[] = [
  {
    name: 'list',
    path: () => '/',
    ready: (page) => expect(page.getByText(/^\d+ địa điểm$/).first()).toBeVisible(),
  },
  {
    name: 'spot',
    path: () => `/spots/${eiffel}`,
    ready: (page) => expect(page.getByText('21°C · Có mây').first()).toBeVisible(),
  },
  {
    name: 'photos',
    path: () => `/spots/${eiffel}/photos`,
    ready: (page) => expect(page.getByRole('button', { name: 'Xem ảnh 1' })).toBeVisible(),
  },
  {
    name: 'add mark',
    path: () => '/add',
    ready: (page) => expect(page.getByRole('heading', { name: 'Thêm mark' })).toBeVisible(),
  },
]

// Elements with their own text smaller than 12 px (design rule), outside the map canvas.
const smallText = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('.maplibregl-map')) continue
      if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) continue
      const box = el.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 12) out.push(`${size}px "${el.textContent?.trim().slice(0, 30)}"`)
    }
    return out
  })

// Interactive elements smaller than 44 × 44 px; the map attribution (i) is MapLibre's own control.
const smallTargets = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = []
    const els = document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role=tab]')
    for (const el of els) {
      if (el.closest('.maplibregl-ctrl-attrib') || (el as HTMLInputElement).type === 'file') continue
      // A checkbox or radio inside a <label> is tapped through the whole label.
      const isToggle = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
      const target = isToggle ? (el.closest('label') ?? el) : el
      const box = target.getBoundingClientRect()
      if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') continue
      if (box.width < 44 || box.height < 44) {
        const label = el.getAttribute('aria-label') || el.textContent || el.tagName
        out.push(`${Math.round(box.width)}×${Math.round(box.height)} "${label.trim().slice(0, 30)}"`)
      }
    }
    return out
  })

for (const screen of SCREENS) {
  test(`a11y - ${screen.name}: no axe violations, text ≥ 12 px`, async ({ page }) => {
    await page.goto(screen.path())
    await screen.ready(page)

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
    expect(await smallText(page)).toEqual([])
  })
}

test.describe('touch', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'touch targets are checked on the phone project')

  for (const screen of SCREENS) {
    test(`a11y - ${screen.name}: touch targets ≥ 44 px`, async ({ page }) => {
      await page.goto(screen.path())
      await screen.ready(page)
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'phone emulation').toBe(true)

      expect(await smallTargets(page)).toEqual([])
    })
  }
})
