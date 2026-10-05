import { AppError } from '../../lib/errors.js'
import { photoUrl, removePhoto, savePhoto } from '../../storage/photoStorage.js'
import { spotService } from '../spots/spot.service.js'
import { photoRepository, type PhotoRow } from './photo.repository.js'
import type { ListPhotosBody, UploadPhotoFields } from './photo.schemas.js'

function toResponse(row: PhotoRow) {
  const { file_name, thumb_name, poi_id, ...rest } = row
  return {
    ...rest,
    spot_id: poi_id,
    url: photoUrl(file_name),
    thumb_url: photoUrl(thumb_name),
  }
}

export const photoService = {
  async upload(fields: UploadPhotoFields, file: Buffer | undefined) {
    if (!file) throw new AppError('UPLOAD_MISSING_FILE', 400, 'No image file in the request')
    await spotService.ensureExists(fields.spot_id)

    const stored = await savePhoto(file)
    try {
      const row = await photoRepository.insert({
        poi_id: fields.spot_id,
        file_name: stored.fileName,
        thumb_name: stored.thumbName,
        width: stored.width,
        height: stored.height,
        author_name: fields.author_name ?? null,
        focal: fields.focal ?? null,
        aperture: fields.aperture ?? null,
        shutter: fields.shutter ?? null,
        iso: fields.iso ?? null,
        camera: fields.camera ?? null,
      })
      return toResponse(row)
    } catch (err) {
      // Files were written before the row: don't leave orphans behind when the insert fails.
      await removePhoto(stored)
      throw err
    }
  },

  async list({ spot_id, offset, limit }: ListPhotosBody) {
    await spotService.ensureExists(spot_id)
    const { items, total } = await photoRepository.listBySpot(spot_id, offset, limit)
    return { items: items.map(toResponse), total, offset, limit, has_more: offset + items.length < total }
  },
}
