import { describe, expect, it } from 'vitest'
import { jpegWithExif, SONY_EXIF } from '@/test/jpegExif'
import { formatShutter, parseExif } from './exif'

describe('parseExif', () => {
  it('summarizes focal, aperture, shutter, ISO and camera (make dropped when the model repeats it)', () => {
    expect(parseExif(jpegWithExif(SONY_EXIF))).toEqual({
      kind: 'ok',
      exif: {
        focal: '35mm',
        aperture: 'f/1.8',
        shutter: '1/250s',
        iso: '100',
        camera: 'Sony ILCE-7M4 · FE 35mm F1.4 GM',
      },
    })
  })

  it('reads big-endian (MM) EXIF the same way', () => {
    expect(parseExif(jpegWithExif({ ...SONY_EXIF, littleEndian: false }))).toEqual(parseExif(jpegWithExif(SONY_EXIF)))
  })

  it('keeps the make when the model does not start with it', () => {
    const result = parseExif(
      jpegWithExif({
        ifd0: [
          { tag: 0x010f, type: 'ascii', value: 'Apple' },
          { tag: 0x0110, type: 'ascii', value: 'iPhone 15' },
        ],
        exif: [{ tag: 0x8827, type: 'short', value: 64 }],
      }),
    )
    expect(result).toEqual({ kind: 'ok', exif: { iso: '64', camera: 'Apple · iPhone 15' } })
  })

  it('reports "missing" for a JPEG with camera name but no exposure data (nothing useful to pre-fill)', () => {
    expect(parseExif(jpegWithExif({ ifd0: SONY_EXIF.ifd0 }))).toEqual({ kind: 'missing' })
  })

  it('reports "missing" for a JPEG without EXIF and for non-JPEG files (PNG, HEIC…)', () => {
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toEqual({ kind: 'missing' })
    expect(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer)).toEqual({
      kind: 'missing',
    })
    expect(parseExif(new ArrayBuffer(0))).toEqual({ kind: 'missing' })
  })

  it('reports "error" (not a crash) for a truncated EXIF block, so the form falls back to manual entry', () => {
    const full = new Uint8Array(jpegWithExif(SONY_EXIF))
    const result = parseExif(full.slice(0, 40).buffer)
    expect(result.kind).toBe('error')
  })
})

describe('formatShutter', () => {
  it('writes fractions below one second and seconds above', () => {
    expect(formatShutter(1 / 250)).toBe('1/250s')
    expect(formatShutter(0.5)).toBe('1/2s')
    expect(formatShutter(2)).toBe('2s')
    expect(formatShutter(1.33)).toBe('1.3s')
  })
})
