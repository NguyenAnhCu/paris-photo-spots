// Builds a minimal JPEG whose APP1 segment holds a TIFF/EXIF block, byte by byte. Tests see exactly which tags
// are present, and both byte orders (II = little endian, MM = big endian) can be produced.
type Tag =
  | { tag: number; type: 'ascii'; value: string }
  | { tag: number; type: 'short'; value: number }
  | { tag: number; type: 'long'; value: number }
  | { tag: number; type: 'rational'; value: [number, number] }

export type ExifSpec = { ifd0?: Tag[]; exif?: Tag[]; littleEndian?: boolean }

const TYPE = { ascii: 2, short: 3, long: 4, rational: 5 } as const
const EXIF_POINTER = 0x8769

export function jpegWithExif({ ifd0 = [], exif = [], littleEndian = true }: ExifSpec): ArrayBuffer {
  const ifd0Tags: Tag[] = exif.length ? [...ifd0, { tag: EXIF_POINTER, type: 'long', value: 0 }] : ifd0
  const ifdSize = (n: number) => 2 + n * 12 + 4
  const extraSize = (tags: Tag[]) =>
    tags.reduce(
      (sum, t) =>
        sum + (t.type === 'rational' ? 8 : t.type === 'ascii' && t.value.length + 1 > 4 ? t.value.length + 1 : 0),
      0,
    )

  const ifd0Offset = 8
  const exifOffset = ifd0Offset + ifdSize(ifd0Tags.length) + extraSize(ifd0Tags)
  const tiffSize = exifOffset + (exif.length ? ifdSize(exif.length) + extraSize(exif) : 0)
  const tiff = new DataView(new ArrayBuffer(tiffSize))
  const le = littleEndian

  tiff.setUint16(0, le ? 0x4949 : 0x4d4d)
  tiff.setUint16(2, 42, le)
  tiff.setUint32(4, ifd0Offset, le)

  const writeIfd = (start: number, tags: Tag[]) => {
    let data = start + ifdSize(tags.length) // out-of-line values follow the IFD
    tiff.setUint16(start, tags.length, le)
    tags.forEach((t, i) => {
      const entry = start + 2 + i * 12
      tiff.setUint16(entry, t.tag, le)
      tiff.setUint16(entry + 2, TYPE[t.type], le)
      if (t.type === 'ascii') {
        const bytes = [...t.value].map((c) => c.charCodeAt(0)).concat(0)
        tiff.setUint32(entry + 4, bytes.length, le)
        const at = bytes.length > 4 ? data : entry + 8
        if (bytes.length > 4) {
          tiff.setUint32(entry + 8, data, le)
          data += bytes.length
        }
        bytes.forEach((b, j) => tiff.setUint8(at + j, b))
      } else if (t.type === 'rational') {
        tiff.setUint32(entry + 4, 1, le)
        tiff.setUint32(entry + 8, data, le)
        tiff.setUint32(data, t.value[0], le)
        tiff.setUint32(data + 4, t.value[1], le)
        data += 8
      } else {
        tiff.setUint32(entry + 4, 1, le)
        const value = t.tag === EXIF_POINTER ? exifOffset : t.value
        if (t.type === 'short') tiff.setUint16(entry + 8, value, le)
        else tiff.setUint32(entry + 8, value, le)
      }
    })
    tiff.setUint32(start + 2 + tags.length * 12, 0, le) // no next IFD
  }
  writeIfd(ifd0Offset, ifd0Tags)
  if (exif.length) writeIfd(exifOffset, exif)

  const app1Length = 2 + 6 + tiffSize
  const out = new Uint8Array(2 + 2 + app1Length + 2)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0xffd8) // SOI
  view.setUint16(2, 0xffe1) // APP1
  view.setUint16(4, app1Length)
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6) // "Exif\0\0"
  out.set(new Uint8Array(tiff.buffer), 12)
  view.setUint16(out.length - 2, 0xffd9) // EOI
  return out.buffer
}

// A typical phone/camera photo: Sony body + lens, 35mm f/1.8 1/250s ISO 100.
export const SONY_EXIF: ExifSpec = {
  ifd0: [
    { tag: 0x010f, type: 'ascii', value: 'Sony' },
    { tag: 0x0110, type: 'ascii', value: 'Sony ILCE-7M4' },
  ],
  exif: [
    { tag: 0x829a, type: 'rational', value: [1, 250] },
    { tag: 0x829d, type: 'rational', value: [18, 10] },
    { tag: 0x8827, type: 'short', value: 100 },
    { tag: 0x920a, type: 'rational', value: [35, 1] },
    { tag: 0xa434, type: 'ascii', value: 'FE 35mm F1.4 GM' },
  ],
}
