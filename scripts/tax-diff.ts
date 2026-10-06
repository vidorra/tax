/**
 * Vergelijkt de parameters van twee belastingjaren en controleert alle jaarmodules.
 *
 *   npx tsx scripts/tax-diff.ts 2026 2027 [--variant brief-29-09]
 *   npx tsx scripts/tax-diff.ts --check
 *   npx tsx scripts/tax-diff.ts 2026 2027 --check
 *
 * Diff: elk gewijzigd parameterpad met oude en nieuwe waarde en de status in beide jaren.
 * De variant wordt op het tweede jaar toegepast; met `--variant` zonder tweede jaar wordt
 * het jaar zonder variant met het jaar met variant vergeleken.
 *
 * --check: exit-code 1 als een jaar (of variant) een `bijgewerkt` heeft die ouder is dan de
 * laatste changelogregel, of als validateYear fouten meldt. Waarschuwingen (bijvoorbeeld een
 * onvolledige KOT-tabel) worden getoond maar laten de controle niet falen.
 */
import type { TaxYearParams } from '../lib/tax/types'
import { plat, statusVan, diff } from '../lib/tax/years/diff'
import { JAREN, getJaar } from '../lib/tax/years/index'
import { validateYear, WAARSCHUWING_PREFIX } from '../lib/tax/years/validate'

const argv = process.argv.slice(2)
const vlag = (naam: string) => argv.includes(`--${naam}`)
const optie = (naam: string) => {
  const i = argv.indexOf(`--${naam}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const variant = optie('variant')
const jaren = argv.filter((a, i) => /^\d{4}$/.test(a) && argv[i - 1] !== '--variant').map(Number)

// ---------------------------------------------------------------------------
// Platslaan en vergelijken: de pure logica staat in lib/tax/years/diff.ts
// ---------------------------------------------------------------------------

export { plat, statusVan, diff }

const fmt = (x: unknown): string => {
  if (x === undefined) return '(ontbreekt)'
  if (typeof x === 'number') return Number.isFinite(x) ? (Number.isInteger(x) ? x.toLocaleString('nl-NL') : String(x).replace('.', ',')) : 'geen maximum'
  if (x === null) return 'null'
  return String(x)
}

function toonDiff(a: TaxYearParams, b: TaxYearParams, labelA: string, labelB: string): void {
  const regels = diff(a, b)
  console.log(`Verschillen ${labelA} en ${labelB}: ${regels.length} parameter(s)`)
  console.log(`Status jaar: ${labelA} ${a.status}, ${labelB} ${b.status}\n`)
  const breed = Math.min(60, Math.max(10, ...regels.map((r) => r.pad.length)))
  for (const r of regels) {
    const status = r.statusOud === r.statusNieuw ? r.statusNieuw : `${r.statusOud || '-'} / ${r.statusNieuw || '-'}`
    console.log(`${r.pad.padEnd(breed)}  ${fmt(r.oud).padStart(14)}  ${fmt(r.nieuw).padStart(14)}  [${status}]`)
  }
}

// ---------------------------------------------------------------------------
// Controle
// ---------------------------------------------------------------------------

export function controleer(): { fouten: string[]; waarschuwingen: string[] } {
  const fouten: string[] = []
  const waarschuwingen: string[] = []
  const verwerk = (label: string, p: TaxYearParams) => {
    const laatste = p.changelog.map((c) => c.datum).sort().at(-1)
    if (laatste && p.bijgewerkt < laatste) fouten.push(`${label}: bijgewerkt ${p.bijgewerkt} is ouder dan de laatste changelogregel ${laatste}`)
    for (const x of validateYear(p)) (x.startsWith(WAARSCHUWING_PREFIX) ? waarschuwingen : fouten).push(`${label}: ${x}`)
  }
  for (const j of Object.keys(JAREN).map(Number).sort((x, y) => x - y)) {
    const p = getJaar(j)
    verwerk(String(j), p)
    for (const v of p.varianten) verwerk(`${j} (${v.id})`, getJaar(j, v.id))
  }
  return { fouten, waarschuwingen }
}

// ---------------------------------------------------------------------------
// Uitvoeren
// ---------------------------------------------------------------------------

let code = 0
if (jaren.length >= 1) {
  const [ja, jb] = jaren
  if (jb === undefined) {
    if (!variant) {
      console.error('Geef twee jaren op, of één jaar met --variant.')
      process.exit(2)
    }
    toonDiff(getJaar(ja), getJaar(ja, variant), String(ja), `${ja} (${variant})`)
  } else {
    toonDiff(getJaar(ja), getJaar(jb, variant), String(ja), variant ? `${jb} (${variant})` : String(jb))
  }
}
if (vlag('check')) {
  const { fouten, waarschuwingen } = controleer()
  if (jaren.length >= 1) console.log('')
  for (const w of waarschuwingen) console.log(`waarschuwing  ${w}`)
  for (const f of fouten) console.log(`fout          ${f}`)
  console.log(fouten.length === 0 ? `Controle geslaagd (${Object.keys(JAREN).length} jaren, ${waarschuwingen.length} waarschuwing(en)).` : `Controle mislukt: ${fouten.length} fout(en).`)
  if (fouten.length > 0) code = 1
}
if (jaren.length === 0 && !vlag('check')) {
  console.error('Gebruik: npx tsx scripts/tax-diff.ts <jaar> <jaar> [--variant id] [--check]')
  code = 2
}
process.exit(code)
