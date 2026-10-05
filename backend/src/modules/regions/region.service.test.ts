import { beforeEach, describe, expect, it, vi } from 'vitest'
import { regionRepository } from './region.repository.js'
import { regionService } from './region.service.js'

vi.mock('./region.repository.js', () => ({ regionRepository: { list: vi.fn(), byCode: vi.fn() } }))
const repo = vi.mocked(regionRepository)

beforeEach(() => vi.resetAllMocks())

describe('regionService', () => {
  it('lists regions as { items }', async () => {
    repo.list.mockResolvedValue([])
    expect(await regionService.list('arrondissement')).toEqual({ items: [] })
    expect(repo.list).toHaveBeenCalledWith('arrondissement')
  })

  it('simplifies outlines for display (~10 m) and answers 404 for an unknown code', async () => {
    repo.byCode.mockResolvedValue(null)
    await expect(regionService.byCode('99')).rejects.toMatchObject({ code: 'REGION_NOT_FOUND', status: 404 })
    expect(repo.byCode).toHaveBeenCalledWith('99', 0.0001)
  })
})
