import { describe, expect, it } from 'vitest'
import { checkStaffPassword, normalizeUsername, STAFF_EMAIL_DOMAIN, staffPlaceholderEmail } from './staffAccount.js'

describe('normalizeUsername', () => {
  it('lower-cases and trims (sign-in is case-insensitive)', () => {
    expect(normalizeUsername('  Admin ')).toEqual({ ok: true, username: 'admin' })
    expect(normalizeUsername('linh.nguyen_2')).toEqual({ ok: true, username: 'linh.nguyen_2' })
  })

  it.each([
    ['too short', 'ab'],
    ['too long', 'x'.repeat(31)],
    ['spaces inside', 'linh nguyen'],
    ['accents', 'nguyễn'],
    ['an email', 'linh@team.example'],
    ['empty', '   '],
  ])('rejects %s', (_label, input) => {
    expect(normalizeUsername(input).ok).toBe(false)
  })
})

describe('checkStaffPassword', () => {
  it('in production: at least the minimum length, and not the username itself', () => {
    expect(checkStaffPassword('short-pass', { username: 'admin', minLength: 12, production: true })).toEqual({
      ok: false,
      reason: 'too_short',
    })
    expect(checkStaffPassword('admin'.repeat(3), { username: 'admin', minLength: 12, production: true })).toEqual({
      ok: true,
      weak: false,
    })
    expect(checkStaffPassword('Admin-Admin-1', { username: 'admin-admin-1', minLength: 12, production: true })).toEqual(
      { ok: false, reason: 'same_as_username' },
    )
  })

  it('outside production a weak password is allowed, but flagged', () => {
    expect(checkStaffPassword('admin', { username: 'admin', minLength: 12, production: false })).toEqual({
      ok: true,
      weak: true,
    })
    expect(checkStaffPassword('a long enough phrase', { username: 'admin', minLength: 12, production: false })).toEqual(
      { ok: true, weak: false },
    )
  })

  it('never empty, never over 128 characters (the sign-in endpoint refuses longer ones)', () => {
    for (const production of [true, false]) {
      expect(checkStaffPassword('', { username: 'a', minLength: 12, production }).ok).toBe(false)
      expect(checkStaffPassword('x'.repeat(129), { username: 'a', minLength: 12, production }).ok).toBe(false)
    }
  })
})

it('staff accounts get a placeholder email that can never receive mail', () => {
  expect(staffPlaceholderEmail('admin')).toBe(`admin@${STAFF_EMAIL_DOMAIN}`)
  expect(STAFF_EMAIL_DOMAIN.endsWith('.invalid')).toBe(true)
})
