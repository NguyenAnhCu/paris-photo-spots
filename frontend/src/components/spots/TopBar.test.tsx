import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { currentLocation, renderWithApp } from '@/test/render'
import { FilterControl, SearchField, TopBar } from './TopBar'

const t = createTranslator('vi')
const location = () => currentLocation(screen.getByTestId('location'))
const searchBox = () => screen.getByRole('searchbox', { name: t('search.label') })

// Types like a browser does when keys come faster than React re-renders: each key appends to whatever the DOM input
// holds right now, dispatched outside act() so the router's URL update (a transition) is still pending at the next
// key. userEvent.type wraps every key in act(), which flushes the URL first and hides the bug.
function typeFast(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  env.IS_REACT_ACT_ENVIRONMENT = false
  for (const ch of text) {
    setValue?.call(input, input.value + ch)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
}
afterEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('SearchField', () => {
  // Regression: the input was bound straight to ?q=, which lags behind keystrokes; typing "cau" fast left "u".
  it('keeps every character when typing fast and mirrors the text into ?q=', async () => {
    const user = userEvent.setup()
    renderWithApp(<SearchField variant="column" />, { route: '/?lang=vi' })
    await user.click(searchBox())
    typeFast(searchBox() as HTMLInputElement, 'cau ca')
    await waitFor(() => expect(new URLSearchParams(location().search).get('q')).toBe('cau ca'))
    expect(searchBox()).toHaveValue('cau ca')
    expect(new URLSearchParams(location().search).get('lang')).toBe('vi')
  })

  it('desktop bar: typing from a spot page goes back to the list with the query, in one navigation', async () => {
    const user = userEvent.setup({ delay: null })
    renderWithApp(<SearchField variant="bar" />, { route: '/spots/abc?cat=park' })
    await user.type(searchBox(), 'pont')
    expect(searchBox()).toHaveValue('pont')
    expect(location()).toEqual({ path: '/', search: '?cat=park&q=pont' })
  })

  it('shows the URL query when not focused (shared link, Back, "clear filters")', () => {
    renderWithApp(<SearchField variant="column" />, { route: '/?q=seine' })
    expect(searchBox()).toHaveValue('seine')
  })

  it('"/" focuses the search field from anywhere, but not while typing in another field', async () => {
    const user = userEvent.setup()
    renderWithApp(
      <>
        <input aria-label="other" />
        <SearchField variant="bar" />
      </>,
    )
    await user.keyboard('/')
    expect(searchBox()).toHaveFocus()
    expect(searchBox()).toHaveValue('')
    await user.click(screen.getByLabelText('other'))
    await user.keyboard('/')
    expect(screen.getByLabelText('other')).toHaveValue('/')
  })
})

describe('FilterControl', () => {
  const filterButton = () => screen.getByRole('button', { name: t('filter.button') })

  it('opens the category chips, picks one into ?cat= and closes', async () => {
    const user = userEvent.setup()
    renderWithApp(<FilterControl variant="bar" />)
    expect(filterButton()).toHaveAttribute('aria-expanded', 'false')
    await user.click(filterButton())
    expect(screen.getByRole('group', { name: t('filter.label') })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: new RegExp(t('category.park')) }))
    expect(new URLSearchParams(location().search).get('cat')).toBe('park')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    // The button now names the active category.
    expect(screen.getByRole('button', { name: t('category.park') })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes with Escape and with a click outside (desktop bar)', async () => {
    const user = userEvent.setup()
    renderWithApp(<FilterControl variant="bar" />)
    await user.click(filterButton())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    await user.click(filterButton())
    await user.click(document.body)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})

describe('TopBar', () => {
  it('is a header landmark with home, search, filter, language and "Thêm mark"', async () => {
    const user = userEvent.setup()
    renderWithApp(<TopBar />, { route: '/spots/abc?lang=vi' })
    expect(screen.getByRole('banner')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t('add.button') }))
    expect(location()).toEqual({ path: '/add', search: '?lang=vi' })
    await user.click(screen.getByRole('button', { name: t('app.home') }))
    expect(location()).toEqual({ path: '/', search: '?lang=vi' })
  })
})
