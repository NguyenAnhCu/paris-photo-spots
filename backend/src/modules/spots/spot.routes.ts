import { Router } from 'express'
import { writeRateLimit } from '../../middleware/rateLimit.js'
import { currentUser, requirePermission } from '../auth/session.js'
import { CreateSpotBody, ListSpotsQuery, SpotItemQuery } from './spot.schemas.js'
import { spotService } from './spot.service.js'

export const spotRouter = Router()

spotRouter.get('/', async (req, res) => {
  const { lang } = ListSpotsQuery.parse(req.query)
  // Revalidate on every request (Express ETag → 304): a max-age cache served lists missing a just-created spot.
  res.setHeader('Cache-Control', 'no-cache')
  res.json(await spotService.list(lang))
})

spotRouter.get('/item', async (req, res) => {
  const { id, lang } = SpotItemQuery.parse(req.query)
  res.json(await spotService.byId(id, lang))
})

spotRouter.post('/', writeRateLimit, requirePermission('post'), async (req, res) => {
  res.status(201).json(await spotService.create(currentUser(req), CreateSpotBody.parse(req.body)))
})
