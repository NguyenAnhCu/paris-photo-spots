import { z } from 'zod'

export const REGION_TYPES = ['department', 'arrondissement', 'commune'] as const
export type RegionType = (typeof REGION_TYPES)[number]

export const ListRegionsQuery = z.object({ type: z.enum(REGION_TYPES).optional() })
export type ListRegionsQuery = z.infer<typeof ListRegionsQuery>

export const RegionCodeQuery = z.object({ code: z.string().min(1) })
export type RegionCodeQuery = z.infer<typeof RegionCodeQuery>
