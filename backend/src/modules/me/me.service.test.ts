import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../config/env.js'
import type { AuthUser } from '../auth/auth.service.js'
import { meRepository, type MeRow } from './me.repository.js'
import { meService } from './me.service.js'

const NOW = new Date('2026-10-07T12:00:00Z')
const anon: AuthUser = { id: 'u1', role: 'participant', isAnonymous: true, name: 'Lữ khách 1234' }
const linked: AuthUser = { ...anon, isAnonymous: false }
const reviewer: AuthUser = { ...anon, role: 'reviewer', isAnonymous: false }

function row(overrides: Partial<MeRow> = {}): MeRow {
  return {
    id: 'u1',
    display_name: 'Lữ khách 1234',
    is_anonymous: true,
    role: 'participant',
    has_recovery_code: false,
    unread_decisions: 0,
    terms_version: env.TERMS_VERSION,
    posting_suspended_until: null,
    ...overrides,
  }
}

function given(me: MeRow | null, used = { spots: 0, photos: 0 }) {
  vi.spyOn(meRepository, 'byId').mockResolvedValue(me)
  return vi.spyOn(meRepository, 'postsSince').mockResolvedValue(used)
}

afterEach(() => vi.restoreAllMocks())

describe('assertCanPost', () => {
  it('passes with accepted terms, no suspension and quota left', async () => {
    given(row())
    await expect(meService.assertCanPost(anon, 'photo', NOW)).resolves.toBeUndefined()
  })

  it('403 TERMS_REQUIRED when the current terms were not accepted (never, or an older version)', async () => {
    for (const terms_version of [null, 'draft-0']) {
      given(row({ terms_version }))
      await expect(meService.assertCanPost(anon, 'spot', NOW)).rejects.toMatchObject({
        code: 'TERMS_REQUIRED',
        status: 403,
      })
    }
  })

  it('403 POSTING_SUSPENDED until the suspension ends, then allowed again', async () => {
    given(row({ posting_suspended_until: new Date('2026-10-08T00:00:00Z') }))
    await expect(meService.assertCanPost(anon, 'photo', NOW)).rejects.toMatchObject({ code: 'POSTING_SUSPENDED' })
    given(row({ posting_suspended_until: new Date('2026-10-07T11:59:00Z') }))
    await expect(meService.assertCanPost(anon, 'photo', NOW)).resolves.toBeUndefined()
  })

  it('429 QUOTA_EXCEEDED at the anonymous daily limit, counted over the last 24 h', async () => {
    const posts = given(row(), { spots: env.QUOTA_ANON_SPOTS_PER_DAY, photos: env.QUOTA_ANON_PHOTOS_PER_DAY - 1 })
    await expect(meService.assertCanPost(anon, 'spot', NOW)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      status: 429,
    })
    await expect(meService.assertCanPost(anon, 'photo', NOW)).resolves.toBeUndefined()
    expect(posts).toHaveBeenCalledWith('u1', new Date('2026-10-06T12:00:00Z'))
  })

  it('linked accounts get a higher limit', async () => {
    given(row({ is_anonymous: false }), { spots: env.QUOTA_ANON_SPOTS_PER_DAY, photos: env.QUOTA_ANON_PHOTOS_PER_DAY })
    await expect(meService.assertCanPost(linked, 'spot', NOW)).resolves.toBeUndefined()
  })

  it('staff have no quota (posts are not even counted)', async () => {
    const posts = given(row({ role: 'reviewer' }), { spots: 999, photos: 999 })
    await expect(meService.assertCanPost(reviewer, 'photo', NOW)).resolves.toBeUndefined()
    expect(posts).not.toHaveBeenCalled()
  })

  it('401 when the session outlived its user', async () => {
    given(null)
    await expect(meService.assertCanPost(anon, 'photo', NOW)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('profile / acceptTerms / rename', () => {
  it('a visitor without a session gets user: null (not an error)', async () => {
    expect(await meService.profile(undefined)).toEqual({ user: null, terms_version: env.TERMS_VERSION })
  })

  it('reports whether the current terms are accepted', async () => {
    given(row({ terms_version: 'draft-0', has_recovery_code: true }))
    expect((await meService.profile(anon)).user).toMatchObject({ terms_accepted: false, has_recovery_code: true })
  })

  it('accepting an outdated version is refused (409) and not saved', async () => {
    const save = vi.spyOn(meRepository, 'acceptTerms').mockResolvedValue()
    await expect(meService.acceptTerms(anon, 'draft-0')).rejects.toMatchObject({ code: 'TERMS_OUTDATED', status: 409 })
    expect(save).not.toHaveBeenCalled()
  })

  it('rename saves the cleaned name; a reserved one is refused', async () => {
    given(row())
    const save = vi.spyOn(meRepository, 'rename').mockResolvedValue()
    await meService.rename(anon, '  Linh   N. ')
    expect(save).toHaveBeenCalledWith('u1', 'Linh N.')
    await expect(meService.rename(anon, 'Admin')).rejects.toMatchObject({ code: 'INVALID_NAME', status: 400 })
  })
})
