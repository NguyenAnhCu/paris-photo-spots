// Reads a small EXIF summary from a JPEG ArrayBuffer, in the browser, before upload (the server strips all
// metadata). Typed (no `any`), and parse failures are reported to the
// caller instead of being swallowed. JPEG only — HEIC/PNG return { kind: 'missing' }.
import type { ExifSummary } from '../types/spot'

export type ExifResult = { kind: 'ok'; exif: ExifSummary } | { kind: 'missing' } | { kind: 'error'; error: Error }

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }
const TAG = {
  make: 0x010f,
  model: 0x0110,
  exifPointer: 0x8769,
  exposureTime: 0x829a,
  fNumber: 0x829d,
  iso: 0x8827,
  focalLength: 0x920a,
  lensModel: 0xa434,
} as const

type RawValue = number | string | null
type Raw = { make?: string; model?: string; lens?: string; t?: number; f?: number; iso?: number; focal?: number }

export function parseExif(buf: ArrayBuffer): ExifResult {
  try {
    const view = new DataView(buf)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return { kind: 'missing' }
    let offset = 2
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset)
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
        const exif = summarize(readTiff(view, offset + 10))
        return exif ? { kind: 'ok', exif } : { kind: 'missing' }
      }
      if ((marker & 0xff00) !== 0xff00) break
      offset += 2 + view.getUint16(offset + 2)
    }
    return { kind: 'missing' }
  } catch (err) {
    // Truncated/corrupt EXIF blocks throw RangeError: let the UI fall back to manual entry and say so.
    return { kind: 'error', error: err instanceof Error ? err : new Error(String(err)) }
  }
}

function readTiff(view: DataView, start: number): Raw {
  const littleEndian = view.getUint16(start) === 0x4949
  const u16 = (o: number) => view.getUint16(o, littleEndian)
  const u32 = (o: number) => view.getUint32(o, littleEndian)
  const readIfd = (ifd: number, onTag: (tag: number, value: RawValue) => void) => {
    const count = u16(ifd)
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12
      const tag = u16(entry)
      const type = u16(entry + 2)
      const n = u32(entry + 4)
      const size = (TYPE_SIZE[type] ?? 1) * n
      const valueOffset = size > 4 ? start + u32(entry + 8) : entry + 8
      let value: RawValue = null
      if (type === 3) value = u16(valueOffset)
      else if (type === 4) value = u32(valueOffset)
      else if (type === 5) value = u32(valueOffset + 4) ? u32(valueOffset) / u32(valueOffset + 4) : 0
      else if (type === 2) {
        let s = ''
        for (let j = 0; j < n - 1; j++) s += String.fromCharCode(view.getUint8(valueOffset + j))
        value = s.trim()
      }
      onTag(tag, value)
    }
  }
  const raw: Raw = {}
  let exifPointer = 0
  readIfd(start + u32(start + 4), (tag, v) => {
    if (tag === TAG.make && typeof v === 'string') raw.make = v
    if (tag === TAG.model && typeof v === 'string') raw.model = v
    if (tag === TAG.exifPointer && typeof v === 'number') exifPointer = v
  })
  if (exifPointer) {
    readIfd(start + exifPointer, (tag, v) => {
      if (typeof v === 'number') {
        if (tag === TAG.exposureTime) raw.t = v
        if (tag === TAG.fNumber) raw.f = v
        if (tag === TAG.iso) raw.iso = v
        if (tag === TAG.focalLength) raw.focal = v
      } else if (tag === TAG.lensModel && typeof v === 'string') raw.lens = v
    })
  }
  return raw
}

export function formatShutter(t: number): string {
  return t >= 1 ? `${Math.round(t * 10) / 10}s` : `1/${Math.round(1 / t)}s`
}

function summarize(r: Raw): ExifSummary | null {
  if (!r.f && !r.iso && !r.t && !r.focal) return null
  // "Sony" + "Sony ILCE-7M4" would read "Sony · Sony ILCE-7M4": drop the make when the model already starts with it.
  const make = r.make && r.model?.startsWith(r.make) ? undefined : r.make
  const camera = [make, r.model, r.lens].filter(Boolean).join(' · ')
  return {
    focal: r.focal ? `${Math.round(r.focal)}mm` : undefined,
    aperture: r.f ? `f/${Math.round(r.f * 10) / 10}` : undefined,
    shutter: r.t ? formatShutter(r.t) : undefined,
    iso: r.iso ? String(r.iso) : undefined,
    camera: camera || undefined,
  }
}
