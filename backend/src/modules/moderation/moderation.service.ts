import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import { needsReason, nextStatus } from '../../lib/moderation.js'
import { photoUrl } from '../../storage/photoStorage.js'
import type { AuthUser } from '../auth/auth.service.js'
import { moderationRepository } from './moderation.repository.js'
import type {
  DecideBody,
  ModeratorSpotUpdateBody,
  QueueListBody,
  ResolveReportBody,
  SuspendBody,
} from './moderation.schemas.js'

const DAY_MS = 24 * 60 * 60 * 1000

export const moderationService = {
  async queue({ kind, offset, limit }: QueueListBody) {
    if (kind === 'photo') {
      const { items, total } = await moderationRepository.queuePhotos(offset, limit)
      return {
        items: items.map(({ file_name, thumb_name, ...rest }) => ({
          ...rest,
          url: photoUrl(file_name),
          thumb_url: photoUrl(thumb_name),
        })),
        total,
        offset,
        limit,
      }
    }
    if (kind === 'spot') return { ...(await moderationRepository.queueSpots(offset, limit)), offset, limit }
    const { items, total } = await moderationRepository.queueReports(offset, limit)
    return {
      items: items.map(({ thumb_name, ...rest }) => ({ ...rest, thumb_url: thumb_name ? photoUrl(thumb_name) : null })),
      total,
      offset,
      limit,
    }
  },

  async decide(actor: AuthUser, body: DecideBody) {
    // The author is told why: rejecting or hiding without a reason is refused.
    if (needsReason(body.action) && !body.reason_code) {
      throw new AppError('REASON_REQUIRED', 400, `A reason is required to ${body.action}`)
    }
    const result = await moderationRepository.decide({
      targetType: body.target_type,
      targetId: body.target_id,
      action: body.action,
      next: (current) => nextStatus(current, body.action),
      reasonCode: body.reason_code ?? null,
      note: body.note ?? null,
      actorId: actor.id,
    })
    if (!result.found) throw new AppError('NOT_FOUND', 404, `${body.target_type} not found`)
    // Already decided (another reviewer was faster) or a move the workflow does not allow.
    if (!result.to) {
      throw new AppError('INVALID_TRANSITION', 409, `Cannot ${body.action} a ${result.from} ${body.target_type}`, [
        { status: result.from },
      ])
    }
    return { status: result.to }
  },

  async updateSpot(actor: AuthUser, { id, ...fields }: ModeratorSpotUpdateBody) {
    if (!(await moderationRepository.updateSpot(id, fields, actor.id)))
      throw new AppError('SPOT_NOT_FOUND', 404, 'Spot not found')
    return { ok: true }
  },

  // Short suspensions only (env cap): longer ones and account removal belong to admins.
  async suspend(actor: AuthUser, body: SuspendBody, now: Date = new Date()) {
    if (body.days > env.REVIEWER_SUSPEND_MAX_DAYS) {
      throw new AppError('SUSPENSION_TOO_LONG', 400, `At most ${env.REVIEWER_SUSPEND_MAX_DAYS} days`, [
        { max: env.REVIEWER_SUSPEND_MAX_DAYS },
      ])
    }
    const role = await moderationRepository.userRole(body.user_id)
    if (!role) throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    if (role !== 'participant' || body.user_id === actor.id) {
      throw new AppError('FORBIDDEN', 403, 'Only participants can be suspended')
    }
    const until = new Date(now.getTime() + body.days * DAY_MS)
    await moderationRepository.suspend({
      userId: body.user_id,
      until,
      reasonCode: body.reason_code,
      note: body.note,
      actorId: actor.id,
    })
    return { posting_suspended_until: until.toISOString() }
  },

  async resolveReport(actor: AuthUser, { id, outcome, note }: ResolveReportBody) {
    if (!(await moderationRepository.resolveReport(id, outcome, actor.id, note))) {
      throw new AppError('REPORT_NOT_FOUND', 404, 'No open report with this id')
    }
    return { ok: true }
  },
}
