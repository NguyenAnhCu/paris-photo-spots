// Phone (390 × 844, touch): list/map tabs, pin → mini card → spot → Back, and placing a new mark on the full-screen map.
import type { Page } from '@playwright/test'
import { spotId } from '../support/db.js'
import { LAYERS, PIN_HIT_OFFSET_Y, rendered, waitForIdle, waitForPins } from '../support/map.js'
import { acceptTerms } from '../support/identity.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

const tab = (page: Page, name: 'Danh sách' | 'Bản đồ') => page.getByRole('tab', { name })

async function tapMapAt(page: Page, at: [number, number]) {
  await waitForIdle(page)
  const p = await page.evaluate((at) => {
    const map = window.__map
    if (!map) throw new Error('map not ready')
    const box = map.getCanvas().getBoundingClientRect()
    const xy = map.project(at)
    return { x: box.left + xy.x, y: box.top + xy.y }
  }, at)
  await page.touchscreen.tap(p.x, p.y)
}

test('mobile - list first; map tab shows the pins', async ({ page }) => {
  await page.goto('/')
  await expect(tab(page, 'Danh sách')).toHaveAttribute('aria-selected', 'true')
  // The (hidden) map opens on central Paris, narrower than on desktop: 7 of the 11 spots are in its area.
  await expect(page.getByText('Trong vùng bản đồ')).toBeVisible()
  await expect(page.locator('.spot-card--stacked')).toHaveCount(7)
  await page.getByRole('button', { name: 'Xem tất cả (11)' }).tap()
  await expect(page.locator('.spot-card--stacked')).toHaveCount(11)

  await tab(page, 'Bản đồ').tap()

  await expect(tab(page, 'Bản đồ')).toHaveAttribute('aria-selected', 'true')
  await waitForPins(page)
  expect((await rendered(page, LAYERS.pins)).length).toBeGreaterThan(0)
})

test('mobile - the list follows the area last seen on the map tab', async ({ page }) => {
  await page.goto('/')
  await tab(page, 'Bản đồ').tap()
  await waitForPins(page)
  await page.evaluate(() => window.__map?.jumpTo({ center: [2.2945, 48.8584], zoom: 16 }))
  await waitForIdle(page)
  await tab(page, 'Danh sách').tap()
  await expect(page.locator('.spot-card--stacked .spot-card__name')).toHaveText(['Tháp Eiffel'])
})

test('mobile - pin → mini card → spot page → Back keeps the map tab', async ({ page }) => {
  const sacreCoeur = await spotId('sacreCoeur')
  await page.goto('/')
  await tab(page, 'Bản đồ').tap()
  await waitForPins(page)
  const pin = (await rendered(page, LAYERS.pins)).find((p) => p.id === sacreCoeur)
  if (!pin) throw new Error('Sacré-Cœur pin not drawn')

  await page.touchscreen.tap(pin.x, pin.y + PIN_HIT_OFFSET_Y)
  const mini = page.getByRole('button', { name: 'Mở Vương cung thánh đường Sacré-Cœur' })
  await expect(mini).toBeVisible()
  await expect(mini).toContainText('Bình minh')

  await mini.tap()
  await expect(page).toHaveURL(`/spots/${sacreCoeur}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Vương cung thánh đường Sacré-Cœur' })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL('/')
  await expect(tab(page, 'Bản đồ')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.spot-map canvas')).toBeVisible()
})

test('mobile - "Chọn trên bản đồ": Huỷ restores the old place, Xong keeps the new one and the typed name', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Thêm mark' }).tap()
  await page.getByLabel('Tên địa điểm').fill('Bậc thang Montmartre')
  await expect(page.getByText('Chưa chọn vị trí')).toBeVisible()

  await page.getByRole('button', { name: 'Chọn trên bản đồ' }).tap()
  const bar = page.getByRole('status')
  await expect(bar).toHaveText('Chạm vào bản đồ để đặt ghim')
  await expect(page.getByLabel('Tên địa điểm')).toBeHidden()
  await tapMapAt(page, [2.34, 48.885])
  await expect(bar).toHaveText(/^48\.88\d+, 2\.3[34]\d+$/)
  await page.getByRole('button', { name: 'Huỷ' }).tap()

  await expect(page.getByLabel('Tên địa điểm')).toHaveValue('Bậc thang Montmartre')
  await expect(page.getByText('Chưa chọn vị trí')).toBeVisible()

  await page.getByRole('button', { name: 'Chọn trên bản đồ' }).tap()
  await tapMapAt(page, [2.34, 48.885])
  await page.getByRole('button', { name: 'Xong' }).tap()

  await expect(page.getByLabel('Tên địa điểm')).toHaveValue('Bậc thang Montmartre')
  await expect(page.getByText(/^48\.88\d+, 2\.3[34]\d+$/)).toBeVisible()
  await acceptTerms(page)
  await expect(page.getByRole('button', { name: 'Đăng mark' })).toBeEnabled()
})
