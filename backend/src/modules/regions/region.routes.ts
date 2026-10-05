import { Router } from 'express'
import { ListRegionsQuery, RegionCodeQuery } from './region.schemas.js'
import { regionService } from './region.service.js'

export const regionRouter = Router()

regionRouter.get('/', async (req, res) => {
  res.json(await regionService.list(ListRegionsQuery.parse(req.query).type))
})

regionRouter.get('/item', async (req, res) => {
  res.json(await regionService.byCode(RegionCodeQuery.parse(req.query).code))
})
