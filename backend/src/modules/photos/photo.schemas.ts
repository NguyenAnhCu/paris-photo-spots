import { z } from 'zod'

// EXIF summary is read in the browser (frontend lib/exif.ts) and sent as form fields; the stored image itself has
// no metadata. Formats mirror what parseExif produces ("35mm", "f/1.8", "1/250s", "100").
// Blank form fields (empty or only spaces) mean "not given" and are stored as NULL, never as ''. The blank check runs
// first: a free-text pattern such as /^[^<>]*$/ also matches '' and would otherwise let it through.
const optionalText = (re: RegExp, max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).regex(re).optional(),
  )

export const UploadPhotoFields = z.object({
  spot_id: z.string().uuid(),
  focal: optionalText(/^\d{1,4}mm$/, 10),
  aperture: optionalText(/^f\/\d{1,2}(\.\d{1,2})?$/, 10),
  shutter: optionalText(/^(1\/\d{1,6}|\d{1,4}(\.\d{1,2})?)s$/, 12),
  iso: optionalText(/^\d{1,7}$/, 7),
  camera: optionalText(/^[^<>]*$/, 120),
})
export type UploadPhotoFields = z.infer<typeof UploadPhotoFields>

export const ListPhotosBody = z.object({
  spot_id: z.string().uuid(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(60).default(24),
})
export type ListPhotosBody = z.infer<typeof ListPhotosBody>

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
