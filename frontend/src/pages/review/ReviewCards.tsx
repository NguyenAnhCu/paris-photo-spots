import { useId, useState } from 'react'
import { mediaUrl } from '@/api/client'
import {
  REASON_CODES,
  type QueueAuthor,
  type QueuedPhoto,
  type QueuedReport,
  type QueuedSpot,
  type ReasonCode,
} from '@/api/moderation'
import { reasonKey } from '@/components/moderation/reasons'
import { Photo, PillButton } from '@/components/ui'
import { useI18n } from '@/i18n/useI18n'
import { categoryLabelKey } from '@/i18n/keys'
import type { MessageKey } from '@/i18n/messages/vi'
import { formatCoords } from '@/lib/geo'
import { SPOT_CATEGORIES, type SpotCategory } from '@/types/spot'

export type ReviewActions = {
  approve: () => void
  reject: (reason: ReasonCode) => void
  suspend: (days: number, reason: ReasonCode) => void
  busy: boolean
}

function Author({ author }: { author: QueueAuthor | null }) {
  const { t } = useI18n()
  if (!author) return <span className="review__author">{t('photos.anonymous')}</span>
  return (
    <span className="review__author">
      <b>{author.name}</b>
      {author.isAnonymous && <span className="status-chip">{t('account.anonymous')}</span>}
      <span>{t('review.history', { approved: author.approved, rejected: author.rejected })}</span>
    </span>
  )
}

function ReasonSelect({
  value,
  onChange,
  label,
}: {
  value: ReasonCode
  onChange: (r: ReasonCode) => void
  label: string
}) {
  const { t } = useI18n()
  const id = useId()
  return (
    <label className="review__select" htmlFor={id}>
      <span className="visually-hidden">{label}</span>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as ReasonCode)}>
        {REASON_CODES.map((r) => (
          <option key={r} value={r}>
            {t(reasonKey(r))}
          </option>
        ))}
      </select>
    </label>
  )
}

// Approve / reject (with a reason) / suspend the author: the same bar under every pending spot and photo.
function DecisionBar({ actions, hasAuthor }: { actions: ReviewActions; hasAuthor: boolean }) {
  const { t } = useI18n()
  const [reason, setReason] = useState<ReasonCode>('not_photo_spot')
  const [days, setDays] = useState(1)
  return (
    <div className="review__actions">
      <PillButton variant="primary" disabled={actions.busy} onClick={actions.approve} data-shortcut="approve">
        {t('review.approve')}
      </PillButton>
      <ReasonSelect value={reason} onChange={setReason} label={t('review.reason')} />
      <PillButton variant="clay" disabled={actions.busy} onClick={() => actions.reject(reason)}>
        {t('review.reject')}
      </PillButton>
      {hasAuthor && (
        <span className="review__suspend">
          <label>
            <span className="visually-hidden">{t('review.suspendDays')}</span>
            <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 3, 7].map((d) => (
                <option key={d} value={d}>
                  {t('review.days', { count: d })}
                </option>
              ))}
            </select>
          </label>
          <PillButton variant="tonal" disabled={actions.busy} onClick={() => actions.suspend(days, reason)}>
            {t('review.suspend')}
          </PillButton>
        </span>
      )}
    </div>
  )
}

const GPS_KEY: Record<string, MessageKey> = {
  lt200m: 'review.gps.lt200m',
  lt1km: 'review.gps.lt1km',
  far: 'review.gps.far',
  none: 'review.gps.none',
}

export function PhotoCard({ item, actions }: { item: QueuedPhoto; actions: ReviewActions }) {
  const { t } = useI18n()
  const exif = [item.focal, item.aperture, item.shutter, item.iso && `ISO ${item.iso}`, item.camera].filter(Boolean)
  return (
    <article className="review__card" aria-label={item.spotName}>
      <Photo
        src={mediaUrl(item.url)}
        alt={t('photos.alt', { name: item.spotName, author: item.author?.name ?? '' })}
        className="review__photo"
      />
      <div className="review__info">
        <h3>{item.spotName}</h3>
        <Author author={item.author} />
        <div className="review__signals">
          {item.gpsDistance && (
            <span className={`status-chip ${item.gpsDistance === 'far' ? 'status-chip--rejected' : ''}`}>
              {t(GPS_KEY[item.gpsDistance] ?? 'review.gps.none')}
            </span>
          )}
          {item.duplicateOf && <span className="status-chip status-chip--rejected">{t('review.duplicatePhoto')}</span>}
        </div>
        {exif.length > 0 && <p className="mono review__exif">{exif.join(' · ')}</p>}
        <DecisionBar actions={actions} hasAuthor={Boolean(item.author)} />
      </div>
    </article>
  )
}

export function SpotCard({
  item,
  actions,
  onEdit,
}: {
  item: QueuedSpot
  actions: ReviewActions
  onEdit: (fields: { name: string; photoCategory: SpotCategory; tip: string | null }) => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState<SpotCategory>(item.photoCategory)
  const [tip, setTip] = useState(item.tip ?? '')
  const nameId = useId()
  const catId = useId()
  const tipId = useId()
  return (
    <article className="review__card review__card--spot" aria-label={item.name}>
      <div className="review__info">
        <h3>{item.name}</h3>
        <p>
          {t(categoryLabelKey(item.photoCategory))} · <span className="mono">{formatCoords(item.lat, item.lng)}</span>
        </p>
        {item.tip && <p className="review__tip">{item.tip}</p>}
        <Author author={item.author} />
        {item.nearName && (
          <div className="review__signals">
            <span className="status-chip status-chip--rejected">
              {t('review.nearSpot', { name: item.nearName, m: item.nearM ?? 0 })}
            </span>
          </div>
        )}
        {editing ? (
          <form
            className="review__edit"
            onSubmit={(e) => {
              e.preventDefault()
              onEdit({ name: name.trim(), photoCategory: category, tip: tip.trim() || null })
              setEditing(false)
            }}
          >
            <label className="field" htmlFor={nameId}>
              <span className="field__label">{t('add.name')}</span>
              <input
                id={nameId}
                className="input"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field" htmlFor={catId}>
              <span className="field__label">{t('add.category')}</span>
              <select
                id={catId}
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value as SpotCategory)}
              >
                {SPOT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(categoryLabelKey(c))}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor={tipId}>
              <span className="field__label">{t('add.tip')}</span>
              <textarea
                id={tipId}
                className="input"
                value={tip}
                maxLength={1000}
                onChange={(e) => setTip(e.target.value)}
              />
            </label>
            <PillButton variant="primary" type="submit" disabled={name.trim().length < 3}>
              {t('rename.save')}
            </PillButton>
          </form>
        ) : (
          <PillButton variant="tonal" onClick={() => setEditing(true)}>
            {t('review.edit')}
          </PillButton>
        )}
        <DecisionBar actions={actions} hasAuthor={Boolean(item.author)} />
      </div>
    </article>
  )
}

export function ReportCard({
  item,
  onHide,
  onDismiss,
  busy,
}: {
  item: QueuedReport
  onHide: () => void
  onDismiss: () => void
  busy: boolean
}) {
  const { t } = useI18n()
  return (
    <article className="review__card" aria-label={item.targetName ?? ''}>
      {item.thumbUrl && <Photo src={mediaUrl(item.thumbUrl)} alt="" className="review__photo review__photo--small" />}
      <div className="review__info">
        <h3>{item.targetName}</h3>
        <p>
          <b>{item.reasonCode ? t(reasonKey(item.reasonCode)) : ''}</b>
          {item.message && <> — {item.message}</>}
        </p>
        <p className="review__meta">{t('review.reportedBy', { name: item.reporterName ?? t('photos.anonymous') })}</p>
        <div className="review__actions">
          {item.targetStatus === 'approved' && (
            <PillButton variant="clay" disabled={busy} onClick={onHide}>
              {t('review.hide')}
            </PillButton>
          )}
          <PillButton variant="tonal" disabled={busy} onClick={onDismiss}>
            {t('review.dismiss')}
          </PillButton>
        </div>
      </div>
    </article>
  )
}
