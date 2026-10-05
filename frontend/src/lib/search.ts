// Accent-insensitive search (typing "Cau" must find "Cầu", "eglise" must find "Église").
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

// Every word of the query must appear somewhere in one of the fields.
export function matchesQuery(query: string, fields: (string | null | undefined)[]): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeText(fields.filter(Boolean).join(' '))
  return words.every((w) => haystack.includes(w))
}
