import { createHash, randomInt } from 'node:crypto'
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

  async onAnonymousLinked(anonymousUserId: string, accountUserId: string): Promise<void> {
    if (anonymousUserId === accountUserId) return
    await authRepository.transferOwnership(anonymousUserId, accountUserId)
  },
}
