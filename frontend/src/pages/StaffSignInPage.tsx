import { useId, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { requestStaffLink } from '@/api/moderation'
import { PillButton } from '@/components/ui'
import { useI18n } from '@/i18n/useI18n'
import './StandalonePage.css'

// Reviewers and admins sign in with a one-time link. Same answer for any address: no probing who is staff.
export function StaffSignInPage() {
  const { t } = useI18n()
  const emailId = useId()
  const [email, setEmail] = useState('')
  const send = useMutation({ mutationFn: () => requestStaffLink(email.trim()) })
  return (
    <main className="standalone">
      <h1>{t('staff.title')}</h1>
      {send.isSuccess ? (
        <p role="status">{t('staff.sent')}</p>
      ) : (
        <form
          className="standalone__form"
          onSubmit={(e) => {
            e.preventDefault()
            send.mutate()
          }}
        >
          <label className="field" htmlFor={emailId}>
            <span className="field__label">{t('staff.email')}</span>
            <input
              id={emailId}
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {send.isError && <p role="alert">{t('errors.generic')}</p>}
          <PillButton variant="primary" type="submit" disabled={send.isPending || !email.includes('@')}>
            {t('staff.send')}
          </PillButton>
        </form>
      )}
    </main>
  )
}
