import { z } from 'zod'

export const TileParams = z.object({
  layer: z.string(),
  z: z.coerce.number().int(),
  x: z.coerce.number().int(),
  y: z.coerce.number().int(),
})
export type TileParams = z.infer<typeof TileParams>

export const TileQuery = z.object({
  filter: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()) : undefined)),
})
export type TileQuery = z.infer<typeof TileQuery>
