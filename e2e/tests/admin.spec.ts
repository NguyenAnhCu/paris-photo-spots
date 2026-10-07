// Staff sign-in and administration end to end: accounts made with the staff command-line tool sign in with a username
// and a password; an admin promotes an account, which can then review but not administer; the last admin cannot step
// down; deleting an account asks first. Plus axe on the sign-in and admin pages.
import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { addStaff, signInStaff, staffPage } from '../support/staff.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

async function onAdminPage(page: Page) {
  await expect(page).toHaveURL('/admin')
  await expect(page.getByRole('heading', { level: 1, name: 'Quản trị' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Người dùng' })).toHaveAttribute('aria-selected', 'true')
}

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  )

test.describe(() => {
  // The browser logs the refused sign-in (401) to the console: expected here, nowhere else.
  test.use({ allowedConsoleErrors: [/status of 401 \(Unauthorized\)/] })

  test('admin - a wrong password is refused; the right one opens the admin page; the session cookie is HttpOnly', async ({
    page,
  }) => {
    await addStaff('admin', 'admin', 'Minh')
    await signInStaff(page, 'admin', 'not the password')
    await expect(page.getByRole('alert')).toHaveText('Sai tên đăng nhập hoặc mật khẩu.')
    await expect(page.getByLabel('Mật khẩu')).toHaveValue('')
    expect(await axe(page)).toEqual([])

    await signInStaff(page, 'Admin')
    await onAdminPage(page)
    const cookies = await page.context().cookies()
    const session = cookies.find((c) => c.name.includes('session_token'))
    expect(session?.httpOnly).toBe(true)
    // Ends with the browser (no expiry date): staff sessions are not remembered.
    expect(session?.expires).toBe(-1)
    expect(await page.evaluate(() => document.cookie)).not.toContain('session_token')
  })
})

test('admin - makes an account a reviewer; the reviewer can review but not administer', async ({ browser }) => {
  await addStaff('admin', 'admin', 'Minh')
  await addStaff('an.le', 'participant', 'An')
  const admin = await staffPage(browser, 'admin')
  await onAdminPage(admin)
  const an = admin.getByRole('listitem', { name: 'An' })
  await expect(an).toContainText('@an.le')
  await an.getByLabel('Vai trò của An').selectOption('reviewer')
  await expect(an.getByLabel('Vai trò của An')).toHaveValue('reviewer')
  await expect(admin.getByRole('alert')).toHaveCount(0)

  const reviewer = await staffPage(browser, 'an.le')
  await expect(reviewer).toHaveURL('/review')
  await expect(reviewer.getByRole('heading', { level: 1, name: 'Kiểm duyệt' })).toBeVisible()
  await reviewer.goto('/admin')
  await expect(reviewer.getByText('Trang này chỉ dành cho quản trị viên.')).toBeVisible()
  await expect(reviewer.getByRole('tab', { name: 'Người dùng' })).toHaveCount(0)
})

test('admin - the last admin cannot step down; deleting an account asks first, then removes it', async ({
  browser,
}) => {
  await addStaff('admin', 'admin', 'Minh')
  await addStaff('bao.tran', 'participant', 'Bảo')
  const admin = await staffPage(browser, 'admin')
  await onAdminPage(admin)

  await admin.getByRole('listitem', { name: 'Minh' }).getByLabel('Vai trò của Minh').selectOption('reviewer')
  await expect(admin.getByRole('alert')).toContainText('Phải luôn còn ít nhất một quản trị viên.')
  await expect(admin.getByLabel('Vai trò của Minh')).toHaveValue('admin')

  const bao = admin.getByRole('listitem', { name: 'Bảo' })
  await bao.getByRole('button', { name: 'Xoá tài khoản' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Xoá tài khoản Bảo?' })
  await dialog.getByRole('button', { name: 'Xoá vĩnh viễn' }).click()
  await expect(bao).toHaveCount(0)
})

test('admin - the admin page passes axe (users, log, config)', async ({ browser }) => {
  await addStaff('admin', 'admin', 'Minh')
  const admin = await staffPage(browser, 'admin')
  await onAdminPage(admin)
  await expect(admin.getByRole('listitem', { name: 'Minh' })).toBeVisible()
  expect(await axe(admin)).toEqual([])
  for (const tab of ['Lịch sử kiểm duyệt', 'Cấu hình']) {
    await admin.getByRole('tab', { name: tab }).click()
    await expect(admin.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
    expect(await axe(admin)).toEqual([])
  }
})
