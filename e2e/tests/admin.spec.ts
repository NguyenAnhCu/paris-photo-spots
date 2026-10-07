// Admin end to end: an admin (signed in by link) makes a linked account a reviewer, who can then review but not
// administer; deleting an account takes it off the list. Plus axe on the admin page.
import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { addLinkedUser, staffPage } from '../support/staff.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

const ADMIN = 'minh@admin.example'

async function adminPage(page: Page) {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { level: 1, name: 'Quản trị' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Người dùng' })).toHaveAttribute('aria-selected', 'true')
}

test('admin - makes a linked account a reviewer; the reviewer can review but not administer', async ({ browser }) => {
  await addLinkedUser(ADMIN, 'Minh', 'admin')
  await addLinkedUser('an@team.example', 'An', 'participant')
  const admin = await staffPage(browser, ADMIN)
  await adminPage(admin)
  const an = admin.getByRole('listitem', { name: 'An' })
  await expect(an).toContainText('an@team.example')
  await an.getByLabel('Vai trò của An').selectOption('reviewer')
  await expect(an.getByLabel('Vai trò của An')).toHaveValue('reviewer')
  await expect(admin.getByRole('alert')).toHaveCount(0)

  const reviewer = await staffPage(browser, 'an@team.example')
  await expect(reviewer.getByRole('heading', { level: 1, name: 'Kiểm duyệt' })).toBeVisible()
  await reviewer.goto('/admin')
  await expect(reviewer.getByText('Trang này chỉ dành cho quản trị viên.')).toBeVisible()
  await expect(reviewer.getByRole('tab', { name: 'Người dùng' })).toHaveCount(0)
})

test('admin - the last admin cannot step down; deleting an account asks first, then removes it', async ({
  browser,
}) => {
  await addLinkedUser(ADMIN, 'Minh', 'admin')
  await addLinkedUser('bao@team.example', 'Bảo', 'participant')
  const admin = await staffPage(browser, ADMIN)
  await adminPage(admin)

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
  await addLinkedUser(ADMIN, 'Minh', 'admin')
  const admin = await staffPage(browser, ADMIN)
  await adminPage(admin)
  const check = async () =>
    (
      await new AxeBuilder({ page: admin }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  await expect(admin.getByRole('listitem', { name: 'Minh' })).toBeVisible()
  expect(await check()).toEqual([])
  for (const tab of ['Lịch sử kiểm duyệt', 'Cấu hình']) {
    await admin.getByRole('tab', { name: tab }).click()
    await expect(admin.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
    expect(await check()).toEqual([])
  }
})
