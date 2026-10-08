// "Thêm mark" on desktop: place on the map, photo with EXIF (auto-fill) or without (manual), post, duplicates.
// The stored photo must carry no metadata: the GPS position in the original is private.
import path from 'node:path'
import type { Page } from '@playwright/test'
import sharp from 'sharp'
import { query, spotId } from '../support/db.js'
import { STORAGE_DIR } from '../support/env.js'
import { acceptTerms, closeRecoveryCode } from '../support/identity.js'
import { IMAGES, WITH_EXIF } from '../support/images.js'
import { camera, clickMapAt, waitForPins } from '../support/map.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

// Canal Saint-Martin: inside the default view, away from every seeded spot.
const CANAL: [number, number] = [2.3655, 48.8712]

async function openForm(page: Page) {
  await page.goto('/')
  await waitForPins(page)
  await page.getByRole('button', { name: 'Thêm mark' }).click()
  await expect(page.getByRole('heading', { name: 'Thêm mark' })).toBeVisible()
}

// EXIF tag 0x8825 points to the GPS block; look for it in either byte order.
const hasGpsTag = (exif: Buffer | undefined) =>
  !!exif && (exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88])))

const exifField = (page: Page, label: string) => page.getByRole('textbox', { name: label, exact: true })

test('add mark - photo with EXIF fills the camera fields; posting opens the new spot', async ({ page }) => {
  await openForm(page)
  await clickMapAt(page, CANAL)
  await expect(page.getByText(/48\.871\d+, 2\.365\d+ · chạm bản đồ để đổi/)).toBeVisible()

  await page.getByLabel('2. Chọn ảnh').setInputFiles(IMAGES.withExif)

  await expect(page.getByText('Đã đọc tự động từ ảnh')).toBeVisible()
  await expect(exifField(page, 'Tiêu cự')).toHaveValue(WITH_EXIF.focal)
  await expect(exifField(page, 'Khẩu độ')).toHaveValue(WITH_EXIF.aperture)
  await expect(exifField(page, 'Tốc độ chụp')).toHaveValue(WITH_EXIF.shutter)
  await expect(exifField(page, 'ISO')).toHaveValue(WITH_EXIF.iso)
  await expect(page.getByText(WITH_EXIF.camera)).toBeVisible()

  await page.getByLabel('Tên địa điểm').fill('Canal Saint-Martin')
  await page.getByLabel('Category').selectOption('bridge')
  await page.getByLabel('Ghi chú cho người chụp sau').fill('Cầu sắt màu xanh lúc chiều.')
  await expect(page.getByLabel('Tên của bạn (tuỳ chọn)')).toHaveCount(0) // the author is the posting identity now
  await acceptTerms(page)
  await page.getByRole('button', { name: 'Đăng mark' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Canal Saint-Martin' })).toBeVisible()
  await closeRecoveryCode(page)
  const [spot] = await query<{ id: string; source: string; photo_category: string; lng: number; lat: number }>(
    `SELECT id, source, photo_category, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM pois WHERE name = 'Canal Saint-Martin'`,
  )
  expect(spot).toMatchObject({ source: 'user', photo_category: 'bridge' })
  expect(spot?.lng).toBeCloseTo(CANAL[0], 3)
  expect(spot?.lat).toBeCloseTo(CANAL[1], 3)
  await expect(page).toHaveURL(`/spots/${spot?.id}`)

  const [photo] = await query<{
    file_name: string
    focal: string
    aperture: string
    author: string
    anonymous: boolean
  }>(
    `SELECT ph.file_name, ph.focal, ph.aperture, u.display_name AS author, u.is_anonymous AS anonymous
     FROM photos ph JOIN users u ON u.id = ph.user_id WHERE ph.poi_id = $1`,
    [spot?.id],
  )
  // Posted by the anonymous identity created for this first post.
  expect(photo).toMatchObject({
    focal: '35mm',
    aperture: 'f/1.8',
    author: expect.stringMatching(/^Lữ khách \d{4}$/),
    anonymous: true,
  })
  expect(hasGpsTag((await sharp(IMAGES.withExif).metadata()).exif), 'the uploaded original carries GPS').toBe(true)
  const stored = await sharp(path.join(STORAGE_DIR, 'photos', photo?.file_name ?? '')).metadata()
  expect(stored.exif, 'stored photo keeps no EXIF').toBeUndefined()
  expect(hasGpsTag(stored.exif), 'stored photo has no GPS').toBe(false)
})

test('add mark - photo without EXIF is entered by hand', async ({ page }) => {
  await openForm(page)
  await clickMapAt(page, [2.3, 48.875])

  await page.getByLabel('2. Chọn ảnh').setInputFiles(IMAGES.noExif)
  await expect(page.getByText('Ảnh không có EXIF, nhập tay')).toBeVisible()
  await expect(exifField(page, 'Tiêu cự')).toHaveValue('')
  await exifField(page, 'Tiêu cự').fill('50mm')
  await exifField(page, 'ISO').fill('400')

  await page.getByLabel('Tên địa điểm').fill('Parc Monceau')
  await acceptTerms(page)
  await page.getByRole('button', { name: 'Đăng mark' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Parc Monceau' })).toBeVisible()
  await closeRecoveryCode(page)
  const rows = await query<{ focal: string; iso: string; aperture: string | null }>(
    `SELECT ph.focal, ph.iso, ph.aperture FROM photos ph JOIN pois p ON p.id = ph.poi_id WHERE p.name = 'Parc Monceau'`,
  )
  expect(rows).toEqual([{ focal: '50mm', iso: '400', aperture: null }])
})

test('add mark - the button stays disabled until a place, a name and the terms are given', async ({ page }) => {
  await openForm(page)
  const submit = page.getByRole('button', { name: 'Đăng mark' })
  await expect(submit).toBeDisabled()

  await page.getByLabel('Tên địa điểm').fill('Quai de Valmy')
  await expect(submit).toBeDisabled()

  await clickMapAt(page, [2.365, 48.874])
  await expect(submit).toBeDisabled()
  await acceptTerms(page)
  await expect(submit).toBeEnabled()
})

test.describe('duplicates', () => {
  // The API answers 409 and the browser logs it; the form turns it into a message with a way out.
  test.use({ allowedConsoleErrors: [/status of 409/] })

  test('add mark - a mark on top of an existing spot offers to open that spot', async ({ page }) => {
    const eiffel = await spotId('eiffel')
    await openForm(page)
    await clickMapAt(page, [2.2945, 48.8584])
    await page.getByLabel('Tên địa điểm').fill('Tháp Eiffel lần nữa')
    await acceptTerms(page)
    await page.getByRole('button', { name: 'Đăng mark' }).click()

    await expect(page.getByRole('alert')).toContainText('Đã có một địa điểm ngay tại vị trí này.')
    await page.getByRole('button', { name: 'Mở địa điểm đã có' }).click()

    await expect(page).toHaveURL(`/spots/${eiffel}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Tháp Eiffel' })).toBeVisible()
    expect((await camera(page)).zoom).toBeGreaterThanOrEqual(15)
    expect(await query(`SELECT 1 FROM pois WHERE name = 'Tháp Eiffel lần nữa'`)).toEqual([])
  })
})
