import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { fakeFetch, identityServer, json, renderWithApp } from '@/test/render'
import { ReportDialog } from './ReportDialog'

const t = createTranslator('vi')

describe('ReportDialog', () => {
  it('a visitor without an identity gets one, then the report is sent with reason and message', async () => {
    const identity = identityServer(null)
    const reports: unknown[] = []
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        ...identity.routes,
        'POST /api/v1/reports': (_url, init) => {
          reports.push(JSON.parse(String(init?.body)))
          return json(201, { received: true })
        },
      }),
    )
    const user = userEvent.setup()
    renderWithApp(<ReportDialog target={{ type: 'photo', id: 'p1' }} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: t('report.title') })
    await user.selectOptions(within(dialog).getByLabelText(t('report.reason')), 'people_identifiable')
    await user.type(within(dialog).getByLabelText(t('report.message')), '  Tôi trong ảnh ')
    await user.click(within(dialog).getByRole('button', { name: t('report.send') }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent(t('report.thanks'))
    expect(identity.calls).toEqual(['sign-in/anonymous lang=vi']) // identity only: no terms needed to report
    expect(reports).toEqual([
      { target_type: 'photo', target_id: 'p1', reason_code: 'people_identifiable', message: 'Tôi trong ảnh' },
    ])
  })
})
