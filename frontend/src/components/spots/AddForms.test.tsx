import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { useMapUi } from '@/pages/mapUi'
import { jpegWithExif, SONY_EXIF } from '@/test/jpegExif'
import { currentLocation, fakeFetch, json, renderWithApp } from '@/test/render'
import { AddSpotForm } from './AddForms'

const t = createTranslator('vi')
const location = () => currentLocation(screen.getByTestId('location'))
const submitButton = () => screen.getByRole('button', { name: t('add.submit') })

const createdSpot = (id: string) => ({
  id,
  name: 'Quai de Bourbon',
  name_original: 'Quai de Bourbon',
  photo_category: 'street',
  lng: 2.355,
  lat: 48.853,
  crowd_level: 2,
  best_time: null,
  tip: null,
  cover: null,
  photo_count: 0,
  user_created: true,
})

// Stands in for a click on the map (desktop) to place the new spot.
function MapClick() {
  const { setPlacement } = useMapUi()
  return (
    <button
      type="button"
      onClick={() => setPlacement((cur) => ({ category: cur?.category ?? null, position: [2.355, 48.853] }))}
    >
      click map
    </button>
  )
}

function renderForm() {
  const user = userEvent.setup()
  renderWithApp(
    <>
      <AddSpotForm layout="panel" />
      <MapClick />
    </>,
    { route: '/add?lang=vi' },
  )
  return user
}

describe('AddSpotForm', () => {
  it('"Đăng mark" stays disabled until there is a location and a name', async () => {
    const user = renderForm()
    expect(submitButton()).toBeDisabled()
    await user.type(screen.getByLabelText(t('add.name')), 'Quai de Bourbon')
    expect(submitButton()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'click map' }))
    expect(submitButton()).toBeEnabled()
    await user.clear(screen.getByLabelText(t('add.name')))
    await user.type(screen.getByLabelText(t('add.name')), '   ')
    expect(submitButton()).toBeDisabled()
  })

  it('posts the spot (trimmed name, chosen category) and opens it', async () => {
    const requests: unknown[] = []
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        'POST /api/v1/spots': (_url, init) => {
          requests.push(JSON.parse(String(init?.body)))
          return json(201, createdSpot('new-1'))
        },
      }),
    )
    const user = renderForm()
    await user.click(screen.getByRole('button', { name: 'click map' }))
    await user.type(screen.getByLabelText(t('add.name')), '  Quai de Bourbon ')
    await user.selectOptions(screen.getByLabelText(t('add.category')), 'street')
    await user.click(submitButton())
    await waitFor(() => expect(location()).toEqual({ path: '/spots/new-1', search: '?lang=vi' }))
    expect(requests).toEqual([
      { name: 'Quai de Bourbon', photo_category: 'street', lng: 2.355, lat: 48.853, lang: 'vi' },
    ])
  })

  it('duplicate → explains it and offers to open the existing spot', async () => {
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        'POST /api/v1/spots': () =>
          json(409, { error: { code: 'SPOT_DUPLICATE', message: 'exists', details: [{ id: 'old-7' }] } }),
      }),
    )
    const user = renderForm()
    await user.click(screen.getByRole('button', { name: 'click map' }))
    await user.type(screen.getByLabelText(t('add.name')), 'Pont Neuf')
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(t('errors.SPOT_DUPLICATE'))
    await user.click(screen.getByRole('button', { name: t('add.duplicateOpen') }))
    expect(location().path).toBe('/spots/old-7')
  })

  it('fills the four EXIF fields from the photo and uploads it with the new spot', async () => {
    const uploads: FormData[] = []
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        'POST /api/v1/spots': () => json(201, createdSpot('new-2')),
        'POST /api/v1/photos': (_url, init) => {
          uploads.push(init?.body as FormData)
          return json(201, { id: 'p1', spot_id: 'new-2' })
        },
      }),
    )
    const user = renderForm()
    const photo = new File([jpegWithExif(SONY_EXIF)], 'IMG_0001.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(t('add.photoStep')), photo)

    expect(await screen.findByText(t('add.exifOk'))).toBeInTheDocument()
    expect(screen.getByLabelText(t('exif.focal'))).toHaveValue('35mm')
    expect(screen.getByLabelText(t('exif.aperture'))).toHaveValue('f/1.8')
    expect(screen.getByLabelText(t('exif.shutter'))).toHaveValue('1/250s')
    expect(screen.getByLabelText(t('exif.iso'))).toHaveValue('100')

    await user.clear(screen.getByLabelText(t('exif.iso')))
    await user.type(screen.getByLabelText(t('exif.iso')), '200') // still editable by hand
    await user.click(screen.getByRole('button', { name: 'click map' }))
    await user.type(screen.getByLabelText(t('add.name')), 'Quai de Bourbon')
    await user.click(submitButton())
    await waitFor(() => expect(location().path).toBe('/spots/new-2'))

    const form = uploads[0]
    expect(form?.get('spot_id')).toBe('new-2')
    expect(form?.get('iso')).toBe('200')
    expect(form?.get('camera')).toBe('Sony ILCE-7M4 · FE 35mm F1.4 GM')
    expect(form?.get('file')).toBeInstanceOf(File)
  })

  it('a photo without EXIF switches the fields to manual entry', async () => {
    const user = renderForm()
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'shot.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(t('add.photoStep')), png)
    expect(await screen.findByText(t('add.exifMissing'))).toBeInTheDocument()
    expect(screen.getByLabelText(t('exif.focal'))).toHaveValue('')
  })
})
