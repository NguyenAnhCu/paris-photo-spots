import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { meKey, useMe, useRecoverySignIn } from '@/hooks/useMe'
import { translateApiError } from '@/i18n/apiError'
import { useI18n } from '@/i18n/useI18n'
import { PillButton } from '@/components/ui'
import { Modal } from './Modal'

// Shows a recovery code. A fresh code is created when there is none; replacing an existing one needs a click
// (the old one stops working).
export function RecoveryCodeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const me = useMe().data?.user
  const [copied, setCopied] = useState(false)
  const create = useMutation({
    mutationFn: () => authApi.createRecoveryCode(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  })
  const hadCode = Boolean(me?.hasRecoveryCode)
  const { mutate, isIdle } = create
  // Once per dialog: a second code (StrictMode runs effects twice in dev) would silently replace the first.
  const started = useRef(false)
  useEffect(() => {
    if (hadCode || started.current) return
    started.current = true
    mutate()
  }, [hadCode, mutate])

  const code = create.data?.code
  const copy = async () => {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
  }

  return (
    <Modal title={t('recovery.title')} onClose={onClose}>
      <p className="modal__text">{t('recovery.intro')}</p>
      {code ? (
        <>
          <output className="recovery-code" aria-label={t('recovery.enterLabel')}>
            {code}
          </output>
          <p className="modal__warn">{t('recovery.warning')}</p>
          <div className="modal__actions">
            <PillButton variant="tonal" onClick={copy}>
              {copied ? t('recovery.copied') : t('recovery.copy')}
            </PillButton>
            <PillButton variant="primary" onClick={onClose}>
              {t('recovery.done')}
            </PillButton>
          </div>
        </>
      ) : hadCode && isIdle ? (
        <>
          <p className="modal__warn">{t('recovery.replaceWarning')}</p>
          <div className="modal__actions">
            <PillButton variant="primary" onClick={() => mutate()}>
              {t('recovery.create')}
            </PillButton>
          </div>
        </>
      ) : create.isError ? (
        <p className="modal__error" role="alert">
          {translateApiError(create.error, t)}
        </p>
      ) : (
        <p className="modal__text">{t('common.loading')}</p>
      )}
    </Modal>
  )
}

export function RecoveryEnterDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const inputId = useId()
  const [code, setCode] = useState('')
  const signIn = useRecoverySignIn()
  return (
    <Modal title={t('recovery.enterTitle')} onClose={onClose}>
      <form
        className="modal__form"
        onSubmit={(e) => {
          e.preventDefault()
          signIn.mutate(code, { onSuccess: onClose })
        }}
      >
        <label className="field" htmlFor={inputId}>
          <span className="field__label">{t('recovery.enterLabel')}</span>
          <input
            id={inputId}
            className="input mono"
            value={code}
            placeholder={t('recovery.enterHint')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {signIn.isError && (
          <p className="modal__error" role="alert">
            {translateApiError(signIn.error, t)}
          </p>
        )}
        <div className="modal__actions">
          <PillButton variant="primary" type="submit" disabled={code.trim().length < 16 || signIn.isPending}>
            {t('recovery.enterSubmit')}
          </PillButton>
        </div>
      </form>
    </Modal>
  )
}
