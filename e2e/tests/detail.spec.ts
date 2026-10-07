// Spot detail (desktop panel) and the tablet card grid.
import { spotId } from '../support/db.js'
import { uploadPhoto } from '../support/api.js'
import { IMAGES } from '../support/images.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

let eiffel: string

test.beforeAll(async () => {
  eiffel = await spotId('eiffel')
  await uploadPhoto(eiffel, IMAGES.noExif, { author: 'Linh' })
  await uploadPhoto(eiffel, IMAGES.noExif, { author: 'Minh', focal: '35mm', aperture: 'f/1.8', iso: '100' })
})

test('detail - shows best time and weather, and no crowd information', async ({ page }) => {
  await page.goto(`/spots/${eiffel}`)
  const panel = page.getByRole('region', { name: 'Tháp Eiffel' })
  await expect(panel.getByRole('heading', { level: 1, name: 'Tháp Eiffel' })).toBeVisible()

  const stats = panel.locator('.stat')
  await expect(stats).toHaveCount(2)
  await expect(stats.nth(0)).toHaveText(/Giờ đẹp\s*Hoàng hôn/)
  // Weather comes from the fixed Open-Meteo answer (21.4 °C, code 2).
  await expect(stats.nth(1)).toHaveText(/Thời tiết\s*21°C · Có mây/)
  await expect(panel.getByText('Đứng ở Trocadéro để thấy cả tháp.')).toBeVisible()

  // Crowd levels were simulated; they stay hidden until real data exists.
  await expect(panel).not.toContainText(/Vắng|Vừa|Đông người|ước tính/)
})

test('detail - community photos, their EXIF and the cover photo credit', async ({ page }) => {
  await page.goto(`/spots/${eiffel}`)
  const panel = page.getByRole('region', { name: 'Tháp Eiffel' })

  await expect(panel.getByRole('img', { name: 'Ảnh Tháp Eiffel của Minh' })).toBeVisible()
  await expect(panel.getByRole('img', { name: 'Ảnh Tháp Eiffel của Linh' })).toBeVisible()
  await expect(panel.getByText('35mm')).toBeVisible()
  await expect(panel.getByText('f/1.8')).toBeVisible()
  await expect(panel.getByText('Ảnh: Photo: E2E author, CC BY-SA 4.0')).toBeVisible()

  await panel.getByRole('button', { name: 'Xem 2 ảnh cộng đồng' }).click()
  await expect(page).toHaveURL(`/spots/${eiffel}/photos`)
})

test('detail - Escape closes the panel and returns to the list', async ({ page }) => {
  await page.goto(`/spots/${eiffel}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Tháp Eiffel' })).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Góc chụp quanh Paris' })).toBeVisible()
})

test.describe('unknown spot', () => {
  // The browser logs the API's 404 as a console error; the page itself must handle it.
  test.use({ allowedConsoleErrors: [/status of 404/] })

  test('detail - an unknown spot shows a message, not a crash', async ({ page }) => {
    await page.goto('/spots/00000000-0000-4000-8000-000000000000')

    await expect(page.getByText('Không tìm thấy địa điểm.')).toBeVisible()
  })
})

// Tablet width: two columns, so a row can be taller than one of its cards (one column at phone width cannot show it).
for (const width of [900]) {
  test(`grid - every card photo starts at the top of its card (${width} px)`, async ({ page }) => {
    // Cards are buttons: Chrome centres a button's content vertically, which pushed photos down in rows where a
    // neighbour card was taller (fixed by making the card a top-aligned flex column).
    await page.setViewportSize({ width, height: 1100 })
    await page.goto('/')
    const cards = page.locator('.spot-card--stacked')
    await expect(cards).toHaveCount(11)

    const offsets = await cards.evaluateAll((els) =>
      els.map((card) => {
        const photo = card.querySelector('.spot-card__media')
        if (!photo) return Infinity
        return Math.round(photo.getBoundingClientRect().top - card.getBoundingClientRect().top)
      }),
    )
    expect(Math.max(...offsets)).toBeLessThanOrEqual(2)
  })
}
