// Helpers for the posting identity: the first post asks for the terms, then offers a recovery code.
import { expect, type Page } from '@playwright/test'

export async function acceptTerms(page: Page) {
  await page.getByRole('checkbox', { name: /Điều khoản sử dụng/ }).check()
}

// The "save your recovery code" dialog that follows a first post. Returns the code shown.
export async function closeRecoveryCode(page: Page): Promise<string> {
  const dialog = page.getByRole('dialog', { name: 'Lưu mã khôi phục' })
  const code = dialog.locator('.recovery-code')
  await expect(code).toHaveText(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)
  const text = (await code.textContent()) ?? ''
  await dialog.getByRole('button', { name: 'Tôi đã lưu' }).click()
  await expect(dialog).toBeHidden()
  return text
}
