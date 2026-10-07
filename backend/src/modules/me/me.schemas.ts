import { z } from 'zod'

export const AcceptTermsBody = z.object({ version: z.string().min(1).max(40) })
export const UpdateMeBody = z.object({ name: z.string().max(200) })
export type PostKind = 'spot' | 'photo'
