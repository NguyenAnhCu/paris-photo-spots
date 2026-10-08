import { describe, expect, it, vi } from 'vitest'
import { authRepository } from './auth.repository.js'
import { authService, canonicalRecoveryCode, generateRecoveryCode, hashRecoveryCode } from './auth.service.js'

describe('recovery codes', () => {
  it('look like XXXX-XXXX-XXXX-XXXX without look-alike letters', () => {
    for (let i = 0; i < 50; i++)
      expect(generateRecoveryCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/)
  })

  it('are random', () => {
    expect(new Set(Array.from({ length: 200 }, generateRecoveryCode)).size).toBe(200)
  })

  it('match however they are typed (case, dashes, spaces, O for 0, I/L for 1)', () => {
    const hash = hashRecoveryCode('AB01-CD23-EF45-GH67')
    for (const typed of ['ab01cd23ef45gh67', 'AB01 CD23 EF45 GH67', 'abo1-cd23-ef45-gh67', 'ABOI-CD23-EF45-GH67']) {
      expect(hashRecoveryCode(typed), typed).toBe(hash)
    }
    expect(canonicalRecoveryCode(' ab-cd ')).toBe('ABCD')
  })

  it('only the hash is stored, never the code', async () => {
    const save = vi.spyOn(authRepository, 'setRecoveryCodeHash').mockResolvedValue()
    const code = await authService.createRecoveryCode('u1')
    expect(save).toHaveBeenCalledWith('u1', hashRecoveryCode(code))
    expect(save.mock.calls[0]?.[1]).not.toContain(code.replace(/-/g, ''))
  })

  it('a code of the wrong length is refused without a database lookup', async () => {
    const lookup = vi.spyOn(authRepository, 'userIdByRecoveryCodeHash')
    expect(await authService.userIdForRecoveryCode('ABCD-1234')).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('toAuthUser', () => {
  it('maps the session user', () => {
    expect(authService.toAuthUser({ id: 'u1', name: 'Lữ khách 1234', role: 'reviewer', isAnonymous: false })).toEqual({
      id: 'u1',
      name: 'Lữ khách 1234',
      role: 'reviewer',
      isAnonymous: false,
    })
  })

  it('an unknown or missing role never widens rights', () => {
    expect(authService.toAuthUser({ id: 'u1', name: 'x', role: 'superuser' }).role).toBe('participant')
    expect(authService.toAuthUser({ id: 'u1', name: 'x' }).role).toBe('participant')
  })
})

describe('onAnonymousLinked', () => {
  it('moves the anonymous identity content to the account', async () => {
    const transfer = vi.spyOn(authRepository, 'transferOwnership').mockResolvedValue()
    await authService.onAnonymousLinked('anon', 'account')
    expect(transfer).toHaveBeenCalledWith('anon', 'account')
  })

  it('does nothing when both are the same user', async () => {
    const transfer = vi.spyOn(authRepository, 'transferOwnership').mockResolvedValue()
    await authService.onAnonymousLinked('same', 'same')
    expect(transfer).not.toHaveBeenCalled()
  })
})
