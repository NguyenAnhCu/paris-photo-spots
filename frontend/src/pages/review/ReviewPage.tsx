import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  moderationApi,
  type QueueKind,
  type QueuedPhoto,
  type QueuedReport,
  type QueuedSpot,
  type ReasonCode,
} from '@/api/moderation'
import { translateApiError } from '@/i18n/apiError'
import { useMe } from '@/hooks/useMe'
import { useI18n } from '@/i18n/useI18n'
import type { MessageKey } from '@/i18n/messages/vi'
import { PhotoCard, ReportCard, SpotCard, type ReviewActions } from './ReviewCards'
import '@/components/moderation/moderation.css'
import '@/pages/StandalonePage.css'
import './review.css'

const queueKey = (kind: QueueKind) => ['moderation', kind] as const
const TABS: QueueKind[] = ['photo', 'spot', 'report']

// Review queue for reviewers and admins (lazy chunk: participants never download it). The backend enforces the
// permission; this page only hides itself.
export default function ReviewPage() {
  const { t } = useI18n()
  const me = useMe()
  const role = me.data?.user?.role
  const [tab, setTab] = useState<QueueKind>('photo')
  const isStaff = role === 'reviewer' || role === 'admin'
  const queryClient = useQueryClient()
  const queues = {
    photo: useQuery({
      queryKey: queueKey('photo'),
      queryFn: () => moderationApi.queue<QueuedPhoto>('photo'),
      enabled: isStaff,
    }),
    spot: useQuery({
      queryKey: queueKey('spot'),
      queryFn: () => moderationApi.queue<QueuedSpot>('spot'),
      enabled: isStaff,
    }),
    report: useQuery({
      queryKey: queueKey('report'),
      queryFn: () => moderationApi.queue<QueuedReport>('report'),
      enabled: isStaff,
    }),
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['moderation'] })
  const act = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSettled: refresh,
  })

  // A: approve the first item of the open tab (when not typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select')
      if (typing || e.key.toLowerCase() !== 'a' || e.metaKey || e.ctrlKey) return
      document.querySelector<HTMLButtonElement>('.review__list [data-shortcut="approve"]')?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (me.isPending) return <main className="standalone">{t('common.loading')}</main>
  if (!isStaff) {
    return (
      <main className="standalone">
        <h1>{t('review.title')}</h1>
        <p>{t('review.staffOnly')}</p>
        <Link to="/staff/sign-in">{t('staff.title')}</Link>
      </main>
    )
  }

  const actionsFor = (targetType: 'spot' | 'photo', targetId: string, authorId: string | undefined): ReviewActions => ({
    busy: act.isPending,
    approve: () => act.mutate(() => moderationApi.decide({ targetType, targetId, action: 'approve' })),
    reject: (reasonCode: ReasonCode) =>
      act.mutate(() => moderationApi.decide({ targetType, targetId, action: 'reject', reasonCode })),
    suspend: (days, reasonCode) =>
      authorId && act.mutate(() => moderationApi.suspend({ userId: authorId, days, reasonCode })),
  })

  const current = queues[tab]
  return (
    <main className="standalone review">
      <Link to="/">{t('terms.back')}</Link>
      <h1>{t('review.title')}</h1>
      <div className="review__tabs" role="tablist" aria-label={t('review.title')}>
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="review__tab"
            onClick={() => setTab(k)}
          >
            {t(`review.tab.${k}` as MessageKey)} ({queues[k].data?.total ?? '…'})
          </button>
        ))}
      </div>
      {act.isError && (
        <p className="modal__error" role="alert">
          {translateApiError(act.error, t)}
        </p>
      )}
      <section className="review__list" role="tabpanel" aria-label={t(`review.tab.${tab}` as MessageKey)}>
        {current.isPending ? (
          <p>{t('common.loading')}</p>
        ) : (current.data?.items.length ?? 0) === 0 ? (
          <p>{t('review.empty')}</p>
        ) : tab === 'photo' ? (
          (queues.photo.data?.items ?? []).map((item) => (
            <PhotoCard key={item.id} item={item} actions={actionsFor('photo', item.id, item.author?.id)} />
          ))
        ) : tab === 'spot' ? (
          (queues.spot.data?.items ?? []).map((item) => (
            <SpotCard
              key={item.id}
              item={item}
              actions={actionsFor('spot', item.id, item.author?.id)}
              onEdit={(fields) => act.mutate(() => moderationApi.updateSpot({ id: item.id, ...fields }))}
            />
          ))
        ) : (
          (queues.report.data?.items ?? []).map((item) => (
            <ReportCard
              key={item.id}
              item={item}
              busy={act.isPending}
              onHide={() =>
                act.mutate(() =>
                  moderationApi.decide({
                    targetType: item.targetType,
                    targetId: item.targetId,
                    action: 'hide',
                    reasonCode: item.reasonCode ?? 'other',
                  }),
                )
              }
              onDismiss={() => act.mutate(() => moderationApi.resolveReport({ id: item.id, outcome: 'dismissed' }))}
            />
          ))
        )}
      </section>
    </main>
  )
}
