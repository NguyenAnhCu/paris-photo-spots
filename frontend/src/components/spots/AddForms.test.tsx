import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { useMapUi } from '@/pages/mapUi'
import { jpegWithExif, SONY_EXIF } from '@/test/jpegExif'
import { currentLocation, fakeFetch, identityServer, json, renderWithApp } from '@/test/render'
import { AddPhotoForm, AddSpotForm } from './AddForms'

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

type Routes = Parameters<typeof fakeFetch>[0]
const PARTICIPANT = { name: 'Lữ khách 4821', termsAccepted: true, hasRecoveryCode: true }

// Every render answers the identity calls; tests add their own routes. Default: a participant who already posted
// (terms accepted, recovery code saved), so tests not about identity see the plain form.
function renderForm(routes: Routes = {}, identity = identityServer(PARTICIPANT)) {
  vi.stubGlobal('fetch', fakeFetch({ ...identity.routes, ...routes }))
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
    const user = renderForm({
      'POST /api/v1/spots': (_url, init) => {
        requests.push(JSON.parse(String(init?.body)))
        return json(201, createdSpot('new-1'))
      },
    })
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
    const user = renderForm({
      'POST /api/v1/spots': () =>
        json(409, { error: { code: 'SPOT_DUPLICATE', message: 'exists', details: [{ id: 'old-7' }] } }),
    })
    await user.click(screen.getByRole('button', { name: 'click map' }))
    await user.type(screen.getByLabelText(t('add.name')), 'Pont Neuf')
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(t('errors.SPOT_DUPLICATE'))
    await user.click(screen.getByRole('button', { name: t('add.duplicateOpen') }))
    expect(location().path).toBe('/spots/old-7')
  })

  it('fills the four EXIF fields from the photo and uploads it with the new spot', async () => {
    const uploads: FormData[] = []
    const user = renderForm({
      'POST /api/v1/spots': () => json(201, createdSpot('new-2')),
      'POST /api/v1/photos': (_url, init) => {
        uploads.push(init?.body as FormData)
        return json(201, { id: 'p1', spot_id: 'new-2' })
      },
    })
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

describe('AddPhotoForm (photo for an existing spot)', () => {
  const SPOT = 'existing-1'
  const photoSubmit = () => screen.getByRole('button', { name: t('add.submitPhoto') })

  function renderPhotoForm(
    upload: (init: RequestInit | undefined) => Response,
    identity = identityServer(PARTICIPANT),
  ) {
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        ...identity.routes,
        'GET /api/v1/spots/item': () => json(200, { ...createdSpot(SPOT), name: 'Pont Neuf', user_created: false }),
        'POST /api/v1/photos': (_url, init) => upload(init),
      }),
    )
    const user = userEvent.setup()
    renderWithApp(<AddPhotoForm spotId={SPOT} layout="panel" />, { route: `/spots/${SPOT}/add-photo` })
    return user
  }

  it('needs a photo; uploads it with its EXIF for this spot (no typed author name), then shows the spot photos', async () => {
    const uploads: FormData[] = []
    const user = renderPhotoForm((init) => {
      uploads.push(init?.body as FormData)
      return json(201, { id: 'p9', spot_id: SPOT })
    })
    expect(await screen.findByRole('button', { name: 'Pont Neuf' })).toBeInTheDocument()
    expect(photoSubmit()).toBeDisabled()

    await user.upload(
      screen.getByLabelText(t('add.photoStep')),
      new File([jpegWithExif(SONY_EXIF)], 'IMG_0002.jpg', { type: 'image/jpeg' }),
    )
    expect(await screen.findByText(t('add.exifOk'))).toBeInTheDocument()
    expect(screen.queryByLabelText(/tên của bạn/i)).toBeNull()
    await user.click(photoSubmit())

    await waitFor(() => expect(location().path).toBe(`/spots/${SPOT}/photos`))
    const form = uploads[0]
    expect(form?.get('spot_id')).toBe(SPOT)
    expect(form?.has('author_name')).toBe(false)
    expect(form?.get('focal')).toBe('35mm')
    expect(form?.get('file')).toBeInstanceOf(File)
  })

  it('a refused upload shows the reason and stays on the form', async () => {
    const user = renderPhotoForm(() =>
      json(400, { error: { code: 'IMAGE_TOO_LARGE', message: 'Image dimensions are too large', status: 400 } }),
    )
    await user.upload(
      screen.getByLabelText(t('add.photoStep')),
      new File([jpegWithExif(SONY_EXIF)], 'huge.jpg', { type: 'image/jpeg' }),
    )
    await user.click(photoSubmit())

    expect(await screen.findByRole('alert')).toHaveTextContent(t('errors.IMAGE_TOO_LARGE'))
    expect(location().path).toBe(`/spots/${SPOT}/add-photo`)
    expect(photoSubmit()).toBeEnabled()
  })

  it.each([['Pont Neuf'], [t('common.cancel')]])('"%s" goes back to the spot without uploading', async (button) => {
    const upload = vi.fn(() => json(201, {}))
    const user = renderPhotoForm(upload)
    await screen.findByRole('button', { name: 'Pont Neuf' })
    await user.click(screen.getByRole('button', { name: button }))
    expect(location().path).toBe(`/spots/${SPOT}`)
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('posting identity (anonymous participants)', () => {
  const termsBox = () => screen.getByRole('checkbox', { name: /Điều khoản sử dụng/ })

  it('a first-time visitor sees they will post anonymously and must accept the terms first', async () => {
    const user = renderForm({}, identityServer(null))
    expect(await screen.findByText(t('identity.newAnonymous'), { exact: false })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'click map' }))
    await user.type(screen.getByLabelText(t('add.name')), 'Quai de Bourbon')
    expect(submitButton()).toBeDisabled()
    await user.click(termsBox())
    expect(submitButton()).toBeEnabled()
    expect(screen.getByRole('link', { name: t('identity.termsLink') })).toHaveAttribute('href', '/terms')
  })

  it('first post: creates the identity (in the UI language), records the terms, posts, then offers a recovery code', async () => {
    const identity = identityServer(null)
    const posted: string[] = []
    const user = renderForm(
      {
        'POST /api/v1/spots': () => {
          posted.push(identity.calls.join(' | '))
          return json(201, createdSpot('new-9'))
        },
      },
      identity,
    )
    await user.click(screen.getByRole('button', { name: 'click map' }))
    await user.type(screen.getByLabelText(t('add.name')), 'Quai de Bourbon')
    await user.click(await screen.findByRole('checkbox'))
    await user.click(submitButton())

    await waitFor(() => expect(location().path).toBe('/spots/new-9'))
    // Identity and terms were in place before the spot was posted.
    expect(posted).toEqual(['sign-in/anonymous lang=vi | terms draft-1'])
    const dialog = await screen.findByRole('dialog', { name: t('recovery.title') })
    expect(dialog).toHaveTextContent('AB12-CD34-EF56-GH78')
    expect(identity.calls).toContain('recovery-code/create')
  })

  it('a participant who already posted is not asked again (no checkbox, no new identity, no code prompt)', async () => {
    const identity = identityServer(PARTICIPANT)
    const user = renderForm({ 'POST /api/v1/spots': () => json(201, createdSpot('new-3')) }, identity)
    expect(await screen.findByText('Lữ khách 4821')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'click map' }))
    await user.type(screen.getByLabelText(t('add.name')), 'Quai de Bourbon')
    await user.click(submitButton())
    await waitFor(() => expect(location().path).toBe('/spots/new-3'))
    expect(identity.calls).toEqual([])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the photo form follows the same rule: terms before the first upload', async () => {
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        ...identityServer(null).routes,
        'GET /api/v1/spots/item': () => json(200, { ...createdSpot('s1'), name: 'Pont Neuf' }),
      }),
    )
    const user = userEvent.setup()
    renderWithApp(<AddPhotoForm spotId="s1" layout="panel" />, { route: '/spots/s1/add-photo' })
    await user.upload(
      screen.getByLabelText(t('add.photoStep')),
      new File([jpegWithExif(SONY_EXIF)], 'IMG.jpg', { type: 'image/jpeg' }),
    )
    const submit = screen.getByRole('button', { name: t('add.submitPhoto') })
    expect(submit).toBeDisabled()
    await user.click(await screen.findByRole('checkbox'))
    expect(submit).toBeEnabled()
  })
})
