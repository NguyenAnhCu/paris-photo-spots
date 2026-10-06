// Languages: switching, ?lang= in shared links, and localized spot names shown as titles.
import { spotId } from '../support/db.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

const language = (page: import('@playwright/test').Page) =>
  page.getByRole('combobox', { name: /Ngôn ngữ|Language|Langue/ })

test('i18n - switching language translates the UI and the spot names', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Góc chụp quanh Paris' })).toBeVisible()
  // Wikidata gives "phố Crémieux"; the app shows it as a title.
  await expect(page.getByRole('button', { name: /^Phố Crémieux/ })).toBeVisible()

  await language(page).selectOption('en')

  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('button', { name: /^Eiffel Tower/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Rue Crémieux/ })).toBeVisible()
  // No English label: the original name is used.
  await expect(page.getByRole('button', { name: /^Galerie Vivienne/ })).toBeVisible()

  await language(page).selectOption('fr')
  await expect(page.getByRole('button', { name: /^Tour Eiffel/ })).toBeVisible()
})

test('i18n - the chosen language is remembered on the next visit', async ({ page }) => {
  await page.goto('/')
  await language(page).selectOption('fr')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page.getByRole('button', { name: /^Tour Eiffel/ })).toBeVisible()
})

test('i18n - ?lang= wins, stays in the URL while navigating, and follows a switch', async ({ page }) => {
  const eiffel = await spotId('eiffel')
  await page.goto('/?lang=en')

  await page.getByRole('button', { name: /^Eiffel Tower/ }).click()
  await expect(page).toHaveURL(`/spots/${eiffel}?lang=en`)
  await expect(page.getByRole('heading', { level: 1, name: 'Eiffel Tower' })).toBeVisible()

  await language(page).selectOption('vi')

  await expect(page).toHaveURL(`/spots/${eiffel}?lang=vi`)
  await expect(page.getByRole('heading', { level: 1, name: 'Tháp Eiffel' })).toBeVisible()
})
