import { photoSignals } from '../../lib/imageSignals.js'
import { AppError } from '../../lib/errors.js'
import { can } from '../../lib/permissions.js'
import { photoUrl, removePhoto, savePhoto } from '../../storage/photoStorage.js'
import type { AuthUser } from '../auth/auth.service.js'
import { meService } from '../me/me.service.js'
import { spotService } from '../spots/spot.service.js'
import { photoRepository, type PhotoRow, type PhotoViewer } from './photo.repository.js'
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

const viewerOf = (user: AuthUser | undefined): PhotoViewer => ({
  userId: user?.id ?? null,
  seesAll: can(user, 'moderate'),
})

export const photoService = {
  async upload(actor: AuthUser, fields: UploadPhotoFields, file: Buffer | undefined) {
    if (!file) throw new AppError('UPLOAD_MISSING_FILE', 400, 'No image file in the request')
    // Only on a spot the uploader can see (a pending spot: its author, or a reviewer).
    const spot = await spotService.visibleRow(fields.spot_id, actor)
    // Before decoding the image: a refused upload should cost no CPU.
    await meService.assertCanPost(actor, 'photo')

    const stored = await savePhoto(file)
    try {
      const hints = await photoSignals(file, stored.thumb, [spot.lng, spot.lat])
      const row = await photoRepository.insert({
        poi_id: fields.spot_id,
        file_name: stored.fileName,
        thumb_name: stored.thumbName,
        width: stored.width,
        height: stored.height,
        user_id: actor.id,
        focal: fields.focal ?? null,
        aperture: fields.aperture ?? null,
        shutter: fields.shutter ?? null,
        iso: fields.iso ?? null,
        camera: fields.camera ?? null,
        status: await meService.initialStatusFor(actor),
        gps_distance: hints.gps_distance,
        phash: hints.phash,
      })
      return toResponse(row)
    } catch (err) {
      // Files were written before the row: don't leave orphans behind when the insert fails.
      await removePhoto(stored)
      throw err
    }
  },

  async list({ spot_id, offset, limit }: ListPhotosBody, viewer?: AuthUser) {
    await spotService.visibleRow(spot_id, viewer)
    const { items, total } = await photoRepository.listBySpot(spot_id, offset, limit, viewerOf(viewer))
    return { items: items.map(toResponse), total, offset, limit, has_more: offset + items.length < total }
  },
}
