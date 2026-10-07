import { CircleUserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMe } from '@/hooks/useMe'
import { useI18n } from '@/i18n/useI18n'
import { useAccountUi } from './accountUi'
import './account.css'

// Top of the add forms: who the post will be published as, and the terms to accept before the first post.
export function IdentityStrip({
  termsChecked,
  onTermsChange,
}: {
  termsChecked: boolean
  onTermsChange: (v: boolean) => void
}) {
  const { t } = useI18n()
  const ui = useAccountUi()
  const me = useMe().data?.user
  const needsTerms = !me?.termsAccepted
  return (
    <div className="identity">
      <div className="identity__who">
        <CircleUserRound size={22} strokeWidth={2} aria-hidden="true" />
        {me ? (
          <span>
            {t('identity.postingAs')} <b>{me.name}</b> ·{' '}
            <button type="button" className="link-button" onClick={() => ui.open('rename')}>
              {t('account.rename')}
            </button>
          </span>
        ) : (
          <span>
            {t('identity.newAnonymous')}{' '}
            <button type="button" className="link-button" onClick={() => ui.open('recovery-enter')}>
              {t('identity.haveCode')}
            </button>
          </span>
        )}
      </div>
      {needsTerms && (
        <label className="identity__terms">
          <input type="checkbox" checked={termsChecked} onChange={(e) => onTermsChange(e.target.checked)} />
          <span>
            {t('identity.termsBefore')}{' '}
            <Link to="/terms" target="_blank" rel="noopener">
              {t('identity.termsLink')}
            </Link>{' '}
            {t('identity.termsAfter')}
          </span>
        </label>
      )}
    </div>
  )
}
