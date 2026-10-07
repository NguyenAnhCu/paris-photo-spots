import { useMe, useSignOut } from '@/hooks/useMe'
import { useI18n } from '@/i18n/useI18n'
import { PillButton } from '@/components/ui'
import { Modal } from './Modal'

// An anonymous participant without a recovery code loses their identity for good when signing out: say so.
export function SignOutDialog({ onClose, onSaveCode }: { onClose: () => void; onSaveCode: () => void }) {
  const { t } = useI18n()
  const me = useMe().data?.user
  const signOut = useSignOut()
  const atRisk = Boolean(me?.isAnonymous && !me.hasRecoveryCode)
  return (
    <Modal title={t('signOut.title')} onClose={onClose}>
      <p className={atRisk ? 'modal__warn' : 'modal__text'}>{atRisk ? t('signOut.warnNoCode') : t('signOut.info')}</p>
      <div className="modal__actions">
        {atRisk && (
          <PillButton variant="primary" onClick={onSaveCode}>
            {t('signOut.saveFirst')}
          </PillButton>
        )}
        <PillButton
          variant={atRisk ? 'tonal' : 'primary'}
          disabled={signOut.isPending}
          onClick={() => signOut.mutate(undefined, { onSuccess: onClose })}
        >
          {t('signOut.confirm')}
        </PillButton>
      </div>
    </Modal>
  )
}
