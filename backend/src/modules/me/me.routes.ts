import { Router } from 'express'
import { currentUser, loadUser, requireUser } from '../auth/session.js'
import { AcceptTermsBody, UpdateMeBody } from './me.schemas.js'
import { meService } from './me.service.js'

export const meRouter = Router()

meRouter.get('/', loadUser, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(await meService.profile(req.user))
})

meRouter.post('/terms', requireUser, async (req, res) => {
  res.json(await meService.acceptTerms(currentUser(req), AcceptTermsBody.parse(req.body).version))
})

meRouter.post('/update', requireUser, async (req, res) => {
  res.json(await meService.rename(currentUser(req), UpdateMeBody.parse(req.body).name))
})
