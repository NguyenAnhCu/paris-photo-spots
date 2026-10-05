import { Router } from 'express'
import { env } from '../../config/env.js'
import { TileParams, TileQuery } from './tile.schemas.js'
import { tileService } from './tile.service.js'

export const tileRouter = Router()

tileRouter.get('/:layer/:z/:x/:y.pbf', async (req, res) => {
  const { layer, z, x, y } = TileParams.parse(req.params)
  const { filter } = TileQuery.parse(req.query)

  const tile = await tileService.getTile({ layer, z, x, y, filter })
  // Empty tiles are cached too, so panning over empty areas does not hit the database again.
  res.setHeader('Cache-Control', `public, max-age=${env.TILE_CACHE_SECONDS}`)
  if (!tile) {
    res.status(204).end()
    return
  }
  res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile')
  res.send(tile)
})
