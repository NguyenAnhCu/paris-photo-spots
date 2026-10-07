import { z } from 'zod'
import { REASON_CODES } from '../../lib/moderation.js'

export const CreateReportBody = z.object({
  target_type: z.enum(['spot', 'photo']),
  target_id: z.string().uuid(),
  reason_code: z.enum(REASON_CODES),
  message: z.string().trim().max(1000).optional(),
})
export type CreateReportBody = z.infer<typeof CreateReportBody>
