import { useId, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { REASON_CODES, reportsApi, type ReasonCode } from '@/api/moderation'
import { Modal } from '@/components/account/Modal'
import { PillButton } from '@/components/ui'
import { useEnsureIdentity } from '@/hooks/useMe'
import { translateApiError } from '@/i18n/apiError'
import { useI18n } from '@/i18n/useI18n'
import { reasonKey } from './reasons'

// Flag a public spot or photo for the reviewers. Visitors without an identity get an anonymous one (no terms needed).
export function ReportDialog({
  target,
  onClose,
}: {
  target: { type: 'spot' | 'photo'; id: string }
  onClose: () => void
}) {
  const { t } = useI18n()
  const ensureIdentity = useEnsureIdentity()
  const reasonId = useId()
  const messageId = useId()
  const [reason, setReason] = useState<ReasonCode>('inappropriate')
  const [message, setMessage] = useState('')
  const send = useMutation({
    mutationFn: async () => {
      await ensureIdentity()
      return reportsApi.create({
        targetType: target.type,
        targetId: target.id,
        reasonCode: reason,
        message: message.trim() || undefined,
      })
    },
  })
  return (
    <Modal title={t('report.title')} onClose={onClose}>
      {send.isSuccess ? (
        <>
          <p className="modal__text" role="status">
            {t('report.thanks')}
          </p>
          <div className="modal__actions">
            <PillButton variant="primary" onClick={onClose}>
              {t('common.close')}
            </PillButton>
          </div>
        </>
      ) : (
        <form
          className="modal__form"
          onSubmit={(e) => {
            e.preventDefault()
            send.mutate()
          }}
        >
          <label className="field" htmlFor={reasonId}>
            <span className="field__label">{t('report.reason')}</span>
            <select
              id={reasonId}
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value as ReasonCode)}
            >
              {REASON_CODES.map((r) => (
                <option key={r} value={r}>
                  {t(reasonKey(r))}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor={messageId}>
            <span className="field__label">{t('report.message')}</span>
            <textarea
              id={messageId}
              className="input"
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {send.isError && (
            <p className="modal__error" role="alert">
              {translateApiError(send.error, t)}
            </p>
          )}
          <div className="modal__actions">
            <PillButton variant="primary" type="submit" disabled={send.isPending}>
              {t('report.send')}
            </PillButton>
          </div>
        </form>
      )}
    </Modal>
  )
}
