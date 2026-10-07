import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { mediaUrl } from '@/api/client'
import { submissionsApi, type Decision } from '@/api/moderation'
import { reasonKey } from '@/components/moderation/reasons'
import { Photo, PillButton } from '@/components/ui'
import { meKey, useMe } from '@/hooks/useMe'
import { useSubmissions } from '@/hooks/useSpots'
import { useI18n } from '@/i18n/useI18n'
import type { MessageKey } from '@/i18n/messages/vi'
import type { ContentStatus } from '@/types/spot'
import '@/components/moderation/moderation.css'
import './StandalonePage.css'

function Status({ status, decision }: { status: ContentStatus; decision: Decision | null }) {
  const { t } = useI18n()
  return (
    <span className="my-posts__status">
      <span className={`status-chip status-chip--${status}`}>{t(`status.${status}` as MessageKey)}</span>
      {(status === 'rejected' || status === 'hidden') && decision?.reasonCode && (
        <span className="my-posts__reason">{t(reasonKey(decision.reasonCode))}</span>
      )}
    </span>
  )
}

// "My posts": every spot and photo the participant posted, with its review status and, when refused, the reason.
// Opening it marks the decisions as seen (the badge on the account button goes away).
export function MyPostsPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe()
  const mine = useSubmissions()
  const unread = me.data?.user?.unreadDecisions ?? 0

  useEffect(() => {
    if (unread > 0) submissionsApi.markSeen().then(() => queryClient.invalidateQueries({ queryKey: meKey }))
  }, [unread, queryClient])

  const spots = mine.data?.spots ?? []
  const photos = mine.data?.photos ?? []
  return (
    <main className="standalone my-posts">
      <PillButton variant="tonal" icon={ArrowLeft} onClick={() => navigate('/')}>
        {t('terms.back')}
      </PillButton>
      <h1>{t('myPosts.title')}</h1>
      {!me.isPending && !me.data?.user ? (
        <p>{t('myPosts.none')}</p>
      ) : mine.isPending ? (
        <p>{t('common.loading')}</p>
      ) : spots.length === 0 && photos.length === 0 ? (
        <p>{t('myPosts.none')}</p>
      ) : (
        <>
          {spots.length > 0 && (
            <section aria-labelledby="my-spots">
              <h2 id="my-spots">{t('myPosts.spots')}</h2>
              <ul className="my-posts__list">
                {spots.map((s) => (
                  <li key={s.id} className="my-posts__item">
                    {s.status === 'approved' || s.status === 'pending' ? (
                      <Link to={`/spots/${s.id}`}>{s.name}</Link>
                    ) : (
                      <span>{s.name}</span>
                    )}
                    <Status status={s.status} decision={s.decision} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {photos.length > 0 && (
            <section aria-labelledby="my-photos">
              <h2 id="my-photos">{t('myPosts.photos')}</h2>
              <ul className="my-posts__list">
                {photos.map((p) => (
                  <li key={p.id} className="my-posts__item">
                    <Photo src={mediaUrl(p.thumbUrl)} alt="" className="my-posts__thumb" />
                    <Link to={`/spots/${p.spotId}/photos`}>{p.spotName}</Link>
                    <Status status={p.status} decision={p.decision} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
