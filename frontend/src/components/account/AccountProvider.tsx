import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AccountUiContext, type AccountDialog } from './accountUi'
import { RecoveryCodeDialog, RecoveryEnterDialog } from './RecoveryDialogs'
import { RenameDialog } from './RenameDialog'
import { SignOutDialog } from './SignOutDialog'

// Account dialogs live above the routes: the recovery-code prompt opened after a first post must survive the
// navigation to the new spot.
export function AccountProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<AccountDialog | null>(null)
  const close = useCallback(() => setDialog(null), [])
  const value = useMemo(() => ({ open: (d: AccountDialog) => setDialog(d) }), [])
  return (
    <AccountUiContext.Provider value={value}>
      {children}
      {dialog === 'recovery-show' && <RecoveryCodeDialog onClose={close} />}
      {dialog === 'recovery-enter' && <RecoveryEnterDialog onClose={close} />}
      {dialog === 'rename' && <RenameDialog onClose={close} />}
      {dialog === 'sign-out' && <SignOutDialog onClose={close} onSaveCode={() => setDialog('recovery-show')} />}
    </AccountUiContext.Provider>
  )
}
