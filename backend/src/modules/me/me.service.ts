import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import { initialStatus, type ContentStatus } from '../../lib/moderation.js'
import { dailyQuota } from '../../lib/permissions.js'
import { normalizeUserName } from '../../lib/userName.js'
import { photoUrl } from '../../storage/photoStorage.js'
import type { AuthUser } from '../auth/auth.service.js'
import { meRepository, type MeRow } from './me.repository.js'
import type { PostKind } from './me.schemas.js'

const DAY_MS = 24 * 60 * 60 * 1000

function toProfile(row: MeRow) {
  return {
    id: row.id,
    name: row.display_name,
    is_anonymous: row.is_anonymous,
    role: row.role,
    has_recovery_code: row.has_recovery_code,
    terms_accepted: row.terms_version === env.TERMS_VERSION,
    posting_suspended_until: row.posting_suspended_until,
    unread_decisions: row.unread_decisions,
  }
}

async function load(user: AuthUser): Promise<MeRow> {
  const row = await meRepository.byId(user.id)
  // The session outlived its user (deleted account): treat as signed out.
  if (!row) throw new AppError('UNAUTHENTICATED', 401, 'Sign in required')
  return row
}

export const meService = {
  // No session is a normal state (visitor), not an error: the web app asks on every page load.
  async profile(user: AuthUser | undefined) {
    if (!user) return { user: null, terms_version: env.TERMS_VERSION }
    const row = await meRepository.byId(user.id)
    return { user: row ? toProfile(row) : null, terms_version: env.TERMS_VERSION }
  },

  async acceptTerms(user: AuthUser, version: string) {
    // Accepting an old version (a tab left open across a terms change) must not count as accepting the new one.
    if (version !== env.TERMS_VERSION) throw new AppError('TERMS_OUTDATED', 409, 'The terms have changed')
    await meRepository.acceptTerms(user.id, version)
    return this.profile(user)
  },

  async rename(user: AuthUser, rawName: string) {
    const result = normalizeUserName(rawName)
    if (!result.ok) throw new AppError('INVALID_NAME', 400, 'This name cannot be used')
    await meRepository.rename(user.id, result.name)
    return this.profile(user)
  },

  async submissions(user: AuthUser) {
    const { spots, photos } = await meRepository.submissions(user.id)
    return {
      spots,
      photos: photos.map(({ thumb_name, ...rest }) => ({ ...rest, thumb_url: photoUrl(String(thumb_name)) })),
    }
  },

  async markNotificationsSeen(user: AuthUser) {
    await meRepository.markNotificationsSeen(user.id)
    return this.profile(user)
  },

  // Status for a new post by this author: public at once for staff and trusted participants, otherwise pending.
  async initialStatusFor(user: AuthUser, now: Date = new Date()): Promise<ContentStatus> {
    if (user.role !== 'participant' || user.isAnonymous)
      return initialStatus(user, { approved: 0, rejectedRecently: 0 }, env)
    const since = new Date(now.getTime() - env.TRUST_WINDOW_DAYS * DAY_MS)
    return initialStatus(user, await meRepository.history(user.id, since), env)
  },

  // Called by the spot and photo services before writing anything.
  async assertCanPost(user: AuthUser, kind: PostKind, now: Date = new Date()): Promise<void> {
    const row = await load(user)
    if (row.terms_version !== env.TERMS_VERSION) {
      throw new AppError('TERMS_REQUIRED', 403, 'Accept the terms before posting')
    }
    if (row.posting_suspended_until && row.posting_suspended_until > now) {
      throw new AppError('POSTING_SUSPENDED', 403, 'Posting is suspended for this account', [
        { until: row.posting_suspended_until.toISOString() },
      ])
    }
    const quota = dailyQuota(user, env)
    if (!quota) return
    const used = await meRepository.postsSince(user.id, new Date(now.getTime() - DAY_MS))
    const limit = kind === 'spot' ? quota.spots : quota.photos
    if ((kind === 'spot' ? used.spots : used.photos) >= limit) {
      throw new AppError('QUOTA_EXCEEDED', 429, `Daily limit of ${limit} reached`, [{ limit }])
    }
  },
}
