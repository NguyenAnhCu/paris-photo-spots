import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../lib/errors.js'
import { removePhoto, savePhoto } from '../../storage/photoStorage.js'
import { spotService } from '../spots/spot.service.js'
import { photoRepository, type PhotoRow } from './photo.repository.js'
import { photoService } from './photo.service.js'

vi.mock('./photo.repository.js', () => ({ photoRepository: { insert: vi.fn(), listBySpot: vi.fn() } }))
vi.mock('../spots/spot.service.js', () => ({ spotService: { ensureExists: vi.fn() } }))
vi.mock('../../storage/photoStorage.js', () => ({
  savePhoto: vi.fn(),
  removePhoto: vi.fn(),
  photoUrl: (name: string) => `/media/photos/${name}`,
}))

const SPOT = '2f1c4d6e-8a9b-4c3d-9e1f-0a2b3c4d5e6f'
const stored = { fileName: 'abc.jpg', thumbName: 'abc_thumb.jpg', width: 2048, height: 1365 }
const photoRow: PhotoRow = {
  id: 'p1',
  poi_id: SPOT,
  file_name: 'abc.jpg',
  thumb_name: 'abc_thumb.jpg',
  width: 2048,
  height: 1365,
  author_name: 'Minh',
  focal: '35mm',
  aperture: null,
  shutter: null,
  iso: null,
  camera: null,
  created_at: '2026-10-05T10:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(savePhoto).mockResolvedValue(stored)
})

describe('photoService.upload', () => {
  it('stores the file, saves the row and returns public URLs (never file names or poi_id)', async () => {
    vi.mocked(photoRepository.insert).mockResolvedValue(photoRow)
    const result = await photoService.upload({ spot_id: SPOT, author_name: 'Minh', focal: '35mm' }, Buffer.from('img'))
    expect(photoRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        poi_id: SPOT,
        file_name: 'abc.jpg',
        author_name: 'Minh',
        focal: '35mm',
        aperture: null,
      }),
    )
    expect(result).toMatchObject({
      id: 'p1',
      spot_id: SPOT,
      url: '/media/photos/abc.jpg',
      thumb_url: '/media/photos/abc_thumb.jpg',
    })
    expect(result).not.toHaveProperty('file_name')
    expect(result).not.toHaveProperty('poi_id')
  })

  it('answers 400 UPLOAD_MISSING_FILE when no file was sent', async () => {
    await expect(photoService.upload({ spot_id: SPOT }, undefined)).rejects.toMatchObject({
      code: 'UPLOAD_MISSING_FILE',
      status: 400,
    })
    expect(savePhoto).not.toHaveBeenCalled()
  })

  it('does not write any file for an unknown spot', async () => {
    vi.mocked(spotService.ensureExists).mockRejectedValue(new AppError('SPOT_NOT_FOUND', 404, 'Spot not found'))
    await expect(photoService.upload({ spot_id: SPOT }, Buffer.from('img'))).rejects.toMatchObject({
      code: 'SPOT_NOT_FOUND',
    })
    expect(savePhoto).not.toHaveBeenCalled()
  })

  it('removes the written files when the database insert fails (no orphans)', async () => {
    vi.mocked(photoRepository.insert).mockRejectedValue(new Error('connection lost'))
    await expect(photoService.upload({ spot_id: SPOT }, Buffer.from('img'))).rejects.toThrow('connection lost')
    expect(removePhoto).toHaveBeenCalledWith(stored)
  })
})

describe('photoService.list', () => {
  it('returns a page with has_more computed from the total', async () => {
    vi.mocked(photoRepository.listBySpot).mockResolvedValue({ items: [photoRow], total: 3 })
    expect(await photoService.list({ spot_id: SPOT, offset: 1, limit: 1 })).toMatchObject({
      total: 3,
      offset: 1,
      limit: 1,
      has_more: true,
    })
    vi.mocked(photoRepository.listBySpot).mockResolvedValue({ items: [photoRow], total: 3 })
    expect((await photoService.list({ spot_id: SPOT, offset: 2, limit: 1 })).has_more).toBe(false)
  })

  it('checks that the spot exists first', async () => {
    vi.mocked(spotService.ensureExists).mockRejectedValue(new AppError('SPOT_NOT_FOUND', 404, 'Spot not found'))
    await expect(photoService.list({ spot_id: SPOT, offset: 0, limit: 24 })).rejects.toMatchObject({ status: 404 })
    expect(photoRepository.listBySpot).not.toHaveBeenCalled()
  })
})
