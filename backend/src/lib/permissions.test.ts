import { describe, expect, it } from 'vitest'
import { can, dailyQuota, PERMISSIONS, ROLES, type Permission, type Role } from './permissions.js'

// The matrix agreed for the three levels (2026-10-07): written out in full here so a
// change to ROLE_PERMISSIONS has to change this table too.
const MATRIX: Record<Permission, Record<Role, boolean>> = {
  post: { participant: true, reviewer: true, admin: true },
  report: { participant: true, reviewer: true, admin: true },
  manage_own: { participant: true, reviewer: true, admin: true },
  moderate: { participant: false, reviewer: true, admin: true },
  edit_spot: { participant: false, reviewer: true, admin: true },
  suspend_short: { participant: false, reviewer: true, admin: true },
  manage_users: { participant: false, reviewer: false, admin: true },
  system: { participant: false, reviewer: false, admin: true },
}

describe('can', () => {
  it.each(PERMISSIONS.flatMap((p) => ROLES.map((r) => [r, p, MATRIX[p][r]] as const)))(
    '%s → %s: %s',
    (role, permission, allowed) => {
      expect(can({ role }, permission)).toBe(allowed)
    },
  )

  it('a visitor without an identity can do none of them', () => {
    for (const p of PERMISSIONS) expect(can(undefined, p)).toBe(false)
  })

  it('reviewers never get system or user management (no access to the system)', () => {
    expect(can({ role: 'reviewer' }, 'system')).toBe(false)
    expect(can({ role: 'reviewer' }, 'manage_users')).toBe(false)
  })
})

describe('dailyQuota', () => {
  const env = { QUOTA_ANON_PHOTOS_PER_DAY: 10, QUOTA_ANON_SPOTS_PER_DAY: 3, QUOTA_LINKED_MULTIPLIER: 3 }

  it('anonymous participants get the base quota', () => {
    expect(dailyQuota({ role: 'participant', isAnonymous: true }, env)).toEqual({ photos: 10, spots: 3 })
  })

  it('linked participants get the multiplier', () => {
    expect(dailyQuota({ role: 'participant', isAnonymous: false }, env)).toEqual({ photos: 30, spots: 9 })
  })

  it('staff have no quota', () => {
    expect(dailyQuota({ role: 'reviewer', isAnonymous: false }, env)).toBeNull()
    expect(dailyQuota({ role: 'admin', isAnonymous: false }, env)).toBeNull()
  })
})
