import { z } from 'zod'
import { env } from '../../config/env.js'

export const PHOTO_CATEGORIES = [
  'landmark',
  'street',
  'skyline',
  'bridge',
  'park',
  'rooftop',
  'wedding',
  'suburb',
] as const
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]

export const SPOT_LANGS = ['vi', 'en', 'fr'] as const
export type SpotLang = (typeof SPOT_LANGS)[number]

const lang = z.enum(SPOT_LANGS).default('vi')

export const ListSpotsQuery = z.object({ lang })
export type ListSpotsQuery = z.infer<typeof ListSpotsQuery>

export const SpotItemQuery = z.object({ id: z.string().uuid(), lang })
export type SpotItemQuery = z.infer<typeof SpotItemQuery>

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)

export const CreateSpotBody = z.object({
  name: trimmed(env.SPOT_NAME_MIN_LENGTH, env.SPOT_NAME_MAX_LENGTH),
  photo_category: z.enum(PHOTO_CATEGORIES),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  tip: trimmed(0, env.SPOT_TIP_MAX_LENGTH).optional(),
  lang,
})
export type CreateSpotBody = z.infer<typeof CreateSpotBody>
