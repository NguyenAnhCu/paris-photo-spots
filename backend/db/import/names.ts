// Generic words that would make every place look alike when comparing names.
const STOPWORDS = new Set([
  'musee', 'museum', 'chateau', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'national', 'nationale', 'paris',
])

export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function nameTokens(name: string): Set<string> {
  return new Set(normalizeName(name).split(' ').filter((t) => t && !STOPWORDS.has(t)))
}

// True when at least half of the shorter name's meaningful tokens appear in the other name.
export function similarNames(a: string, b: string): boolean {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.size === 0 || tb.size === 0) return false
  const shared = [...ta].filter((t) => tb.has(t)).length
  return shared / Math.min(ta.size, tb.size) >= 0.5
}
