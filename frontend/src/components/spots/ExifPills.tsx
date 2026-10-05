import type { CommunityPhoto } from '@/types/spot'
import { Tag } from '@/components/ui'

type ExifSource = Pick<CommunityPhoto, 'focal' | 'aperture' | 'shutter' | 'iso' | 'camera'>

// Dark mono pills (design "Thông số ảnh"), shown only when at least one value exists.
export function ExifPills({ photo }: { photo: ExifSource }) {
  const values = [photo.focal, photo.aperture, photo.shutter, photo.iso ? `ISO ${photo.iso}` : null].filter(Boolean)
  if (values.length === 0) return null
  return (
    <div className="exif-pills">
      {values.map((v) => (
        <Tag key={v} tone="mono">
          {v}
        </Tag>
      ))}
      {photo.camera && <span className="exif-pills__camera">{photo.camera}</span>}
    </div>
  )
}
