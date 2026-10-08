import { z } from 'zod'
import { MODERATION_ACTIONS, REASON_CODES } from '../../lib/moderation.js'
import { PHOTO_CATEGORIES } from '../spots/spot.schemas.js'

const page = { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(20) }
const note = z.string().trim().max(500).optional()

export const QueueListBody = z.object({ kind: z.enum(['photo', 'spot', 'report']), ...page })
export type QueueListBody = z.infer<typeof QueueListBody>

export const DecideBody = z.object({
  target_type: z.enum(['spot', 'photo']),
  target_id: z.string().uuid(),
  action: z.enum(MODERATION_ACTIONS),
  reason_code: z.enum(REASON_CODES).optional(),
  note,
})
export type DecideBody = z.infer<typeof DecideBody>

export const ModeratorSpotUpdateBody = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(3).max(120).optional(),
    photo_category: z.enum(PHOTO_CATEGORIES).optional(),
    tip: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((b) => b.name !== undefined || b.photo_category !== undefined || b.tip !== undefined, 'Nothing to change')
export type ModeratorSpotUpdateBody = z.infer<typeof ModeratorSpotUpdateBody>

export const SuspendBody = z.object({
  user_id: z.string().uuid(),
  days: z.number().int().min(1),
  reason_code: z.enum(REASON_CODES),
  note,
})
export type SuspendBody = z.infer<typeof SuspendBody>

export const ResolveReportBody = z.object({ id: z.string().uuid(), outcome: z.enum(['dismissed', 'actioned']), note })
export type ResolveReportBody = z.infer<typeof ResolveReportBody>
