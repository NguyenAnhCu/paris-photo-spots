import { CircleUserRound } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMe } from '@/hooks/useMe'
import { useI18n } from '@/i18n/useI18n'
import { useAccountUi } from './accountUi'
import './account.css'

// Account button in the header. Visitors without an identity only get "use a recovery code" (they get an identity
// automatically with their first post); participants get rename, recovery code and sign out.
export function AccountMenu() {
  const { t } = useI18n()
  const me = useMe().data?.user
  const ui = useAccountUi()
  const navigate = useNavigate()
  const unread = me?.unreadDecisions ?? 0
  const isStaff = me?.role === 'reviewer' || me?.role === 'admin'
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => wrap.current?.contains(e.target as Node) || setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const item = (label: string, action: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="account-menu__item"
      onClick={() => {
        setOpen(false)
        // The menu item disappears with the menu: hand focus to the account button first, so the dialog gives it back
        // there when it closes (keyboard users would otherwise land on <body>).
        button.current?.focus()
        action()
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="account-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="account-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={
          me
            ? `${t('account.menu')}: ${me.name}${unread ? ` (${t('account.unread', { count: unread })})` : ''}`
            : t('account.button')
        }
        onClick={() => setOpen((o) => !o)}
      >
        <CircleUserRound size={20} strokeWidth={2} aria-hidden="true" />
        {me && <span className="account-menu__name">{me.name}</span>}
        {unread > 0 && (
          <span className="account-menu__badge" aria-hidden="true">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div id={menuId} className="account-menu__popover" role="menu" aria-label={t('account.menu')}>
          {me ? (
            <>
              <p className="account-menu__who">
                <b>{me.name}</b>
                {me.isAnonymous && <span>{t('account.anonymous')}</span>}
              </p>
              {item(unread ? `${t('account.myPosts')} (${unread})` : t('account.myPosts'), () => navigate('/me/posts'))}
              {isStaff && item(t('account.review'), () => navigate('/review'))}
              {me.role === 'admin' && item(t('account.admin'), () => navigate('/admin'))}
              {item(t('account.rename'), () => ui.open('rename'))}
              {item(t('account.recoveryCode'), () => ui.open('recovery-show'))}
              {item(t('account.signOut'), () => ui.open('sign-out'))}
            </>
          ) : (
            item(t('account.useRecoveryCode'), () => ui.open('recovery-enter'))
          )}
        </div>
      )}
    </div>
  )
}
