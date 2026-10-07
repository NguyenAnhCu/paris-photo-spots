import { z } from 'zod'

export const RecoveryCodeSignInBody = z.object({ code: z.string().trim().min(16).max(40) })
