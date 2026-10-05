import { Router } from 'express'
import { IdQuery, InRegionQuery, NearbyQuery, WithinBody } from './poi.schemas.js'
import { poiService } from './poi.service.js'

export const poiRouter = Router()

poiRouter.get('/nearby', async (req, res) => {
  res.json(await poiService.nearby(NearbyQuery.parse(req.query)))
})

poiRouter.post('/within', async (req, res) => {
  res.json(await poiService.within(WithinBody.parse(req.body)))
})

poiRouter.get('/in-region', async (req, res) => {
  res.json(await poiService.inRegion(InRegionQuery.parse(req.query)))
})

poiRouter.get('/item', async (req, res) => {
  res.json(await poiService.byId(IdQuery.parse(req.query).id))
})

// TODO(phase-1): POST /, /update, /delete with requireRole('editor') + region-scope check in service.
