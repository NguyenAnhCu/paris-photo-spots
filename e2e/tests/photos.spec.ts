// Community photos on an existing spot (desktop): add a photo, then browse them in the viewer.
import { query, spotId } from '../support/db.js'
import { uploadPhoto } from '../support/api.js'
import { IMAGES, WITH_EXIF } from '../support/images.js'
import { expect, test, useFreshDatabase } from '../support/test.js'

useFreshDatabase()

test('photos - "Thêm ảnh" on a spot uploads the photo with its EXIF and opens the spot photos', async ({ page }) => {
  const pontNeuf = await spotId('pontNeuf')
  await page.goto(`/spots/${pontNeuf}`)
  await page.getByRole('button', { name: 'Thêm ảnh' }).click()
  await expect(page).toHaveURL(`/spots/${pontNeuf}/add-photo`)

  const submit = page.getByRole('button', { name: 'Tải ảnh lên' })
  await expect(submit).toBeDisabled()
  await page.getByLabel('2. Chọn ảnh').setInputFiles(IMAGES.withExif)
  await expect(page.getByText('Đã đọc tự động từ ảnh')).toBeVisible()
  await page.getByLabel('Tên của bạn (tuỳ chọn)').fill('Hà')
  await submit.click()

  await expect(page).toHaveURL(`/spots/${pontNeuf}/photos`)
  await expect(page.getByRole('button', { name: 'Xem ảnh 1' })).toBeVisible()
  const rows = await query<{ author_name: string; focal: string; camera: string }>(
    'SELECT author_name, focal, camera FROM photos WHERE poi_id = $1',
    [pontNeuf],
  )
  expect(rows).toEqual([{ author_name: 'Hà', focal: WITH_EXIF.focal, camera: WITH_EXIF.camera }])
})

test('photos - viewer: next/previous, EXIF of the shown photo, Escape back to the grid then out of the spot', async ({
  page,
}) => {
  const louvre = await spotId('louvre')
  // Newest first in the gallery: uploaded in reverse so "Xem ảnh 1" is Bảo.
  await uploadPhoto(louvre, IMAGES.noExif, { author_name: 'Châu' })
  await uploadPhoto(louvre, IMAGES.noExif, { author_name: 'Bảo', focal: '85mm', aperture: 'f/2' })
  await page.goto(`/spots/${louvre}/photos`)

  await page.getByRole('button', { name: 'Xem ảnh 1' }).click()
  await expect(page.getByRole('img', { name: 'Ảnh Bảo tàng Louvre của Bảo' })).toBeVisible()
  await expect(page.getByText('85mm')).toBeVisible()

  await page.getByRole('button', { name: 'Ảnh sau' }).click()
  await expect(page.getByRole('img', { name: 'Ảnh Bảo tàng Louvre của Châu' })).toBeVisible()
  await expect(page.getByText('85mm')).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('img', { name: 'Ảnh Bảo tàng Louvre của Bảo' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Xem ảnh 2' })).toBeVisible()
  await expect(page).toHaveURL(`/spots/${louvre}/photos`)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
})
