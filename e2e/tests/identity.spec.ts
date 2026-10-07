// Anonymous posting identity in a real browser: created by the first post, kept in an HttpOnly cookie, carried to
// another browser with the recovery code, protected by a warning before signing out.
import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { query } from '../support/db.js'
import { acceptTerms, closeRecoveryCode } from '../support/identity.js'
import { clickMapAt, waitForPins } from '../support/map.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

const accountButton = (page: Page) => page.getByRole('button', { name: /^(Tài khoản|Tài khoản của bạn: .+)$/ })

// A first post through the UI: the "add mark" form on desktop, placed on an empty part of the map (east Paris).
async function postFirstSpot(page: Page, name: string, at: [number, number] = [2.395, 48.862]) {
  await page.goto('/')
  await waitForPins(page)
  await page.getByRole('button', { name: 'Thêm mark' }).click()
  await expect(page.getByRole('heading', { name: 'Thêm mark' })).toBeVisible()
  await clickMapAt(page, at)
  await page.getByLabel('Tên địa điểm').fill(name)
  await acceptTerms(page)
  await page.getByRole('button', { name: 'Đăng mark' }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

test('identity - the first post creates an anonymous name, kept in an HttpOnly cookie across reloads', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(accountButton(page)).toHaveAccessibleName('Tài khoản')

  await postFirstSpot(page, 'Quai de Valmy')
  await closeRecoveryCode(page)

  const button = accountButton(page)
  await expect(button).toHaveAccessibleName(/^Tài khoản của bạn: Lữ khách \d{4}$/)
  const name = (await button.getAttribute('aria-label'))?.split(': ')[1]

  // The session never reaches JavaScript.
  const session = (await context.cookies()).find((c) => c.name.endsWith('session_token'))
  expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
  expect(await page.evaluate(() => document.cookie)).not.toContain('session_token')

  await page.reload()
  await expect(accountButton(page)).toHaveAccessibleName(`Tài khoản của bạn: ${name}`)
  const [owner] = await query<{ display_name: string }>(
    `SELECT u.display_name FROM pois p JOIN users u ON u.id = p.created_by WHERE p.name = 'Quai de Valmy'`,
  )
  expect(owner?.display_name).toBe(name)
})

test('identity - the recovery code brings the same identity to another browser', async ({ page, browser }) => {
  await postFirstSpot(page, 'Canal de l’Ourcq', [2.375, 48.885])
  const code = await closeRecoveryCode(page)
  const name = (await accountButton(page).getAttribute('aria-label'))?.split(': ')[1]

  const other = await browser.newContext()
  try {
    const laptop = await other.newPage()
    await laptop.goto('/')
    await accountButton(laptop).click()
    await laptop.getByRole('menuitem', { name: 'Dùng mã khôi phục' }).click()
    const dialog = laptop.getByRole('dialog', { name: 'Dùng mã khôi phục' })
    await dialog.getByLabel('Mã khôi phục').fill(code.toLowerCase())
    await dialog.getByRole('button', { name: 'Vào lại' }).click()
    await expect(dialog).toBeHidden()
    await expect(accountButton(laptop)).toHaveAccessibleName(`Tài khoản của bạn: ${name}`)
  } finally {
    await other.close()
  }
})

test('identity - signing out without a saved code warns first', async ({ page }) => {
  // An identity that posted through the API and never saw the recovery dialog.
  await page.goto('/')
  await page.request.post('/api/auth/sign-in/anonymous', { data: {}, headers: { 'x-ui-lang': 'vi' } })
  await page.reload()

  await accountButton(page).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  const dialog = page.getByRole('dialog', { name: 'Đăng xuất?' })
  await expect(dialog).toContainText('Bạn chưa lưu mã khôi phục')
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  expect(axe.violations.map((v) => v.id)).toEqual([])

  await dialog.getByRole('button', { name: 'Lưu mã trước' }).click()
  await closeRecoveryCode(page)
  await accountButton(page).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await expect(page.getByRole('dialog', { name: 'Đăng xuất?' })).toContainText('Bạn có thể vào lại bằng mã khôi phục')
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(accountButton(page)).toHaveAccessibleName('Tài khoản')
})

test('identity - the terms page opens from the form and reads as a draft', async ({ page }) => {
  await page.goto('/terms')
  await expect(page.getByRole('heading', { level: 1, name: 'Điều khoản sử dụng' })).toBeVisible()
  await expect(page.getByText('Bản nháp')).toBeVisible()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.map((v) => v.id)).toEqual([])
})
