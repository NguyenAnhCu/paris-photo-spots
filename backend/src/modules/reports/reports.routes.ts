import { Router } from 'express'
import { writeRateLimit } from '../../middleware/rateLimit.js'
import { currentUser, requirePermission } from '../auth/session.js'
import { CreateReportBody } from './reports.schemas.js'
import { reportsService } from './reports.service.js'

export const reportsRouter = Router()

reportsRouter.post('/', writeRateLimit, requirePermission('report'), async (req, res) => {
  res.status(201).json(await reportsService.create(currentUser(req), CreateReportBody.parse(req.body)))
})
