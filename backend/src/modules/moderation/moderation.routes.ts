import { Router } from 'express'
import { currentUser, requirePermission } from '../auth/session.js'
import {
  DecideBody,
  ModeratorSpotUpdateBody,
  QueueListBody,
  ResolveReportBody,
  SuspendBody,
} from './moderation.schemas.js'
import { moderationService } from './moderation.service.js'

// Reviewers and admins. Never cached: the queue changes with every decision.
export const moderationRouter = Router()
moderationRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

moderationRouter.post('/queue/list', requirePermission('moderate'), async (req, res) => {
  res.json(await moderationService.queue(QueueListBody.parse(req.body)))
})

moderationRouter.post('/decide', requirePermission('moderate'), async (req, res) => {
  res.json(await moderationService.decide(currentUser(req), DecideBody.parse(req.body)))
})

moderationRouter.post('/spot/update', requirePermission('edit_spot'), async (req, res) => {
  res.json(await moderationService.updateSpot(currentUser(req), ModeratorSpotUpdateBody.parse(req.body)))
})

moderationRouter.post('/suspend', requirePermission('suspend_short'), async (req, res) => {
  res.json(await moderationService.suspend(currentUser(req), SuspendBody.parse(req.body)))
})

moderationRouter.post('/report/resolve', requirePermission('moderate'), async (req, res) => {
  res.json(await moderationService.resolveReport(currentUser(req), ResolveReportBody.parse(req.body)))
})
