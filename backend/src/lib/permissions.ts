// Three levels (decision 2026-10-07): participants post, reviewers look after the content, admins run the system.
// Permissions rather than a ladder: a reviewer is not a smaller admin (no access to users or system settings).
export const ROLES = ['participant', 'reviewer', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'post', // add spots and photos
  'report', // flag content
  'manage_own', // edit / delete own content, rename, recovery code, delete own account
  'moderate', // review queue: approve, reject, hide, restore; handle reports
  'edit_spot', // fix any spot's name, category, tip
  'suspend_short', // stop a participant from posting for up to a week
  'manage_users', // roles, long suspensions, deleting accounts
  'system', // settings, imports, logs
] as const
export type Permission = (typeof PERMISSIONS)[number]

const PARTICIPANT: Permission[] = ['post', 'report', 'manage_own']
const REVIEWER: Permission[] = [...PARTICIPANT, 'moderate', 'edit_spot', 'suspend_short']
const ADMIN: Permission[] = [...REVIEWER, 'manage_users', 'system']

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  participant: new Set(PARTICIPANT),
  reviewer: new Set(REVIEWER),
  admin: new Set(ADMIN),
}

export const isRole = (value: unknown): value is Role => ROLES.includes(value as Role)

export function can(user: { role: Role } | undefined, permission: Permission): boolean {
  return user ? ROLE_PERMISSIONS[user.role].has(permission) : false
}

type QuotaEnv = { QUOTA_ANON_PHOTOS_PER_DAY: number; QUOTA_ANON_SPOTS_PER_DAY: number; QUOTA_LINKED_MULTIPLIER: number }

// Posts allowed per rolling 24 h; null = unlimited (staff).
export function dailyQuota(
  user: { role: Role; isAnonymous: boolean },
  env: QuotaEnv,
): { photos: number; spots: number } | null {
  if (user.role !== 'participant') return null
  const factor = user.isAnonymous ? 1 : env.QUOTA_LINKED_MULTIPLIER
  return { photos: env.QUOTA_ANON_PHOTOS_PER_DAY * factor, spots: env.QUOTA_ANON_SPOTS_PER_DAY * factor }
}
