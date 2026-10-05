import { AppError } from '../../lib/errors.js'
import { regionRepository } from './region.repository.js'
import type { RegionType } from './region.schemas.js'

// ~10 m at Paris latitude; enough for display outlines.
const DISPLAY_SIMPLIFY_DEGREES = 0.0001

export const regionService = {
  async list(type?: RegionType) {
    return { items: await regionRepository.list(type) }
  },

  async byCode(code: string) {
    const region = await regionRepository.byCode(code, DISPLAY_SIMPLIFY_DEGREES)
    if (!region) throw new AppError('REGION_NOT_FOUND', 404, 'Region not found')
    return region
  },
}
