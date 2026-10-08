import { z } from 'zod'
import { REASON_CODES } from '../../lib/moderation.js'
import { ROLES } from '../../lib/permissions.js'

const page = { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(50) }

export const ListUsersBody = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  ...page,
})
export type ListUsersBody = z.infer<typeof ListUsersBody>

export const SetRoleBody = z.object({ user_id: z.string().uuid(), role: z.enum(ROLES) })
export type SetRoleBody = z.infer<typeof SetRoleBody>

// until: null lifts the suspension.
export const AdminSuspendBody = z.object({
  user_id: z.string().uuid(),
  until: z.string().datetime().nullable(),
  reason_code: z.enum(REASON_CODES).optional(),
})
export type AdminSuspendBody = z.infer<typeof AdminSuspendBody>

export const DeleteUserBody = z.object({ user_id: z.string().uuid() })
export type DeleteUserBody = z.infer<typeof DeleteUserBody>

export const ModerationLogBody = z.object({ actor_id: z.string().uuid().optional(), ...page })
export type ModerationLogBody = z.infer<typeof ModerationLogBody>
