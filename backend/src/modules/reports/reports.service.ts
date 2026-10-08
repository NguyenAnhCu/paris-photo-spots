import { AppError } from '../../lib/errors.js'
import type { AuthUser } from '../auth/auth.service.js'
import { reportsRepository } from './reports.repository.js'
import type { CreateReportBody } from './reports.schemas.js'

export const reportsService = {
  async create(actor: AuthUser, body: CreateReportBody) {
    const target = await reportsRepository.publicTarget(body.target_type, body.target_id)
    if (!target) throw new AppError('NOT_FOUND', 404, `${body.target_type} not found`)
    await reportsRepository.createOnce({
      reporterId: actor.id,
      targetType: body.target_type,
      targetId: body.target_id,
      poiId: target.poi_id,
      reasonCode: body.reason_code,
      message: body.message ?? '',
    })
    return { received: true }
  },
}
