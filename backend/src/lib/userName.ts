// Names participants are shown under. Anonymous ones get a generated name; anyone can rename themselves.

const ANONYMOUS_PREFIX: Record<string, string> = { vi: 'Lữ khách', en: 'Traveller', fr: 'Voyageur' }

export function anonymousName(lang: string, random: () => number = Math.random): string {
  const prefix = ANONYMOUS_PREFIX[lang] ?? ANONYMOUS_PREFIX.vi
  return `${prefix} ${1000 + Math.floor(random() * 9000)}`
}

export const USER_NAME_MIN = 2
export const USER_NAME_MAX = 40

// Words a participant may not use: they would pass the person off as staff or as the app itself.
// Compared without accents and case ("Quản trị" = "quan tri").
const RESERVED = [
  'admin',
  'administrator',
  'reviewer',
  'moderator',
  'paris photo spots',
  'quan tri',
  'kiem duyet',
  'moderateur',
]

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

export function normalizeUserName(input: string): { ok: true; name: string } | { ok: false } {
  const name = input.replace(/\s+/g, ' ').trim()
  const length = Array.from(name).length
  if (length < USER_NAME_MIN || length > USER_NAME_MAX) return { ok: false }
  if (/[<>]/.test(name) || /\p{Cc}/u.test(name)) return { ok: false }
  const folded = fold(name)
  // Whole words only: "Badminton fan" is fine, "Admin" is not.
  if (RESERVED.some((word) => new RegExp(`(^|[^a-z0-9])${word}($|[^a-z0-9])`).test(folded))) return { ok: false }
  return { ok: true, name }
}
