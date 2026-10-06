import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import { isInBBox, SUPPORTED_SPOT_BBOX } from '../../lib/geo.js'
import { spotRepository, type SpotRow } from './spot.repository.js'
import type { CreateSpotBody, SpotLang } from './spot.schemas.js'

// Commons serves any width by changing the "/1280px-" segment of the thumbnail URL; list cards need far less.
export function resizeCommonsThumb(url: string | null, width: number): string | null {
  if (!url) return null
  return url.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`)
}

const localizedName = (row: Pick<SpotRow, 'name' | 'name_i18n'>, lang: SpotLang) => row.name_i18n?.[lang] || row.name

function toFeature(row: SpotRow, lang: SpotLang) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [row.lng, row.lat] as [number, number] },
    properties: {
      id: row.id,
      name: localizedName(row, lang),
      photo_category: row.photo_category,
      crowd_level: row.crowd_level,
      best_time: row.best_time,
      cover_thumb_url: resizeCommonsThumb(row.cover_photo_url, env.SPOT_LIST_THUMB_WIDTH),
      photo_count: row.photo_count,
    },
  }
}

function toDetail(row: SpotRow, lang: SpotLang) {
  return {
    id: row.id,
    name: localizedName(row, lang),
    name_original: row.name,
    photo_category: row.photo_category,
    lng: row.lng,
    lat: row.lat,
    crowd_level: row.crowd_level,
    best_time: row.best_time,
    tip: row.tip,
    cover: row.cover_photo_url
      ? { url: row.cover_photo_url, page_url: row.cover_photo_page_url, attribution: row.cover_photo_attribution }
      : null,
    photo_count: row.photo_count,
    user_created: row.source === 'user',
  }
}

export const spotService = {
  // All spots at once (a few hundred): the client filters/searches locally and clusters on the map.
  async list(lang: SpotLang) {
    const rows = await spotRepository.listAll()
    return { type: 'FeatureCollection' as const, features: rows.map((r) => toFeature(r, lang)) }
  },

  async byId(id: string, lang: SpotLang) {
    const row = await spotRepository.byId(id)
    if (!row) throw new AppError('SPOT_NOT_FOUND', 404, 'Spot not found')
    return toDetail(row, lang)
  },

  async ensureExists(id: string): Promise<void> {
    if (!(await spotRepository.byId(id))) throw new AppError('SPOT_NOT_FOUND', 404, 'Spot not found')
  },

  async create(body: CreateSpotBody) {
    if (!isInBBox([body.lng, body.lat], SUPPORTED_SPOT_BBOX)) {
      throw new AppError('OUT_OF_AREA', 400, 'Location is outside the supported area')
    }
    const result = await spotRepository.insertUserSpotUnlessDuplicate({
      name: body.name,
      photoCategory: body.photo_category,
      lng: body.lng,
      lat: body.lat,
      tip: body.tip || null,
      // The author typed the name in the UI language: make it the localized name for that language too.
      nameI18n: { [body.lang]: body.name },
      // Block duplicates of an existing spot a few metres away.
      duplicateRadiusM: env.SPOT_DUPLICATE_RADIUS_M,
      walkMetersPerMinute: env.WALK_METERS_PER_MINUTE,
      maxWalkMeters: env.MAX_WALK_METERS,
    })
    if ('duplicate' in result) {
      const { id, name } = result.duplicate
      throw new AppError('SPOT_DUPLICATE', 409, `A spot already exists here: ${name}`, [{ id }])
    }
    return this.byId(result.id, body.lang)
  },
}
