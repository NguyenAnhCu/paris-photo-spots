// Real sharp, real files in a temporary STORAGE_DIR (vitest.config.ts): this is where uploaded photos lose their GPS.
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { hasGps, jpegRotatedPortrait, jpegWithGps, notAnImage, pngImage } from '../../test/fixtures/images.js'
import { photoUrl, removePhoto, savePhoto, STORAGE_ROOT } from './photoStorage.js'

// writeFile stays real unless a test makes one call fail (disk full between the photo and its thumbnail).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

const PHOTOS_DIR = path.join(STORAGE_ROOT, 'photos')
const listPhotos = () => readdir(PHOTOS_DIR).catch(() => [] as string[])
const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  )

afterAll(async () => {
  await rm(STORAGE_ROOT, { recursive: true, force: true })
})

describe('savePhoto', () => {
  it('removes all metadata, GPS included', async () => {
    const input = await jpegWithGps()
    expect(hasGps((await sharp(input).metadata()).exif)).toBe(true) // the fixture really has GPS

    const stored = await savePhoto(input)
    for (const name of [stored.fileName, stored.thumbName]) {
      const meta = await sharp(await readFile(path.join(PHOTOS_DIR, name))).metadata()
      expect(meta.exif).toBeUndefined()
      expect(meta.format).toBe('jpeg')
    }
  })

  it('caps the long edge at IMAGE_MAX_EDGE (2048) and the thumbnail at THUMB_EDGE (400)', async () => {
    const stored = await savePhoto(await jpegWithGps(4000, 3000))
    expect([stored.width, stored.height]).toEqual([2048, 1536])
    const thumb = await sharp(await readFile(path.join(PHOTOS_DIR, stored.thumbName))).metadata()
    expect([thumb.width, thumb.height]).toEqual([400, 300])
  })

  it('never enlarges small images', async () => {
    const stored = await savePhoto(await pngImage(300, 200))
    expect([stored.width, stored.height]).toEqual([300, 200])
  })

  it('applies the EXIF orientation before dropping it (portrait phone photos stay upright)', async () => {
    const stored = await savePhoto(await jpegRotatedPortrait())
    expect([stored.width, stored.height]).toEqual([400, 600])
  })

  it('converts PNG to JPEG with unique UUID names', async () => {
    const a = await savePhoto(await pngImage())
    const b = await savePhoto(await pngImage())
    expect(a.fileName).toMatch(/^[0-9a-f-]{36}\.jpg$/)
    expect(a.thumbName).toBe(a.fileName.replace('.jpg', '_thumb.jpg'))
    expect(a.fileName).not.toBe(b.fileName)
  })

  it('rejects bytes that are not an image with 400 INVALID_IMAGE and writes nothing', async () => {
    const before = await listPhotos()
    await expect(savePhoto(notAnImage)).rejects.toMatchObject({ code: 'INVALID_IMAGE', status: 400 })
    expect(await listPhotos()).toEqual(before)
  })

  // Regression: a 758 KB PNG of 16000×16000 px passed the 10 MB upload limit and cost ~265 MB RAM to decode.
  it('rejects images above IMAGE_MAX_INPUT_PIXELS with 400 IMAGE_TOO_LARGE before decoding them', async () => {
    const huge = await sharp({ create: { width: 12_000, height: 9_000, channels: 3, background: '#808080' } })
      .png({ compressionLevel: 9 })
      .toBuffer()
    expect(huge.length).toBeLessThan(10 * 1024 * 1024) // small enough to pass the upload size limit
    const before = await listPhotos()
    await expect(savePhoto(huge)).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE', status: 400 })
    expect(await listPhotos()).toEqual(before)
  })

  it('removes the full-size file when writing the thumbnail fails', async () => {
    const realWriteFile = vi.mocked(writeFile).getMockImplementation()
    if (!realWriteFile) throw new Error('writeFile mock has no implementation')
    vi.mocked(writeFile)
      .mockImplementationOnce(realWriteFile)
      .mockRejectedValueOnce(Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }))
    const input = await pngImage()
    const before = await listPhotos()
    await expect(savePhoto(input)).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(await listPhotos()).toEqual(before)
  })
})

describe('removePhoto / photoUrl', () => {
  it('deletes both files and tolerates files that are already gone', async () => {
    const stored = await savePhoto(await pngImage())
    await removePhoto(stored)
    expect(await exists(path.join(PHOTOS_DIR, stored.fileName))).toBe(false)
    expect(await exists(path.join(PHOTOS_DIR, stored.thumbName))).toBe(false)
    await expect(removePhoto(stored)).resolves.toBeUndefined()
  })

  it('builds the public /media URL', () => {
    expect(photoUrl('abc.jpg')).toBe('/media/photos/abc.jpg')
  })
})
