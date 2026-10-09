// The spot list on desktop: spots in the map area, search, category filter, filters in the URL, Back, keyboard.
import type { Page } from '@playwright/test'
import { spotId } from '../support/db.js'
import { waitForIdle, waitForPins } from '../support/map.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

const cardNames = (page: Page) => page.locator('.spot-list .spot-card__name')
// Order follows popularity, which the E2E seed leaves empty: compare as sets.
const expectSpots = async (page: Page, names: string[]) =>
  expect.poll(async () => (await cardNames(page).allInnerTexts()).sort()).toEqual([...names].sort())
const search = (page: Page) => page.getByRole('searchbox', { name: 'Tìm địa điểm chụp' })

// The map opens on central Paris: every seeded spot but Versailles is in view (not under the list panel).
const IN_VIEW = 10
const ALL = 11

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(`${IN_VIEW} địa điểm`)).toBeVisible()
})

test('list - shows only the spots in the visible map area; "show all" lists every spot', async ({ page }) => {
  await expect(page.getByText('Trong vùng bản đồ')).toBeVisible()
  await expect(cardNames(page)).toHaveCount(IN_VIEW)
  await expect(page.getByRole('button', { name: /Versailles/ })).toHaveCount(0)

  await page.getByRole('button', { name: `Xem tất cả (${ALL})` }).click()
  await expect(page.getByText(`${ALL} địa điểm`)).toBeVisible()
  await expect(page.getByRole('button', { name: /Versailles/ })).toBeVisible()

  await page.getByRole('button', { name: 'Chỉ trong vùng bản đồ' }).click()
  await expect(cardNames(page)).toHaveCount(IN_VIEW)
})

test('list - follows the map once it stops; zooming in and out never reloads the spots', async ({ page }) => {
  await waitForPins(page)
  const spotRequests: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/v1/spots') spotRequests.push(r.url())
  })
  // Close in on the Eiffel Tower: only that spot is left in view.
  await page.evaluate(() => window.__map?.jumpTo({ center: [2.2945, 48.8584], zoom: 16 }))
  await expectSpots(page, ['Tháp Eiffel'])
  await expect(page.getByText('1 địa điểm')).toBeVisible()
  // A burst of zooms out and in, as a trackpad does: the list settles on the last view.
  await page.evaluate(() => {
    for (const zoom of [15, 13, 12, 14, 12]) window.__map?.jumpTo({ center: [2.3322, 48.8566], zoom })
  })
  await waitForIdle(page)
  await expect(page.getByText(`${IN_VIEW} địa điểm`)).toBeVisible()
  expect(spotRequests).toEqual([])
})

test('list - a search finds a spot outside the map area', async ({ page }) => {
  await search(page).fill('versailles')
  await expect(cardNames(page)).toHaveText([/Versailles/])
  await expect(page.getByText('Kết quả trên toàn bộ bản đồ')).toBeVisible()
})

test('list - search ignores accents and case, and goes into the URL', async ({ page }) => {
  await search(page).fill('CAU')

  await expect(cardNames(page)).toHaveText(['Cầu Pont Neuf'])
  await expect(page).toHaveURL(/[?&]q=CAU(&|$)/)
})

test('list - fast typing keeps every character', async ({ page }) => {
  // No delay between keys: the old controlled input lost characters here ("cau" → "u").
  await search(page).pressSequentially('montparnasse')

  await expect(search(page)).toHaveValue('montparnasse')
  await expect(cardNames(page)).toHaveText(['Tour Montparnasse'])
  await expect(page).toHaveURL(/[?&]q=montparnasse(&|$)/)
})

test('list - category filter narrows the list; Escape closes the popover', async ({ page }) => {
  const filter = page.getByRole('button', { name: 'Lọc' })
  await filter.click()
  const popover = page.getByRole('group', { name: 'Lọc theo loại góc chụp' })
  await expect(popover).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()

  await filter.click()
  await popover.getByRole('button', { name: 'Công viên & vườn' }).click()

  await expect(popover).toBeHidden()
  await expectSpots(page, ['Vườn Tuileries', 'Jardin du Luxembourg'])
  await expect(page).toHaveURL(/[?&]cat=park(&|$)/)
  // The filter button now names the chosen category (cards mention it too, hence exact).
  await expect(page.getByRole('button', { name: 'Công viên & vườn', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

test('list - a shared link with filters opens the filtered list', async ({ page }) => {
  await page.goto('/?cat=street&q=cr')

  await expect(cardNames(page)).toHaveText(['Phố Crémieux'])
  await expect(search(page)).toHaveValue('cr')
})

test('list - Back from a spot returns to the same filtered list', async ({ page }) => {
  await page.goto('/?cat=landmark')
  await page.getByRole('button', { name: /^Bảo tàng Louvre/ }).click()
  await expect(page).toHaveURL(`/spots/${await spotId('louvre')}?cat=landmark`)

  await page.goBack()

  await expect(page).toHaveURL('/?cat=landmark')
  await expect(cardNames(page)).toHaveCount(2)
})

test('list - keyboard: "/" focuses search, Enter on a card opens it', async ({ page }) => {
  await page.keyboard.press('/')
  await expect(search(page)).toBeFocused()
  await expect(search(page)).toHaveValue('')

  await page.getByRole('button', { name: /^Tháp Eiffel/ }).focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(`/spots/${await spotId('eiffel')}`)
})

test.describe('before the map has loaded', () => {
  // The style request never answers: the map stays blank, the list must already match the area it will open on
  // (no first frame with every spot that then shrinks).
  test('list - is limited to the opening map area from the first paint', async ({ page }) => {
    await page.route('**/e2e/map-style.json', () => {})
    await page.goto('/')
    await expect(page.getByText('Trong vùng bản đồ')).toBeVisible()
    await expect(cardNames(page)).toHaveCount(IN_VIEW)
    await expect(page.getByRole('button', { name: `Xem tất cả (${ALL})` })).toBeVisible()
  })
})

test.describe('tablet', () => {
  test.use({ viewport: { width: 900, height: 1180 } })

  test('list - tablet column lists the spots in the (hidden) map area, before and after the map loads', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('.spot-card--stacked')).toHaveCount(IN_VIEW)
    await waitForPins(page)
    await waitForIdle(page)
    await expect(page.locator('.spot-card--stacked')).toHaveCount(IN_VIEW)
  })
})
