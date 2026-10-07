// Gives a person a role, creating their (non-anonymous) account if needed. The first admin is made this way: there
// is no page where someone can make themselves staff. They then sign in with a link sent to that email.
//   npm run user:role -w backend -- linh@example.com admin "Linh"
import { pathToFileURL } from 'node:url'
import { pool } from '../../src/db/pool.js'
import { isRole, type Role } from '../../src/lib/permissions.js'
import { USER_NAME_MAX, USER_NAME_MIN } from '../../src/lib/userName.js'

// Staff may use reserved words ("Admin Linh"), so only length and characters are checked here.
function staffName(input: string): string {
  const name = input.replace(/\s+/g, ' ').trim()
  const length = Array.from(name).length
  if (length < USER_NAME_MIN || length > USER_NAME_MAX || /[<>]/.test(name) || /\p{Cc}/u.test(name)) {
    throw new Error(`Not a valid name (${USER_NAME_MIN}-${USER_NAME_MAX} characters, no < or >): ${input}`)
  }
  return name
}

// A name given renames an existing account; without one, an existing account keeps its name.
export async function setUserRole(email: string, role: Role, name?: string): Promise<{ id: string; created: boolean }> {
  const address = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error(`Not an email address: ${email}`)
  const given = name === undefined ? null : staffName(name)
  const { rows } = await pool.query<{ id: string; created: boolean }>(
    `WITH found AS (
       UPDATE users SET role = $2, is_anonymous = false, display_name = COALESCE($3, display_name)
       WHERE lower(email) = $1 AND deleted_at IS NULL RETURNING id
     ), made AS (
       INSERT INTO users (email, email_verified, display_name, role)
       SELECT $1, true, COALESCE($3, $4), $2 WHERE NOT EXISTS (SELECT 1 FROM found)
       RETURNING id
     )
     SELECT id, false AS created FROM found UNION ALL SELECT id, true AS created FROM made`,
    [address, role, given, address.split('@')[0]],
  )
  const row = rows[0]
  if (!row) throw new Error('No row written')
  return row
}

async function main() {
  const [email, role, name] = process.argv.slice(2)
  if (!email || !isRole(role)) {
    console.error('Usage: npm run user:role -w backend -- <email> <participant|reviewer|admin> [display name]')
    process.exit(2)
  }
  const { created } = await setUserRole(email, role, name)
  console.log(`${created ? 'Created' : 'Updated'} ${email} as ${role}. Sign in at /staff/sign-in.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .catch((err: unknown) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
