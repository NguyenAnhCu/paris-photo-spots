// The spot list on desktop: search, category filter, filters in the URL, Back, keyboard.
import type { Page } from '@playwright/test'
import { spotId } from '../support/db.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

const cardNames = (page: Page) => page.locator('.spot-list .spot-card__name')
// Order follows popularity, which the E2E seed leaves empty: compare as sets.
const expectSpots = async (page: Page, names: string[]) =>
  expect.poll(async () => (await cardNames(page).allInnerTexts()).sort()).toEqual([...names].sort())
const search = (page: Page) => page.getByRole('searchbox', { name: 'Tìm địa điểm chụp' })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('11 địa điểm')).toBeVisible()
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
