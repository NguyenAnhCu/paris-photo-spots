import { createHash, randomInt } from 'node:crypto'
import { appendFile } from 'node:fs/promises'
import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { isRole, type Role } from '../../lib/permissions.js'
import { anonymousName } from '../../lib/userName.js'
import { authRepository } from './auth.repository.js'

export type AuthUser = { id: string; role: Role; isAnonymous: boolean; name: string }

// Crockford base32 without look-alikes (no I, L, O, U): 16 characters = 80 bits, shown as XXXX-XXXX-XXXX-XXXX.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 16

export function generateRecoveryCode(): string {
  const chars = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)])
  return chars.join('').replace(/(.{4})(?=.)/g, '$1-')
}

// What people type: any case, with or without dashes or spaces; O and I typed for 0 and 1 still match.
export function canonicalRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}

// Only the hash is stored: a database leak does not hand out identities.
export const hashRecoveryCode = (code: string) => createHash('sha256').update(canonicalRecoveryCode(code)).digest('hex')

export const authService = {
  anonymousName,

  toAuthUser(user: { id: string; name: string; role?: unknown; isAnonymous?: boolean | null }): AuthUser {
    return {
      id: user.id,
      name: user.name,
      // An unknown role in the database must never widen rights.
      role: isRole(user.role) ? user.role : 'participant',
      isAnonymous: Boolean(user.isAnonymous),
    }
  },

  // A new code replaces the old one (the old one stops working).
  async createRecoveryCode(userId: string): Promise<string> {
    const code = generateRecoveryCode()
    await authRepository.setRecoveryCodeHash(userId, hashRecoveryCode(code))
    return code
  },

  async userIdForRecoveryCode(code: string): Promise<string | null> {
    if (canonicalRecoveryCode(code).length !== CODE_LENGTH) return null
    return authRepository.userIdByRecoveryCodeHash(hashRecoveryCode(code))
  },

  // Sign-in links for staff. There is no email service yet (it comes with sign-in for participants): dev and E2E
  // write each link to AUTH_MAGIC_LINK_LOG; production refuses rather than pretending a mail was sent.
  async deliverMagicLink(email: string, url: string): Promise<void> {
    // Accounts are looked up case-insensitively; send to (and log) the same normalised address.
    email = email.trim().toLowerCase()
    if (env.AUTH_MAGIC_LINK_LOG) {
      await appendFile(env.AUTH_MAGIC_LINK_LOG, `${JSON.stringify({ email, url, at: new Date().toISOString() })}\n`)
      return
    }
    if (env.NODE_ENV === 'production') {
      throw new AppError('EMAIL_NOT_CONFIGURED', 503, 'Sign-in links cannot be sent yet')
    }
    logger.info({ email, url }, 'Magic link (dev: no email service)')
  },

  async onAnonymousLinked(anonymousUserId: string, accountUserId: string): Promise<void> {
    if (anonymousUserId === accountUserId) return
    await authRepository.transferOwnership(anonymousUserId, accountUserId)
  },
}
