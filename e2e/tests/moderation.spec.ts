// Moderation end to end, three browsers: a participant posts, a visitor looks, a reviewer decides.
import { AxeBuilder } from '@axe-core/playwright'
import type { Browser, Page } from '@playwright/test'
import { uploadPhoto } from '../support/api.js'
import { spotId } from '../support/db.js'
import { acceptTerms, closeRecoveryCode } from '../support/identity.js'
import { IMAGES } from '../support/images.js'
import { clickMapAt, waitForPins } from '../support/map.js'
import { addLinkedUser, staffPage } from '../support/staff.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

const REVIEWER = 'linh@review.example'

async function reviewerPage(browser: Browser): Promise<Page> {
  await addLinkedUser(REVIEWER, 'Linh', 'reviewer')
  const page = await staffPage(browser, REVIEWER)
  await expect(page.getByRole('heading', { level: 1, name: 'Kiểm duyệt' })).toBeVisible()
  return page
}

async function postSpot(page: Page, name: string, at: [number, number]) {
  await page.goto('/')
  await waitForPins(page)
  await page.getByRole('button', { name: 'Thêm mark' }).click()
  await expect(page.getByRole('heading', { name: 'Thêm mark' })).toBeVisible()
  await clickMapAt(page, at)
  await page.getByLabel('Tên địa điểm').fill(name)
  await acceptTerms(page)
  await page.getByRole('button', { name: 'Đăng mark' }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await closeRecoveryCode(page)
}

test('moderation - a new spot waits for review, then goes public once a reviewer approves it', async ({
  page,
  browser,
}) => {
  await postSpot(page, 'Bassin de la Villette', [2.372, 48.886])
  await expect(page.getByRole('status').filter({ hasText: 'Chờ duyệt' })).toBeVisible()
  await page.goto('/')
  const mine = page.getByRole('button', { name: /^Bassin de la Villette/ })
  await expect(mine).toContainText('Chờ duyệt')

  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto('/')
  await expect(visitor.getByText('11 địa điểm')).toBeVisible()
  await expect(visitor.getByRole('button', { name: /^Bassin de la Villette/ })).toHaveCount(0)

  const reviewer = await reviewerPage(browser)
  await reviewer.getByRole('tab', { name: /^Địa điểm/ }).click()
  const card = reviewer.getByRole('article', { name: 'Bassin de la Villette' })
  await card.getByRole('button', { name: 'Duyệt' }).click()
  await expect(card).toHaveCount(0)

  await visitor.reload()
  await expect(visitor.getByRole('button', { name: /^Bassin de la Villette/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /^Bassin de la Villette/ })).not.toContainText('Chờ duyệt')
})

test('moderation - a rejected photo: the author is notified and sees the reason in "My posts"', async ({
  page,
  browser,
}) => {
  const eiffel = await spotId('eiffel')
  await page.goto(`/spots/${eiffel}/add-photo`)
  await page.getByLabel('2. Chọn ảnh').setInputFiles(IMAGES.noExif)
  await acceptTerms(page)
  await page.getByRole('button', { name: 'Tải ảnh lên' }).click()
  await expect(page).toHaveURL(`/spots/${eiffel}/photos`)
  await closeRecoveryCode(page)
  // Shown to its uploader with its status.
  await expect(page.getByText('Chờ duyệt')).toBeVisible()

  const reviewer = await reviewerPage(browser)
  // The review queue shows a spot's original (French) name.
  const card = reviewer.getByRole('article', { name: 'Tour Eiffel' })
  await card.getByLabel('Lý do từ chối').selectOption('people_identifiable')
  await card.getByRole('button', { name: 'Từ chối' }).click()
  await expect(card).toHaveCount(0)

  await page.goto('/')
  const account = page.getByRole('button', { name: /Tài khoản của bạn: .*1 thông báo mới/ })
  await expect(account).toBeVisible()
  await account.click()
  await page.getByRole('menuitem', { name: 'Bài của tôi (1)' }).click()
  await expect(page).toHaveURL('/me/posts')
  await expect(page.getByText('Không được duyệt')).toBeVisible()
  await expect(page.getByText('Có người nhận ra được mặt')).toBeVisible()
  // Seen: back on the map, the badge is gone.
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Tài khoản của bạn: [^(]+$/ })).toBeVisible()
})

test('moderation - a visitor reports a photo; the reviewer hides it', async ({ page, browser }) => {
  const louvre = await spotId('louvre')
  await uploadPhoto(louvre, IMAGES.noExif, { author: 'Bảo' })
  await page.goto(`/spots/${louvre}/photos`)
  await page.getByRole('button', { name: 'Xem ảnh 1' }).click()
  await page.getByRole('button', { name: 'Báo cáo ảnh' }).click()
  const dialog = page.getByRole('dialog', { name: 'Báo cáo vi phạm' })
  await dialog.getByLabel('Lý do').selectOption('copyright')
  await dialog.getByLabel('Chi tiết (tuỳ chọn)').fill('Ảnh của tôi, đăng lại không xin phép')
  await dialog.getByRole('button', { name: 'Gửi báo cáo' }).click()
  await expect(dialog.getByRole('status')).toContainText('Cảm ơn')

  const reviewer = await reviewerPage(browser)
  await reviewer.getByRole('tab', { name: /^Báo cáo/ }).click()
  const report = reviewer.getByRole('article', { name: 'Musée du Louvre' })
  await expect(report).toContainText('Vi phạm bản quyền')
  await expect(report).toContainText('Ảnh của tôi, đăng lại không xin phép')
  await report.getByRole('button', { name: 'Ẩn nội dung' }).click()
  await expect(report).toHaveCount(0)

  await page.goto(`/spots/${louvre}/photos`)
  await expect(page.getByText('Chưa có ảnh nào')).toBeVisible()
})

test('moderation - the new pages pass axe (review queue, my posts, staff sign-in)', async ({ page, browser }) => {
  const eiffel = await spotId('eiffel')
  await uploadPhoto(eiffel, IMAGES.withExif, { pending: true })
  const reviewer = await reviewerPage(browser)
  await expect(reviewer.getByRole('article').first()).toBeVisible()
  const check = async (p: Page) =>
    (await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    )
  expect(await check(reviewer)).toEqual([])

  await page.goto('/staff/sign-in')
  expect(await check(page)).toEqual([])
  await page.goto('/me/posts')
  await expect(page.getByRole('heading', { level: 1, name: 'Bài của tôi' })).toBeVisible()
  expect(await check(page)).toEqual([])
})
