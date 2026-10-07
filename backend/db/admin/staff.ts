// Staff accounts (reviewers, admins): the only way to create one, set its password or change its role. There is no
// sign-up page and no password reset by email. The password is read from standard input, never from the command line
// (it would stay in the shell history).
//   npm run staff -w backend -- create <username> <participant|reviewer|admin> [display name]
//   npm run staff -w backend -- password <username>
//   npm run staff -w backend -- role <username> <participant|reviewer|admin>
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { hashPassword } from 'better-auth/crypto'
import { env } from '../../src/config/env.js'
import { pool, withTransaction } from '../../src/db/pool.js'
import { isRole, type Role } from '../../src/lib/permissions.js'
import { checkStaffPassword, normalizeUsername, staffPlaceholderEmail } from '../../src/lib/staffAccount.js'
import { USER_NAME_MAX, USER_NAME_MIN } from '../../src/lib/userName.js'

const isProduction = () => env.NODE_ENV === 'production'

function username(input: string): string {
  const result = normalizeUsername(input)
  if (!result.ok) throw new Error(`Not a valid username (3-30 letters, digits, _ or .): ${input}`)
  return result.username
}

// Staff may use reserved words ("Admin Linh"), so only length and characters are checked.
function displayName(input: string): string {
  const name = input.replace(/\s+/g, ' ').trim()
  const length = Array.from(name).length
  if (length < USER_NAME_MIN || length > USER_NAME_MAX || /[<>]/.test(name) || /\p{Cc}/u.test(name)) {
    throw new Error(`Not a valid name (${USER_NAME_MIN}-${USER_NAME_MAX} characters, no < or >): ${input}`)
  }
  return name
}

async function passwordHash(
  password: string,
  user: string,
  production: boolean,
): Promise<{ hash: string; weak: boolean }> {
  const check = checkStaffPassword(password, { username: user, minLength: env.STAFF_PASSWORD_MIN_LENGTH, production })
  if (!check.ok) {
    const why = {
      empty: 'is empty',
      too_long: 'is longer than 128 characters',
      too_short: `must have at least ${env.STAFF_PASSWORD_MIN_LENGTH} characters`,
      same_as_username: 'must not be the username',
    }[check.reason]
    throw new Error(`Password ${why}`)
  }
  return { hash: await hashPassword(password), weak: check.weak }
}

export async function createStaff(opts: {
  username: string
  role: Role
  password: string
  name?: string
  production?: boolean
}): Promise<{ id: string; weak: boolean }> {
  const user = username(opts.username)
  const name = opts.name === undefined ? user : displayName(opts.name)
  const { hash, weak } = await passwordHash(opts.password, user, opts.production ?? isProduction())
  const id = await withTransaction(async (client) => {
    const taken = await client.query('SELECT 1 FROM users WHERE username = $1', [user])
    if (taken.rowCount) throw new Error(`An account named ${user} already exists (use "password" or "role")`)
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (email, email_verified, display_name, username, display_username, role)
       VALUES ($1, true, $2, $3, $3, $4) RETURNING id`,
      [staffPlaceholderEmail(user), name, user, opts.role],
    )
    const created = rows[0]
    if (!created) throw new Error('No row written')
    await client.query(
      `INSERT INTO auth_accounts (user_id, account_id, provider_id, password) VALUES ($1::uuid, $1::text, 'credential', $2)`,
      [created.id, hash],
    )
    return created.id
  })
  return { id, weak }
}

async function userIdByUsername(input: string): Promise<string> {
  const user = username(input)
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL', [
    user,
  ])
  const found = rows[0]
  if (!found) throw new Error(`No account named ${user}`)
  return found.id
}

// A new password also signs that person out everywhere.
export async function setStaffPassword(opts: {
  username: string
  password: string
  production?: boolean
}): Promise<{ weak: boolean }> {
  const id = await userIdByUsername(opts.username)
  const { hash, weak } = await passwordHash(opts.password, username(opts.username), opts.production ?? isProduction())
  await withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE auth_accounts SET password = $2, updated_at = NOW() WHERE user_id = $1 AND provider_id = 'credential'`,
      [id, hash],
    )
    if (!rowCount) {
      await client.query(
        `INSERT INTO auth_accounts (user_id, account_id, provider_id, password) VALUES ($1::uuid, $1::text, 'credential', $2)`,
        [id, hash],
      )
    }
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [id])
  })
  return { weak }
}

export async function setStaffRole(opts: { username: string; role: Role }): Promise<void> {
  const id = await userIdByUsername(opts.username)
  await pool.query('UPDATE users SET role = $2 WHERE id = $1', [id, opts.role])
}

// Hidden prompt on a terminal; otherwise the first line of standard input (scripts, tests).
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const lines = createInterface({ input: process.stdin })
    for await (const line of lines) return line
    return ''
  }
  process.stdout.write('Password: ')
  return new Promise((resolve) => {
    let typed = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    const onData = (key: string) => {
      if (key === '\r' || key === '\n' || key === '\u0004') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.off('data', onData)
        process.stdout.write('\n')
        resolve(typed)
      } else if (key === '\u0003') {
        process.exit(130)
      } else if (key === '\u007f') {
        typed = typed.slice(0, -1)
      } else {
        typed += key
      }
    }
    process.stdin.on('data', onData)
  })
}

const USAGE = `Usage:
  npm run staff -w backend -- create <username> <participant|reviewer|admin> [display name]
  npm run staff -w backend -- password <username>
  npm run staff -w backend -- role <username> <participant|reviewer|admin>
The password is read from standard input.`

const weakWarning = (weak: boolean) =>
  weak
    ? `\nWarning: weak password (allowed outside production only; production needs ${env.STAFF_PASSWORD_MIN_LENGTH}+ characters).`
    : ''

async function main() {
  const [command, name, third, ...rest] = process.argv.slice(2)
  if (command === 'create' && name && isRole(third)) {
    const { weak } = await createStaff({
      username: name,
      role: third,
      password: await readPassword(),
      name: rest.length ? rest.join(' ') : undefined,
    })
    console.log(`Created ${username(name)} as ${third}. Sign in at /staff/sign-in.${weakWarning(weak)}`)
  } else if (command === 'password' && name && third === undefined) {
    const { weak } = await setStaffPassword({ username: name, password: await readPassword() })
    console.log(`Password changed for ${username(name)}; signed out everywhere.${weakWarning(weak)}`)
  } else if (command === 'role' && name && isRole(third)) {
    await setStaffRole({ username: name, role: third })
    console.log(`${username(name)} is now ${third}.`)
  } else {
    console.error(USAGE)
    process.exitCode = 2
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
