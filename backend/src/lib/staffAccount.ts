// Staff (reviewers, admins) sign in with a username and a password; accounts are made from the command line only.

export const USERNAME_MIN = 3
export const USERNAME_MAX = 30
// Better Auth's sign-in refuses longer passwords.
export const PASSWORD_MAX = 128
// Staff accounts need an email column value; a reserved .invalid domain can never receive mail.
export const STAFF_EMAIL_DOMAIN = 'staff.placeholder.invalid'

export const staffPlaceholderEmail = (username: string) => `${username}@${STAFF_EMAIL_DOMAIN}`

// Same rules as Better Auth's username plugin (letters, digits, _ and .), lower-cased like its sign-in.
export function normalizeUsername(input: string): { ok: true; username: string } | { ok: false } {
  const username = input.trim().toLowerCase()
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return { ok: false }
  if (!/^[a-z0-9_.]+$/.test(username)) return { ok: false }
  return { ok: true, username }
}

// Production refuses weak passwords; elsewhere (local dev, tests) they are allowed but flagged.
export function checkStaffPassword(
  password: string,
  opts: { username: string; minLength: number; production: boolean },
): { ok: true; weak: boolean } | { ok: false; reason: 'empty' | 'too_long' | 'too_short' | 'same_as_username' } {
  if (!password) return { ok: false, reason: 'empty' }
  if (password.length > PASSWORD_MAX) return { ok: false, reason: 'too_long' }
  const tooShort = password.length < opts.minLength
  const sameAsUsername = password.trim().toLowerCase() === opts.username.toLowerCase()
  if (opts.production && tooShort) return { ok: false, reason: 'too_short' }
  if (opts.production && sameAsUsername) return { ok: false, reason: 'same_as_username' }
  return { ok: true, weak: tooShort || sameAsUsername }
}
