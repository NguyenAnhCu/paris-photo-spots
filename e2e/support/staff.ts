// Staff accounts are made with the real command-line tool (password on standard input, production rules), then
// signed in through the staff sign-in page.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { Browser, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { query } from './db.js'
import { AUTH_SECRET, DATABASE_URL, ROOT_DIR, WEB_URL } from './env.js'

export const STAFF_PASSWORD = 'a long e2e staff password'

// The database is reset once per spec file: an account made by an earlier test of the file is kept.
export async function addStaff(username: string, role: 'participant' | 'reviewer' | 'admin', name?: string) {
  if ((await query('SELECT 1 FROM users WHERE username = $1', [username])).length) return
  execFileSync('npx', ['tsx', 'db/admin/staff.ts', 'create', username, role, ...(name ? [name] : [])], {
    cwd: path.join(ROOT_DIR, 'backend'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL,
      BETTER_AUTH_SECRET: AUTH_SECRET,
      PUBLIC_ORIGIN: WEB_URL,
    },
    input: `${STAFF_PASSWORD}\n`,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export async function signInStaff(page: Page, username: string, password = STAFF_PASSWORD): Promise<void> {
  await page.goto('/staff/sign-in')
  await page.getByLabel('Tên đăng nhập').fill(username)
  await page.getByLabel('Mật khẩu').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
}

// A new browser context signed in as `username`: admins land on /admin, reviewers on /review.
export async function staffPage(browser: Browser, username: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await signInStaff(page, username)
  await expect(page).not.toHaveURL(/\/staff\/sign-in/)
  return page
}
