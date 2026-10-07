import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { PillButton } from '@/components/ui'
import { useStaffSignIn } from '@/hooks/useMe'
import { translateApiError } from '@/i18n/apiError'
import { useI18n } from '@/i18n/useI18n'
import './StandalonePage.css'

// Codes that would tell a guesser which part was wrong (or how usernames look): all shown as one message.
const BAD_CREDENTIALS = new Set([
  'INVALID_USERNAME_OR_PASSWORD',
  'USERNAME_TOO_SHORT',
  'USERNAME_TOO_LONG',
  'INVALID_USERNAME',
])

// Reviewers and admins sign in with the username and password an admin gave them (no sign-up).
export function StaffSignInPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const usernameId = useId()
  const passwordId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const signIn = useStaffSignIn()
  const error = signIn.error
  const message =
    error instanceof ApiError && error.code && BAD_CREDENTIALS.has(error.code)
      ? t('errors.INVALID_USERNAME_OR_PASSWORD')
      : error && translateApiError(error, t)

  return (
    <main className="standalone">
      <h1>{t('staff.title')}</h1>
      <p>{t('staff.intro')}</p>
      <form
        className="standalone__form"
        onSubmit={(e) => {
          e.preventDefault()
          signIn.mutate(
            { username, password },
            {
              onSuccess: (me) => {
                const role = me.user?.role
                navigate(role === 'admin' ? '/admin' : role === 'reviewer' ? '/review' : '/', { replace: true })
              },
              onError: () => setPassword(''),
            },
          )
        }}
      >
        <label className="field" htmlFor={usernameId}>
          <span className="field__label">{t('staff.username')}</span>
          <input
            id={usernameId}
            className="input"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field" htmlFor={passwordId}>
          <span className="field__label">{t('staff.password')}</span>
          <input
            id={passwordId}
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && <p role="alert">{message}</p>}
        <PillButton variant="primary" type="submit" disabled={signIn.isPending || !username.trim() || !password}>
          {t('staff.submit')}
        </PillButton>
      </form>
    </main>
  )
}
