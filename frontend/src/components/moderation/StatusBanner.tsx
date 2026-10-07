import { useSubmissions } from '@/hooks/useSpots'
import { useI18n } from '@/i18n/useI18n'
import type { MessageKey } from '@/i18n/messages/vi'
import type { ContentStatus } from '@/types/spot'
import { reasonKey } from './reasons'
import './moderation.css'

// Shown on a spot that is not public: only its author and reviewers can open it, and the author learns why.
export function StatusBanner({ spotId, status }: { spotId: string; status: ContentStatus }) {
  const { t } = useI18n()
  const decision = useSubmissions().data?.spots.find((s) => s.id === spotId)?.decision
  if (status === 'approved') return null
  const reason = decision?.reasonCode ? t(reasonKey(decision.reasonCode)) : null
  return (
    <p className={`status-banner status-banner--${status}`} role="status">
      <b>{t(`status.${status}` as MessageKey)}</b>
      <span>{status === 'pending' ? t('status.pendingInfo') : reason}</span>
    </p>
  )
}
