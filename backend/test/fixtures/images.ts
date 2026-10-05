// Test images are generated, not committed: small, deterministic, and the EXIF content is visible right here.
import sharp from 'sharp'

const SOLID = { r: 180, g: 140, b: 100 }

// A photo as a phone would send it: camera tags plus GPS coordinates of the Eiffel Tower.
export async function jpegWithGps(width = 1200, height = 800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: SOLID } })
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'TestCam X100' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 30/1', GPSLongitudeRef: 'E', GPSLongitude: '2/1 17/1 40/1' },
    })
    .jpeg()
    .toBuffer()
}

// Landscape pixels with EXIF orientation 6 ("rotate 90° clockwise to display"): what portrait phone photos look like.
export async function jpegRotatedPortrait(): Promise<Buffer> {
  return sharp({ create: { width: 600, height: 400, channels: 3, background: SOLID } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()
}

export async function pngImage(width = 300, height = 200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { ...SOLID, alpha: 1 } } })
    .png()
    .toBuffer()
}

export const notAnImage = Buffer.from('this is plain text, not an image')

// GPS data lives in its own IFD, linked from IFD0 by tag 0x8825 (GPSInfo). The text "GPS" never appears in the
// bytes, so look for the tag id in either byte order (TIFF header II = little endian, MM = big endian).
export function hasGps(exif: Buffer | undefined): boolean {
  if (!exif) return false
  return exif.includes(Buffer.from([0x25, 0x88])) || exif.includes(Buffer.from([0x88, 0x25]))
}
