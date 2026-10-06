import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tileRepository } from './tile.repository.js'
import { tileService } from './tile.service.js'

vi.mock('./tile.repository.js', () => ({ tileRepository: { layer: vi.fn(), tile: vi.fn() } }))
const repo = vi.mocked(tileRepository)
const LAYER = { minZoom: 8 } as ReturnType<typeof tileRepository.layer>

beforeEach(() => {
  vi.resetAllMocks()
  repo.layer.mockReturnValue(LAYER)
})

describe('tileService.getTile', () => {
  it('returns the encoded tile', async () => {
    repo.tile.mockResolvedValue(Buffer.from([1, 2, 3]))
    expect(await tileService.getTile({ layer: 'pois', z: 12, x: 2074, y: 1409 })).toEqual(Buffer.from([1, 2, 3]))
  })

  it('returns null (→ 204) for an empty tile or below the layer min zoom, without querying', async () => {
    repo.tile.mockResolvedValue(Buffer.alloc(0))
    expect(await tileService.getTile({ layer: 'pois', z: 12, x: 2074, y: 1409 })).toBeNull()
    repo.tile.mockClear()
    expect(await tileService.getTile({ layer: 'pois', z: 5, x: 16, y: 11 })).toBeNull()
    expect(repo.tile).not.toHaveBeenCalled()
  })

  it('answers 404 for a layer outside the whitelist (never reaches SQL)', async () => {
    repo.layer.mockReturnValue(undefined)
    await expect(tileService.getTile({ layer: 'users', z: 12, x: 0, y: 0 })).rejects.toMatchObject({
      code: 'UNKNOWN_LAYER',
      status: 404,
    })
    expect(repo.tile).not.toHaveBeenCalled()
  })

  it('answers 400 for coordinates outside the zoom grid', async () => {
    await expect(tileService.getTile({ layer: 'pois', z: 2, x: 4, y: 0 })).rejects.toMatchObject({
      code: 'INVALID_TILE',
      status: 400,
    })
  })
})
