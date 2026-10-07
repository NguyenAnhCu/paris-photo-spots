// Staff sign in with a one-time link the backend writes to a log file (no email service in tests).
import { readFile } from 'node:fs/promises'
import type { Browser, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { query } from './db.js'
import { MAGIC_LINK_LOG } from './env.js'

export async function addLinkedUser(
  email: string,
  name: string,
  role: 'participant' | 'reviewer' | 'admin',
): Promise<void> {
  await query(
    `INSERT INTO users (email, email_verified, display_name, role) VALUES ($1, true, $2, $3)
     ON CONFLICT DO NOTHING`,
    [email, name, role],
  )
}

// Opens a new browser context signed in as `email` (already in the database); it lands on /review.
export async function staffPage(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Gửi link đăng nhập' }).click()
  await expect(page.getByRole('status')).toContainText('link đăng nhập đã được gửi')
  const entries = (await readFile(MAGIC_LINK_LOG, 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { email: string; url: string })
  const link = entries.findLast((e) => e.email === email)?.url
  if (!link) throw new Error('no sign-in link written')
  await page.goto(link)
  await expect(page).toHaveURL('/review')
  return page
}
