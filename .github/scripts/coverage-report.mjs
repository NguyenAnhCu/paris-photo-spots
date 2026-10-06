// Turns Vitest json-summary files into one Markdown coverage table (job summary + PR comment).
// Usage: node .github/scripts/coverage-report.mjs "Backend (unit + integration)=backend/coverage/coverage-summary.json" …
// A missing file (its test job failed) is reported as such instead of failing the report.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const MARKER = '<!-- coverage-report -->'
const METRICS = ['lines', 'statements', 'branches', 'functions']

const pct = (m) => (m && m.total > 0 ? `${m.pct.toFixed(1)}%` : '—')
const row = (label, summary) => `| ${label} | ${METRICS.map((k) => pct(summary?.[k])).join(' | ')} |`
const header = (first) => `| ${first} | Lines | Statements | Branches | Functions |\n|---|---|---|---|---|`

// Per-file entries are absolute paths inside the checkout, the same in every CI job (and locally): make them relative to
// the repository root (the working directory), drop the package folder, group by the next two (src/modules, db/import…).
function byFolder(summary) {
  const groups = new Map()
  for (const [file, metrics] of Object.entries(summary)) {
    if (file === 'total') continue
    const rel = path.relative(process.cwd(), file).split(path.sep).slice(1)
    const key = rel.length > 2 ? rel.slice(0, 2).join('/') : rel.slice(0, -1).join('/') || '.'
    const g = groups.get(key) ?? Object.fromEntries(METRICS.map((k) => [k, { total: 0, covered: 0 }]))
    for (const k of METRICS) {
      g[k].total += metrics[k].total
      g[k].covered += metrics[k].covered
    }
    groups.set(key, g)
  }
  for (const g of groups.values())
    for (const k of METRICS) g[k].pct = g[k].total ? (100 * g[k].covered) / g[k].total : 100
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

export function report(entries) {
  const loaded = entries.map(({ label, file }) => ({
    label,
    file,
    summary: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null,
  }))
  const lines = [MARKER, '### Test coverage', '', header('')]
  for (const { label, summary } of loaded)
    lines.push(summary ? row(`**${label}**`, summary.total) : `| **${label}** | not available (tests failed?) | | | |`)
  for (const { label, summary } of loaded) {
    if (!summary) continue
    lines.push('', `<details><summary>${label} by folder</summary>`, '', header('Folder'))
    for (const [folder, metrics] of byFolder(summary)) lines.push(row(`\`${folder}\``, metrics))
    lines.push('', '</details>')
  }
  lines.push('', '_Reported for information only — coverage does not block merging._')
  return lines.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = process.argv.slice(2).map((arg) => {
    const i = arg.lastIndexOf('=')
    return { label: arg.slice(0, i), file: arg.slice(i + 1) }
  })
  process.stdout.write(`${report(entries)}\n`)
}
