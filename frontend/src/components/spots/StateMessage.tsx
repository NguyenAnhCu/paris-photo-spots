import type { ReactNode } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { PillButton } from '@/components/ui'

// Loading / empty / error states (design.md "Trạng thái phải có"): never a blank panel.
export function StateMessage({ children, onRetry, action }: { children: ReactNode; onRetry?: () => void; action?: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="state-message" role="status">
      <p>{children}</p>
      {onRetry && (
        <PillButton variant="tonal" onClick={onRetry}>
          {t('common.retry')}
        </PillButton>
      )}
      {action}
    </div>
  )
}

export function CardSkeletons({ count, variant }: { count: number; variant: 'overlay' | 'stacked' }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skeleton skeleton--${variant}`} aria-hidden="true" />
      ))}
    </>
  )
}
