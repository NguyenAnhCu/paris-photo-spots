import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { fakeFetch, identityServer, renderWithApp } from '@/test/render'
import { AccountMenu } from './AccountMenu'

const t = createTranslator('vi')

function renderMenu(user: Parameters<typeof identityServer>[0]) {
  const identity = identityServer(user)
  vi.stubGlobal('fetch', fakeFetch(identity.routes))
  const u = userEvent.setup()
  renderWithApp(<AccountMenu />)
  return { user: u, identity }
}

const anonymousNoCode = { name: 'Lữ khách 4821', termsAccepted: true, hasRecoveryCode: false }

describe('AccountMenu', () => {
  it('a visitor without an identity can only use a recovery code', async () => {
    const { user } = renderMenu(null)
    await user.click(await screen.findByRole('button', { name: t('account.button') }))
    const menu = screen.getByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([t('account.useRecoveryCode')])
  })

  it('recovery code: a wrong code says so; the right one signs in as that participant', async () => {
    const { user, identity } = renderMenu(null)
    await user.click(await screen.findByRole('button', { name: t('account.button') }))
    await user.click(screen.getByRole('menuitem', { name: t('account.useRecoveryCode') }))
    const dialog = screen.getByRole('dialog', { name: t('recovery.enterTitle') })
    const input = within(dialog).getByLabelText(t('recovery.enterLabel'))

    await user.type(input, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ')
    await user.click(within(dialog).getByRole('button', { name: t('recovery.enterSubmit') }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(t('errors.INVALID_RECOVERY_CODE'))

    await user.clear(input)
    await user.type(input, 'ab12 cd34 ef56 gh78')
    await user.click(within(dialog).getByRole('button', { name: t('recovery.enterSubmit') }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Lữ khách 4821')).toBeInTheDocument()
    expect(identity.calls.at(-1)).toBe('recovery-code/sign-in ab12 cd34 ef56 gh78')
  })

  it('shows the participant name and the anonymous badge', async () => {
    const { user } = renderMenu(anonymousNoCode)
    await user.click(await screen.findByRole('button', { name: `${t('account.menu')}: Lữ khách 4821` }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveTextContent(t('account.anonymous'))
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([t('account.rename'), t('account.recoveryCode'), t('account.signOut')])
  })

  it('sign out without a saved code warns first and offers to save the code', async () => {
    const { user, identity } = renderMenu(anonymousNoCode)
    await user.click(await screen.findByRole('button', { name: /Lữ khách 4821/ }))
    await user.click(screen.getByRole('menuitem', { name: t('account.signOut') }))
    const dialog = screen.getByRole('dialog', { name: t('signOut.title') })
    expect(dialog).toHaveTextContent(t('signOut.warnNoCode'))

    await user.click(within(dialog).getByRole('button', { name: t('signOut.saveFirst') }))
    const codeDialog = await screen.findByRole('dialog', { name: t('recovery.title') })
    expect(await within(codeDialog).findByText('AB12-CD34-EF56-GH78')).toBeInTheDocument()
    expect(identity.calls).toEqual(['recovery-code/create'])
  })

  it('sign out with a saved code just signs out', async () => {
    const { user, identity } = renderMenu({ ...anonymousNoCode, hasRecoveryCode: true })
    await user.click(await screen.findByRole('button', { name: /Lữ khách 4821/ }))
    await user.click(screen.getByRole('menuitem', { name: t('account.signOut') }))
    const dialog = screen.getByRole('dialog', { name: t('signOut.title') })
    expect(dialog).toHaveTextContent(t('signOut.info'))
    await user.click(within(dialog).getByRole('button', { name: t('signOut.confirm') }))
    await waitFor(() => expect(identity.calls).toEqual(['sign-out']))
    expect(await screen.findByRole('button', { name: t('account.button') })).toBeInTheDocument()
  })

  it('rename: a refused name explains why; a good one updates the menu', async () => {
    const { user } = renderMenu(anonymousNoCode)
    await user.click(await screen.findByRole('button', { name: /Lữ khách 4821/ }))
    await user.click(screen.getByRole('menuitem', { name: t('account.rename') }))
    const dialog = screen.getByRole('dialog', { name: t('rename.title') })
    const input = within(dialog).getByLabelText(t('rename.label'))
    expect(input).toHaveValue('Lữ khách 4821')
    expect(input).toHaveFocus()

    await user.clear(input)
    await user.type(input, 'Admin')
    await user.click(within(dialog).getByRole('button', { name: t('rename.save') }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(t('errors.INVALID_NAME'))

    await user.clear(input)
    await user.type(input, 'Linh')
    await user.click(within(dialog).getByRole('button', { name: t('rename.save') }))
    expect(await screen.findByRole('button', { name: `${t('account.menu')}: Linh` })).toBeInTheDocument()
  })

  it('Escape closes the dialog and gives focus back to the account button', async () => {
    const { user } = renderMenu(anonymousNoCode)
    const button = await screen.findByRole('button', { name: /Lữ khách 4821/ })
    await user.click(button)
    await user.click(screen.getByRole('menuitem', { name: t('account.rename') }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button).toHaveFocus()
  })
})
