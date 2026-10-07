import { useId, useState } from 'react'
import { useMe, useRename } from '@/hooks/useMe'
import { translateApiError } from '@/i18n/apiError'
import { useI18n } from '@/i18n/useI18n'
import { PillButton } from '@/components/ui'
import { Modal } from './Modal'

export function RenameDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const inputId = useId()
  const hintId = useId()
  const [name, setName] = useState(useMe().data?.user?.name ?? '')
  const rename = useRename()
  return (
    <Modal title={t('rename.title')} onClose={onClose}>
      <form
        className="modal__form"
        onSubmit={(e) => {
          e.preventDefault()
          rename.mutate(name, { onSuccess: onClose })
        }}
      >
        <label className="field" htmlFor={inputId}>
          <span className="field__label">{t('rename.label')}</span>
          <input
            id={inputId}
            className="input"
            value={name}
            maxLength={40}
            autoComplete="nickname"
            aria-describedby={hintId}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p id={hintId} className="modal__text">
          {t('rename.hint')}
        </p>
        {rename.isError && (
          <p className="modal__error" role="alert">
            {translateApiError(rename.error, t)}
          </p>
        )}
        <div className="modal__actions">
          <PillButton variant="primary" type="submit" disabled={name.trim().length < 2 || rename.isPending}>
            {t('rename.save')}
          </PillButton>
        </div>
      </form>
    </Modal>
  )
}
