// Hints for reviewers, computed from the uploaded file before its metadata is stripped: how far the photo's own GPS
// position is from the spot (kept only as a band, never the coordinates), and a perceptual hash to spot re-uploads.
import exifReader from 'exif-reader'
import sharp from 'sharp'
import { haversineMeters, type LngLat } from './geo.js'

export type GpsBand = 'lt200m' | 'lt1km' | 'far' | 'none'

type Dms = number[] | undefined
const toDegrees = (dms: Dms, ref: string | undefined) => {
  if (!dms || dms.length < 3 || dms.some((n) => !Number.isFinite(n))) return null
  const value = (dms[0] ?? 0) + (dms[1] ?? 0) / 60 + (dms[2] ?? 0) / 3600
  return ref === 'S' || ref === 'W' ? -value : value
}

// [lng, lat] from the EXIF block of the original upload, or null (no EXIF, no GPS, unreadable).
export function gpsFromExif(exif: Buffer | undefined): LngLat | null {
  if (!exif) return null
  try {
    const gps = exifReader(exif).GPSInfo
    const lat = toDegrees(gps?.GPSLatitude as Dms, gps?.GPSLatitudeRef as string | undefined)
    const lng = toDegrees(gps?.GPSLongitude as Dms, gps?.GPSLongitudeRef as string | undefined)
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return [lng, lat]
  } catch {
    // Corrupt or exotic EXIF: no hint rather than a failed upload.
    return null
  }
}

export function gpsBand(photo: LngLat | null, spot: LngLat): GpsBand {
  if (!photo) return 'none'
  const meters = haversineMeters(photo, spot)
  return meters < 200 ? 'lt200m' : meters < 1000 ? 'lt1km' : 'far'
}

// dHash: 9×8 greyscale, one bit per "left pixel brighter than right". Survives resizing and recompression.
export async function differenceHash(image: Buffer): Promise<string> {
  const pixels = await sharp(image).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let bits = 0n
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = pixels[row * 9 + col] ?? 0
      const right = pixels[row * 9 + col + 1] ?? 0
      bits = (bits << 1n) | (left > right ? 1n : 0n)
    }
  }
  return bits.toString(16).padStart(16, '0')
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let count = 0
  while (x) {
    count += Number(x & 1n)
    x >>= 1n
  }
  return count
}

// Hashes this close are treated as the same picture.
export const SAME_IMAGE_MAX_DISTANCE = 6

// Reviewer hints for an upload. Call after the image passed savePhoto() (pixel limit checked): the GPS position is read
// from the original's EXIF header (metadata() does not decode pixels) and kept only as a band; the hash is computed on
// the small stored thumbnail.
export async function photoSignals(
  original: Buffer,
  thumb: Buffer,
  spot: LngLat,
): Promise<{ gps_distance: GpsBand; phash: string }> {
  const { exif } = await sharp(original).metadata()
  return { gps_distance: gpsBand(gpsFromExif(exif), spot), phash: await differenceHash(thumb) }
}
