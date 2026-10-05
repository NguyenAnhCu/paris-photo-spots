// Real sharp, real files in a temporary STORAGE_DIR (vitest.config.ts): this is where uploaded photos lose their GPS.
import { readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
import { hasGps, jpegRotatedPortrait, jpegWithGps, notAnImage, pngImage } from '../../test/fixtures/images.js'
import { photoUrl, removePhoto, savePhoto, STORAGE_ROOT } from './photoStorage.js'

const PHOTOS_DIR = path.join(STORAGE_ROOT, 'photos')
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
    const before = await import('node:fs/promises').then((fs) => fs.readdir(PHOTOS_DIR).catch(() => []))
    await expect(savePhoto(notAnImage)).rejects.toMatchObject({ code: 'INVALID_IMAGE', status: 400 })
    const after = await import('node:fs/promises').then((fs) => fs.readdir(PHOTOS_DIR).catch(() => []))
    expect(after).toEqual(before)
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
