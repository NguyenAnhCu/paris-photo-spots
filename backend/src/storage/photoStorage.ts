// Simplest possible photo storage (decision 2026-10-05): files on the server's disk under STORAGE_DIR/photos,
// served read-only at /media/photos. Swap this module for an object-storage client later; callers only see
// save/remove and public URLs.
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

export const STORAGE_ROOT = path.resolve(env.STORAGE_DIR)
const PHOTOS_DIR = path.join(STORAGE_ROOT, 'photos')
export const MEDIA_URL_PREFIX = '/media'

export type StoredPhoto = { fileName: string; thumbName: string; width: number; height: number }

// Re-encodes to JPEG, which (a) strips all metadata — sharp drops EXIF/GPS unless asked to keep it, so a photo
// never leaks where the uploader lives — and (b) proves the bytes really are an image whatever the MIME header said.
// `.rotate()` applies the EXIF orientation first, otherwise portrait phone photos come out sideways once EXIF is gone.
async function encode(input: Buffer) {
  const full = await sharp(input)
    .rotate()
    .resize({ width: env.IMAGE_MAX_EDGE, height: env.IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: env.IMAGE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  const thumb = await sharp(full.data)
    .resize({ width: env.THUMB_EDGE, height: env.THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: env.IMAGE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
  return { full, thumb }
}

export async function savePhoto(input: Buffer): Promise<StoredPhoto> {
  let encoded: Awaited<ReturnType<typeof encode>>
  try {
    encoded = await encode(input)
  } catch (err) {
    logger.warn({ err }, 'Rejected upload: not a decodable image')
    throw new AppError('INVALID_IMAGE', 400, 'File is not a valid image')
  }
  const { full, thumb } = encoded

  const id = randomUUID()
  const fileName = `${id}.jpg`
  const thumbName = `${id}_thumb.jpg`
  await mkdir(PHOTOS_DIR, { recursive: true })
  await writeFile(path.join(PHOTOS_DIR, fileName), full.data)
  await writeFile(path.join(PHOTOS_DIR, thumbName), thumb)
  return { fileName, thumbName, width: full.info.width, height: full.info.height }
}

// Best-effort cleanup when the DB insert fails after files were written; a leftover file is harmless but logged.
export async function removePhoto(stored: Pick<StoredPhoto, 'fileName' | 'thumbName'>): Promise<void> {
  for (const name of [stored.fileName, stored.thumbName]) {
    await unlink(path.join(PHOTOS_DIR, name)).catch((err: unknown) => {
      logger.warn({ err, name }, 'Could not remove orphan photo file')
    })
  }
}

export const photoUrl = (fileName: string) => `${MEDIA_URL_PREFIX}/photos/${fileName}`
