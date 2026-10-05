import { ArrowLeft, MapPin } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '@/api/client'
import { useCreateSpot, useSpot, useUploadPhoto } from '@/hooks/useSpots'
import { useI18n } from '@/i18n/useI18n'
import { translateApiError } from '@/i18n/apiError'
import { categoryLabelKey } from '@/i18n/keys'
import type { MessageKey } from '@/i18n/messages/vi'
import { parseExif } from '@/lib/exif'
import { formatCoords } from '@/lib/geo'
import { useMapUi, useSpotNav } from '@/pages/mapUi'
import { SPOT_CATEGORIES, type ExifSummary, type SpotCategory } from '@/types/spot'
import { PillButton } from '@/components/ui'
import './AddForms.css'

const ACCEPT = 'image/jpeg,image/png,image/webp'
type ExifState = 'idle' | 'ok' | 'missing'
const EXIF_FIELDS: { key: keyof Omit<ExifSummary, 'camera'>; label: MessageKey; placeholder: string }[] = [
  { key: 'focal', label: 'exif.focal', placeholder: '35mm' },
  { key: 'aperture', label: 'exif.aperture', placeholder: 'f/1.8' },
  { key: 'shutter', label: 'exif.shutter', placeholder: '1/250s' },
  { key: 'iso', label: 'exif.iso', placeholder: '100' },
]

// Photo + EXIF draft shared by "Thêm mark" and "Thêm ảnh". EXIF is read in the browser (the server strips metadata).
function usePhotoDraft() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [exif, setExif] = useState<ExifSummary>({})
  const [exifState, setExifState] = useState<ExifState>('idle')

  // Object URLs hold the whole image in memory until revoked.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const pick = async (next: File | undefined) => {
    if (!next) return
    setFile(next)
    setPreview(URL.createObjectURL(next))
    const result = parseExif(await next.arrayBuffer())
    if (result.kind === 'ok') {
      setExif(result.exif)
      setExifState('ok')
    } else {
      if (result.kind === 'error') console.warn('EXIF could not be read, manual entry', result.error)
      setExif({})
      setExifState('missing')
    }
  }
  const setField = (key: keyof ExifSummary, value: string) => setExif((e) => ({ ...e, [key]: value || undefined }))
  return { file, preview, exif, exifState, pick, setField }
}

function PhotoStep({ draft }: { draft: ReturnType<typeof usePhotoDraft> }) {
  const { t } = useI18n()
  return (
    <label className="add__photo">
      {draft.preview ? (
        <img src={draft.preview} alt="" />
      ) : (
        <>
          <b>{t('add.photoStep')}</b>
          <span className="mono">{t('add.photoHint')}</span>
        </>
      )}
      <input type="file" accept={ACCEPT} onChange={(e) => draft.pick(e.target.files?.[0])} aria-label={t('add.photoStep')} />
    </label>
  )
}

function ExifStep({ draft }: { draft: ReturnType<typeof usePhotoDraft> }) {
  const { t } = useI18n()
  const status = draft.exifState === 'ok' ? t('add.exifOk') : draft.exifState === 'missing' ? t('add.exifMissing') : t('add.exifAuto')
  return (
    <fieldset className="add__box add__exif">
      <legend className="visually-hidden">{t('add.exifStep')}</legend>
      <div className="add__exif-head">
        <b aria-hidden="true">{t('add.exifStep')}</b>
        <span>{status}</span>
      </div>
      {draft.exif.camera && <span className="mono add__camera">{draft.exif.camera}</span>}
      <div className="add__exif-grid">
        {EXIF_FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span className="field__label">{t(f.label)}</span>
            <input
              className="input"
              value={draft.exif[f.key] ?? ''}
              placeholder={f.placeholder}
              onChange={(e) => draft.setField(f.key, e.target.value)}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function AuthorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  return (
    <label className="field">
      <span className="field__label">{t('add.author')}</span>
      <input className="input" value={value} maxLength={60} onChange={(e) => onChange(e.target.value)} autoComplete="nickname" />
    </label>
  )
}

function FormShell({ layout, title, onCancel, children }: { layout: 'panel' | 'page'; title: string; onCancel: () => void; children: ReactNode }) {
  const { t } = useI18n()
  const titleId = useId()
  const head = (
    <div className="add__head">
      <h1 id={titleId}>{title}</h1>
      <PillButton variant="tonal" onClick={onCancel}>
        {t('common.cancel')}
      </PillButton>
    </div>
  )
  return layout === 'panel' ? (
    <section className="panel panel--solid add" aria-labelledby={titleId}>
      <div className="panel__scroll add__body">
        {head}
        {children}
      </div>
    </section>
  ) : (
    <div className="column">
      <section className="column__inner add" aria-labelledby={titleId}>
        {head}
        {children}
      </section>
    </div>
  )
}

const exifPayload = (e: ExifSummary): ExifSummary | undefined =>
  Object.values(e).some(Boolean) ? e : undefined

// The submit button sits at the bottom of a long form: bring a new error into view or nobody sees it.
function FormError({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [children])
  return (
    <div ref={ref} className="add__error" role="alert">
      {children}
    </div>
  )
}

export function AddSpotForm({ layout }: { layout: 'panel' | 'page' }) {
  const { t } = useI18n()
  const nav = useSpotNav()
  const { placement, setPlacement, setPickingOnMap } = useMapUi()
  const draft = usePhotoDraft()
  const createSpot = useCreateSpot()
  const upload = useUploadPhoto()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<SpotCategory>('landmark')
  const [tip, setTip] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState<{ text: string; existingId?: string } | null>(null)
  const nameId = useId()

  // The map shows the draft pin while this form is open; leaving the form clears it.
  useEffect(() => {
    setPlacement({ position: null, category: null })
    return () => setPlacement(null)
  }, [setPlacement])
  useEffect(() => {
    setPlacement((cur) => (cur ? { ...cur, category } : cur))
  }, [category, setPlacement])

  const position = placement?.position ?? null
  const canSubmit = Boolean(position && name.trim()) && !createSpot.isPending && !upload.isPending
  const locationText = position
    ? formatCoords(position[1], position[0]) + (layout === 'panel' ? ` · ${t('add.locationChangeHint')}` : '')
    : layout === 'panel'
      ? t('add.locationDesktopHint')
      : t('add.locationNone')

  const submit = async () => {
    if (!position) return
    setError(null)
    try {
      const spot = await createSpot.mutateAsync({ name: name.trim(), photoCategory: category, lng: position[0], lat: position[1], tip: tip.trim() || undefined })
      if (draft.file) {
        try {
          await upload.mutateAsync({ spotId: spot.id, file: draft.file, authorName: author.trim() || undefined, exif: exifPayload(draft.exif) })
        } catch (uploadErr) {
          // The spot exists already: say the photo did not make it and offer to open the spot (retry from there).
          setError({ text: `${t('add.uploadFailed')} ${translateApiError(uploadErr, t)}`, existingId: spot.id })
          return
        }
      }
      nav.toSpot(spot.id, { replace: true }) // design: after posting, open the new spot
    } catch (err) {
      const existingId =
        err instanceof ApiError && err.code === 'SPOT_DUPLICATE' ? (err.details[0] as { id?: string } | undefined)?.id : undefined
      setError({ text: translateApiError(err, t), existingId })
    }
  }

  return (
    <FormShell layout={layout} title={t('add.title')} onCancel={nav.toList}>
      <div className="add__box add__box--dashed add__location">
        <MapPin size={28} strokeWidth={2} aria-hidden="true" className={position ? 'add__pin add__pin--set' : 'add__pin'} />
        <div className="add__location-text" aria-live="polite">
          <b>{t('add.locationStep')}</b>
          <span>{locationText}</span>
        </div>
        {layout === 'page' && (
          <PillButton variant="tonal" onClick={() => setPickingOnMap(true)}>
            {t('add.locationPick')}
          </PillButton>
        )}
      </div>
      <PhotoStep draft={draft} />
      <ExifStep draft={draft} />
      <label className="field" htmlFor={nameId}>
        <span className="field__label">{t('add.name')}</span>
        <input id={nameId} className="input" value={name} maxLength={120} placeholder={t('add.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('add.category')}</span>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as SpotCategory)}>
          {SPOT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(categoryLabelKey(c))}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">{t('add.tip')}</span>
        <textarea className="input" value={tip} maxLength={1000} placeholder={t('add.tipPlaceholder')} onChange={(e) => setTip(e.target.value)} />
      </label>
      {draft.file && <AuthorField value={author} onChange={setAuthor} />}
      {error && (
        <FormError>
          <span>{error.text}</span>
          {error.existingId && (
            <PillButton variant="tonal" onClick={() => error.existingId && nav.toSpot(error.existingId)}>
              {t('add.duplicateOpen')}
            </PillButton>
          )}
        </FormError>
      )}
      <PillButton variant="primary" size="lg" block disabled={!canSubmit} onClick={submit}>
        {createSpot.isPending || upload.isPending ? t('add.submitting') : t('add.submit')}
      </PillButton>
    </FormShell>
  )
}

export function AddPhotoForm({ spotId, layout }: { spotId: string; layout: 'panel' | 'page' }) {
  const { t } = useI18n()
  const nav = useSpotNav()
  const { data: spot } = useSpot(spotId)
  const draft = usePhotoDraft()
  const upload = useUploadPhoto()
  const [author, setAuthor] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!draft.file) return
    setError(null)
    try {
      await upload.mutateAsync({ spotId, file: draft.file, authorName: author.trim() || undefined, exif: exifPayload(draft.exif) })
      nav.toPhotos(spotId)
    } catch (err) {
      setError(translateApiError(err, t))
    }
  }

  return (
    <FormShell layout={layout} title={t('add.photoTitle')} onCancel={() => nav.toSpot(spotId)}>
      {spot && (
        <PillButton variant="tonal" icon={ArrowLeft} onClick={() => nav.toSpot(spotId)} className="add__back">
          {spot.name}
        </PillButton>
      )}
      <PhotoStep draft={draft} />
      <ExifStep draft={draft} />
      <AuthorField value={author} onChange={setAuthor} />
      {error && <FormError>{error}</FormError>}
      <PillButton variant="clay" size="lg" block disabled={!draft.file || upload.isPending} onClick={submit}>
        {upload.isPending ? t('add.submitting') : t('add.submitPhoto')}
      </PillButton>
    </FormShell>
  )
}
