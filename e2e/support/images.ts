// Test images, generated once per run: a photo with camera EXIF + GPS (auto-fill, then stripped on upload), one with
// no EXIF (manual entry), and the cover served in place of Wikimedia Commons.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { IMAGES_DIR } from './env.js'

export const IMAGES = {
  withExif: path.join(IMAGES_DIR, 'with-exif.jpg'),
  noExif: path.join(IMAGES_DIR, 'no-exif.jpg'),
  cover: path.join(IMAGES_DIR, 'cover.jpg'),
}

// What the add-mark form should show for IMAGES.withExif.
export const WITH_EXIF = { focal: '35mm', aperture: 'f/1.8', shutter: '1/250s', iso: '100', camera: 'Sony · ILCE-7M4' }

const plain = (rgb: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: rgb } })

export async function makeImages(): Promise<void> {
  await mkdir(IMAGES_DIR, { recursive: true })
  await plain({ r: 180, g: 140, b: 100 })
    .withExif({
      IFD0: { Make: 'Sony', Model: 'ILCE-7M4' },
      IFD2: { ExposureTime: '1/250', FNumber: '18/10', ISOSpeedRatings: '100', FocalLength: '35/1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 30/1', GPSLongitudeRef: 'E', GPSLongitude: '2/1 17/1 40/1' },
    })
    .jpeg()
    .toFile(IMAGES.withExif)
  await plain({ r: 90, g: 120, b: 160 }).jpeg().toFile(IMAGES.noExif)
  await plain({ r: 120, g: 150, b: 190 }).jpeg({ quality: 60 }).toFile(IMAGES.cover)
}
