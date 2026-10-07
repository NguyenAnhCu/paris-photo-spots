import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { jpegWithGps, pngImage } from '../../test/fixtures/images.js'
import { differenceHash, gpsBand, gpsFromExif, hammingDistance, SAME_IMAGE_MAX_DISTANCE } from './imageSignals.js'

const EIFFEL: [number, number] = [2.2945, 48.8584]
const exifOf = async (buf: Buffer) => (await sharp(buf).metadata()).exif

// A gradient, so the hash has structure (a solid colour hashes to all zeros).
const gradient = (w: number, h: number, flip = false) => {
  const data = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.round(((flip ? w - x : x) / w) * 200 + (y / h) * 55)
      data.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3)
    }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } })
}

describe('gpsFromExif / gpsBand', () => {
  it('reads the position a phone wrote (degrees, minutes, seconds + N/E)', async () => {
    const at = gpsFromExif(await exifOf(await jpegWithGps()))
    expect(at?.[0]).toBeCloseTo(2.2944, 3)
    expect(at?.[1]).toBeCloseTo(48.8583, 3)
  })

  it('south and west are negative', async () => {
    const buf = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#888' } })
      .withExif({
        IFD3: {
          GPSLatitudeRef: 'S',
          GPSLatitude: '33/1 52/1 0/1',
          GPSLongitudeRef: 'W',
          GPSLongitude: '70/1 30/1 0/1',
        },
      })
      .jpeg()
      .toBuffer()
    expect(gpsFromExif(await exifOf(buf))).toEqual([-70.5, expect.closeTo(-33.8667, 3)])
  })

  it('no EXIF, no GPS or garbage → null, never an error', async () => {
    expect(gpsFromExif(undefined)).toBeNull()
    expect(gpsFromExif(await exifOf(await pngImage()))).toBeNull()
    expect(gpsFromExif(Buffer.from('Exif\0\0garbage'))).toBeNull()
  })

  it('bands the distance to the spot', () => {
    expect(gpsBand([2.2946, 48.8585], EIFFEL)).toBe('lt200m')
    expect(gpsBand([2.3, 48.86], EIFFEL)).toBe('lt1km')
    expect(gpsBand([2.35, 48.85], EIFFEL)).toBe('far')
    expect(gpsBand(null, EIFFEL)).toBe('none')
  })
})

describe('differenceHash', () => {
  it('the same picture resized and recompressed hashes (almost) the same', async () => {
    const original = await gradient(800, 600).jpeg({ quality: 90 }).toBuffer()
    const smaller = await sharp(original).resize(400).jpeg({ quality: 50 }).toBuffer()
    const [a, b] = [await differenceHash(original), await differenceHash(smaller)]
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(SAME_IMAGE_MAX_DISTANCE)
  })

  it('a different picture is far away', async () => {
    const a = await differenceHash(await gradient(800, 600).jpeg().toBuffer())
    const b = await differenceHash(await gradient(800, 600, true).jpeg().toBuffer())
    expect(hammingDistance(a, b)).toBeGreaterThan(SAME_IMAGE_MAX_DISTANCE)
  })

  it('hammingDistance counts differing bits', () => {
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4)
    expect(hammingDistance('ffffffffffffffff', 'ffffffffffffffff')).toBe(0)
  })
})
