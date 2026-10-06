import { describe, expect, it } from 'vitest'
import { ListPhotosBody, UploadPhotoFields } from './photo.schemas.js'

const SPOT = '2f1c4d6e-8a9b-4c3d-9e1f-0a2b3c4d5e6f'

describe('UploadPhotoFields', () => {
  it('accepts the EXIF summary produced by the browser reader', () => {
    const parsed = UploadPhotoFields.parse({
      spot_id: SPOT,
      author_name: 'Minh',
      focal: '35mm',
      aperture: 'f/1.8',
      shutter: '1/250s',
      iso: '100',
      camera: 'Sony · ILCE-7M4',
    })
    expect(parsed).toMatchObject({ focal: '35mm', aperture: 'f/1.8', shutter: '1/250s', iso: '100' })
  })

  it('accepts long exposures written in seconds', () => {
    expect(UploadPhotoFields.safeParse({ spot_id: SPOT, shutter: '2.5s' }).success).toBe(true)
  })

  // Regression: '' used to pass for author_name/camera (their pattern matches the empty string) and was stored as ''.
  it('treats empty and whitespace-only form fields as missing', () => {
    const parsed = UploadPhotoFields.parse({ spot_id: SPOT, focal: '', author_name: '', camera: '   ' })
    expect(parsed.focal).toBeUndefined()
    expect(parsed.author_name).toBeUndefined()
    expect(parsed.camera).toBeUndefined()
  })

  it('trims surrounding spaces', () => {
    expect(UploadPhotoFields.parse({ spot_id: SPOT, author_name: '  Minh ' }).author_name).toBe('Minh')
  })

  it.each([
    ['focal', '35'],
    ['aperture', '1.8'],
    ['shutter', '1/250'],
    ['iso', 'ISO 100'],
  ])('rejects a malformed %s (%s)', (field, value) => {
    expect(UploadPhotoFields.safeParse({ spot_id: SPOT, [field]: value }).success).toBe(false)
  })

  it('rejects markup in free-text fields', () => {
    expect(UploadPhotoFields.safeParse({ spot_id: SPOT, author_name: '<script>x</script>' }).success).toBe(false)
    expect(UploadPhotoFields.safeParse({ spot_id: SPOT, camera: '<img src=x>' }).success).toBe(false)
  })

  it('requires a valid spot id', () => {
    expect(UploadPhotoFields.safeParse({}).success).toBe(false)
    expect(UploadPhotoFields.safeParse({ spot_id: 'abc' }).success).toBe(false)
  })
})

describe('ListPhotosBody', () => {
  it('defaults to the first page of 24', () => {
    expect(ListPhotosBody.parse({ spot_id: SPOT })).toEqual({ spot_id: SPOT, offset: 0, limit: 24 })
  })

  it('caps the page size at 60 and rejects negative offsets', () => {
    expect(ListPhotosBody.safeParse({ spot_id: SPOT, limit: 61 }).success).toBe(false)
    expect(ListPhotosBody.safeParse({ spot_id: SPOT, offset: -1 }).success).toBe(false)
  })
})
