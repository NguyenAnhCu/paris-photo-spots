import { createContext, useContext } from 'react'

export type AccountDialog = 'recovery-show' | 'recovery-enter' | 'rename' | 'sign-out'
export type AccountUi = { open: (dialog: AccountDialog) => void }

export const AccountUiContext = createContext<AccountUi | null>(null)

export function useAccountUi(): AccountUi {
  const ui = useContext(AccountUiContext)
  if (!ui) throw new Error('useAccountUi outside AccountProvider')
  return ui
}
