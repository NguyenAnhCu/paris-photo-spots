import { AppError } from '../../lib/errors.js'
import { isValidTile } from '../../lib/geo.js'
import { tileRepository } from './tile.repository.js'

type TileRequest = { layer: string; z: number; x: number; y: number; filter?: string[] }

export const tileService = {
  // Returns null when there is nothing to draw (below the layer's min zoom, or no features): the route answers 204.
  async getTile({ layer: layerName, z, x, y, filter }: TileRequest): Promise<Buffer | null> {
    const layer = tileRepository.layer(layerName)
    if (!layer) throw new AppError('UNKNOWN_LAYER', 404, `Unknown tile layer ${layerName}`)
    if (!isValidTile(z, x, y)) throw new AppError('INVALID_TILE', 400, 'Invalid tile coordinates')
    if (z < layer.minZoom) return null

    const tile = await tileRepository.tile(layer, z, x, y, filter)
    return tile.length > 0 ? tile : null
  },
}
