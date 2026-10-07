import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import type { AuthUser } from '../auth/auth.service.js'
import { adminRepository } from './admin.repository.js'
import type {
  AdminSuspendBody,
  DeleteUserBody,
  ListUsersBody,
  ModerationLogBody,
  SetRoleBody,
} from './admin.schemas.js'

async function target(userId: string) {
  const user = await adminRepository.user(userId)
  if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  return user
}

// The app must always keep one admin: refuse to demote or delete the last one.
async function assertNotLastAdmin(user: { role: string }) {
  if (user.role === 'admin' && (await adminRepository.adminCount()) <= 1) {
    throw new AppError('LAST_ADMIN', 409, 'The last admin cannot be removed')
  }
}

export const adminService = {
  listUsers: ({ search, role, offset, limit }: ListUsersBody) =>
    adminRepository.listUsers({ search, role, offset, limit }).then((r) => ({ ...r, offset, limit })),

  async setRole(actor: AuthUser, { user_id, role }: SetRoleBody) {
    const user = await target(user_id)
    if (user.role === role) return { role }
    // Staff are trusted with other people's content: an anonymous identity (no accountable person) never is.
    if (role !== 'participant' && user.is_anonymous) {
      throw new AppError('ANONYMOUS_CANNOT_BE_STAFF', 409, 'An anonymous identity cannot become staff')
    }
    if (role !== 'admin') await assertNotLastAdmin(user)
    await adminRepository.setRole(user_id, role, actor.id)
    return { role }
  },

  async suspend(actor: AuthUser, { user_id, until, reason_code }: AdminSuspendBody, now: Date = new Date()) {
    if (user_id === actor.id) throw new AppError('FORBIDDEN', 403, 'You cannot suspend yourself')
    const user = await target(user_id)
    if (user.role === 'admin') throw new AppError('FORBIDDEN', 403, 'Admins cannot be suspended')
    const end = until ? new Date(until) : null
    if (end && end <= now) throw new AppError('VALIDATION_ERROR', 400, 'The end date must be in the future')
    await adminRepository.setSuspension(user_id, end, reason_code ?? null, actor.id)
    return { posting_suspended_until: end?.toISOString() ?? null }
  },

  async deleteUser(actor: AuthUser, { user_id }: DeleteUserBody) {
    if (user_id === actor.id) throw new AppError('FORBIDDEN', 403, 'Delete your own account from your account page')
    const user = await target(user_id)
    await assertNotLastAdmin(user)
    await adminRepository.deleteUser(user_id, actor.id)
    return { deleted: true }
  },

  moderationLog: ({ actor_id, offset, limit }: ModerationLogBody) =>
    adminRepository.moderationLog({ actorId: actor_id, offset, limit }).then((r) => ({ ...r, offset, limit })),

  // Read-only view of the settings that shape moderation (changed through the environment, then a restart).
  config() {
    return {
      terms_version: env.TERMS_VERSION,
      trust_min_approved: env.TRUST_MIN_APPROVED,
      trust_window_days: env.TRUST_WINDOW_DAYS,
      reviewer_suspend_max_days: env.REVIEWER_SUSPEND_MAX_DAYS,
      quota_anon_spots_per_day: env.QUOTA_ANON_SPOTS_PER_DAY,
      quota_anon_photos_per_day: env.QUOTA_ANON_PHOTOS_PER_DAY,
      quota_linked_multiplier: env.QUOTA_LINKED_MULTIPLIER,
      session_expires_days: env.SESSION_EXPIRES_DAYS,
      turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
    }
  },
}
