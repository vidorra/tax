/**
 * Maakt een skelet voor een nieuw belastingjaar op basis van een bestaand jaar.
 *
 *   npx tsx scripts/tax-derive.ts 2029 --from 2028 [--tcf 1.025] [--deel 0.5] [--beleidsmatig 0] [--datum 2026-10-04] [--write]
 *
 * Indexatieregels (plan hoofdstuk 6.1 punt 9):
 *  - bedragen × (1 + toegepastDeel × (tcf − 1))
 *  - grens schijf 1 × (1 + schijf1Factor × toegepastDeel × (tcf − 1))
 *  - toptariefgrens × indexfactor + beleidsmatige mutatie
 *  - percentages ongewijzigd; afgeleide waarden (vast bedrag eigenwoningforfait, KIA-maximum,
 *    maximum jaarruimte, afbouw algemene heffingskorting) opnieuw berekend
 *  - AOW-franchise ongewijzigd en gemarkeerd: volgt de AOW-uitkering, handmatig bijwerken
 *  - bedragen die niet automatisch indexeren (vaste wettelijke bedragen, toeslagen, Zvw,
 *    kinderbijslag, KOT) blijven staan; alles krijgt status 'geschat'
 *
 * Zonder --write wordt de module op stdout gezet. Met --write wordt
 * lib/tax/years/<jaar>.draft.ts alleen geschreven als dat bestand nog niet bestaat.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { TaxYearParams } from '../lib/tax/types'
import { BLOK_NAMEN } from '../lib/tax/types'
import { getJaar } from '../lib/tax/years/index'
import { BIJTELLING_NUL_EMISSIE } from '../lib/tax/years/data/bijtelling'
import kinderbijslagData from '../lib/tax/years/data/kinderbijslag.json'
import { KOT_BESTANDEN, validateYear, alleenFouten } from '../lib/tax/years/validate'

// ---------------------------------------------------------------------------
// Argumenten
// ---------------------------------------------------------------------------

function arg(naam: string): string | undefined {
  const i = process.argv.indexOf(`--${naam}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const jaar = Number(process.argv[2])
const basisJaar = Number(arg('from') ?? jaar - 1)
if (!Number.isInteger(jaar) || !Number.isInteger(basisJaar)) {
  console.error('Gebruik: npx tsx scripts/tax-derive.ts <jaar> --from <basisjaar> [--tcf x] [--deel y] [--beleidsmatig z] [--write]')
  process.exit(2)
}

const basis = getJaar(basisJaar)
const tcf = Number(arg('tcf') ?? basis.indexatie.tcf)
const toegepastDeel = Number(arg('deel') ?? basis.indexatie.toegepastDeel)
const schijf1Factor = basis.indexatie.schijf1Factor
const beleidsmatig = Number(arg('beleidsmatig') ?? 0)
const datum = arg('datum') ?? new Date().toISOString().slice(0, 10)

const factor = 1 + toegepastDeel * (tcf - 1)
const factorSchijf1 = 1 + schijf1Factor * toegepastDeel * (tcf - 1)

// ---------------------------------------------------------------------------
// Indexatie
// ---------------------------------------------------------------------------

const r = (x: number) => Math.round(x)
const idx = (x: number) => r(x * factor)
/** Drempels die de wet op honderdtallen naar beneden afrondt. */
const idx100 = (x: number) => Math.floor((x * factor) / 100) * 100

export function deriveer(b: TaxYearParams): { p: TaxYearParams; handmatig: string[] } {
  const p = getJaar(b.jaar) // diepe kopie
  const handmatig: string[] = []

  p.jaar = jaar
  p.bijgewerkt = datum
  p.varianten = []
  p.indexatie = { tcf, toegepastDeel, schijf1Factor, beleidsmatigToptariefgrens: beleidsmatig }
  p.changelog = [
    {
      datum,
      wat: `Skelet afgeleid van ${b.jaar} met tax-derive: bedragen × ${factor.toFixed(5)} (tcf ${tcf}, toegepast deel ${toegepastDeel}), grens schijf 1 × ${factorSchijf1.toFixed(5)}, toptariefgrens ${beleidsmatig >= 0 ? '+' : ''}${beleidsmatig}`,
    },
  ]

  // Box 1
  const s = p.box1.waarde.schijven
  if (s.length >= 2 && s[0].tot !== null) s[0].tot = r(s[0].tot * factorSchijf1)
  if (s.length >= 3 && s[s.length - 2].tot !== null) s[s.length - 2].tot = idx(s[s.length - 2].tot as number) + beleidsmatig
  p.box1.waarde.schijf1TotGeborenVoor1946 = r(p.box1.waarde.schijf1TotGeborenVoor1946 * factorSchijf1)

  // Heffingskortingen
  const h = p.heffingskortingen.waarde
  h.algemeen.max = idx(h.algemeen.max)
  h.algemeen.afbouwVanaf = idx(h.algemeen.afbouwVanaf)
  h.algemeen.aowMax = idx(h.algemeen.aowMax)
  const toptariefgrens = s.length >= 2 ? s[s.length - 2].tot : null
  if (toptariefgrens !== null) h.algemeen.afbouwPct = Math.round((h.algemeen.max / (toptariefgrens - h.algemeen.afbouwVanaf)) * 1e5) / 1e5
  for (const ak of [h.arbeid, h.arbeidAow]) {
    for (const t of ak.opbouw) {
      t.tot = idx(t.tot)
      t.basis = idx(t.basis)
    }
    ak.max = idx(ak.max)
    ak.afbouwVanaf = ak.opbouw[ak.opbouw.length - 1].tot
  }
  h.iack.drempel = idx(h.iack.drempel)
  h.iack.max = idx(h.iack.max)
  handmatig.push('heffingskortingen.iack.max: wettelijke verlaging (320 per jaar, prijspeil 2023) handmatig verwerken')
  h.ouderen.max = idx(h.ouderen.max)
  h.ouderen.grens = idx(h.ouderen.grens)
  h.ouderen.alleenstaand = idx(h.ouderen.alleenstaand)
  h.jonggehandicapt = idx(h.jonggehandicapt)

  // Ondernemer (vaste wettelijke bedragen zoals zelfstandigenaftrek, startersaftrek en stakingsaftrek indexeren niet)
  const o = p.ondernemer.waarde
  o.soAftrek.basis = idx(o.soAftrek.basis)
  o.soAftrek.starters = idx(o.soAftrek.starters)
  o.beperktAftrekbaar.drempel = idx100(o.beperktAftrekbaar.drempel)
  const k = o.kia
  k.ondergrens = idx100(k.ondergrens)
  k.pctTot = idx(k.pctTot)
  k.vastBedrag = r(k.pct * k.pctTot)
  k.vastTot = idx(k.vastTot)
  k.nulBoven = r(k.vastTot + k.vastBedrag / k.afbouwPct)
  o.desinvestering.drempel = idx100(o.desinvestering.drempel)

  // Inkomensvoorziening
  const iv = p.inkomensvoorziening.waarde
  const l = iv.lijfrente
  l.maxReserveringsruimte = idx(l.maxReserveringsruimte)
  if (l.regime === 'wtp') l.maxJaarruimte = r(l.pct * (l.inkomensgrens - l.franchise))
  handmatig.push('inkomensvoorziening.lijfrente.franchise: volgt AOW, handmatig (AOW-uitkering gehuwden × 100/75)')
  handmatig.push('inkomensvoorziening.lijfrente.inkomensgrens: controleer bevriezing of indexatie')
  iv.stakingslijfrente = { hoog: idx(iv.stakingslijfrente.hoog), midden: idx(iv.stakingslijfrente.midden), laag: idx(iv.stakingslijfrente.laag) }
  iv.uitkering.afkoopKleineLijfrente = idx(iv.uitkering.afkoopKleineLijfrente)
  iv.uitkering.afkoopAOMax = idx(iv.uitkering.afkoopAOMax)
  iv.uitkering.tijdelijkeOudedagslijfrenteMax = idx(iv.uitkering.tijdelijkeOudedagslijfrenteMax)

  // Eigen woning: grens hoogste band (afgerond op 10.000) en vast bedrag
  const f = p.eigenWoning.waarde.forfait
  if (f.length >= 2) {
    const v = f[f.length - 2]
    v.tot = Math.round(((v.tot as number) * factor) / 10000) * 10000
    f[f.length - 1].vast = r(v.pct * v.tot)
  }
  p.eigenWoning.waarde.kewVrijstelling = Math.round((p.eigenWoning.waarde.kewVrijstelling * factor) / 500) * 500
  p.eigenWoning.waarde.hillenPct = Math.max(0, Math.round((p.eigenWoning.waarde.hillenPct - p.eigenWoning.waarde.hillenStap) * 1e5) / 1e5)

  // Box 2
  const b2 = p.box2.waarde.schijven
  if (b2.length >= 2 && b2[0].tot !== null) b2[0].tot = idx(b2[0].tot)
  handmatig.push('box2.gebruikelijkLoonNorm: volgt de Nieuwsbrief Loonheffingen')

  // Box 3
  const b3 = p.box3.waarde
  b3.heffingsvrijVermogen = idx(b3.heffingsvrijVermogen)
  b3.schuldendrempel = idx100(b3.schuldendrempel)
  b3.vrijstellingen.contant = idx(b3.vrijstellingen.contant)
  b3.vrijstellingen.uitvaart = idx(b3.vrijstellingen.uitvaart)
  b3.vrijstellingen.groen = idx(b3.vrijstellingen.groen)
  handmatig.push('box3.forfaitBank / forfaitSchulden / forfaitOverig: volgen de Belastingdienst (september en februari)')

  // PGA
  const z = p.pga.waarde.zorgkosten
  z.drempelMinPP = idx(z.drempelMinPP)
  z.drempelMinTotInkomen = idx(z.drempelMinTotInkomen)
  z.grensHoog = idx(z.grensHoog)
  z.vastHoog = r(z.pctLaag * z.grensHoog)
  z.verhogingTotInkomen = p.box1.waarde.schijf1TotGeborenVoor1946

  // Loon: reisaftrek
  const ra = p.loon.waarde.reisaftrek
  for (const rij of ra.tabel) rij.bedrag = idx(rij.bedrag)
  ra.max = ra.tabel[ra.tabel.length - 1].bedrag

  // Toeslagen: alleen kinderbijslag naar het nieuwe jaar zetten; de rest wacht op SZW/VWS
  const kb = p.toeslagen.waarde.kinderbijslag
  const eigenKb = (kinderbijslagData as Record<string, unknown>)[String(jaar)] as typeof kb | undefined
  p.toeslagen.waarde.kinderbijslag = eigenKb ?? [{ ...kb[kb.length - 1], vanaf: `${jaar}-01-01` }]
  handmatig.push('toeslagen: KOT-tabel, uurprijzen, KGB, zorgtoeslag en vermogensgrens wachten op het KOT-besluit en de SZW/VWS-begroting')

  // Schenken
  const sch = p.schenken.waarde
  p.schenken.waarde = { kindJaarlijks: idx(sch.kindJaarlijks), kindEenmalig: idx(sch.kindEenmalig), kindStudie: idx(sch.kindStudie), overig: idx(sch.overig) }

  // Overig: aanslaggrens met de volledige tcf
  p.overig.waarde.aanslaggrens = r(p.overig.waarde.aanslaggrens * tcf)

  // Status: alles geschat
  for (const naam of BLOK_NAMEN) {
    const blok = p[naam] as { status: string; veldStatus?: unknown; veldBron?: unknown; bron?: unknown; toelichting?: string }
    blok.status = 'geschat'
    delete blok.veldStatus
    delete blok.veldBron
    delete blok.bron
    blok.toelichting = `Afgeleid van ${b.jaar} met tax-derive (status geschat).`
  }
  p.status = 'geschat'
  return { p, handmatig }
}

// ---------------------------------------------------------------------------
// Serialisatie naar een TypeScript-module
// ---------------------------------------------------------------------------

class Code {
  constructor(public code: string) {}
}

const gelijk = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sleutel = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`)

function ts(x: unknown, inspring = 0): string {
  const pad = '  '.repeat(inspring)
  const pad1 = '  '.repeat(inspring + 1)
  if (x instanceof Code) return x.code
  if (x === null) return 'null'
  if (x === undefined) return 'undefined'
  if (typeof x === 'number') return Number.isFinite(x) ? String(x) : x > 0 ? 'Number.POSITIVE_INFINITY' : 'Number.NEGATIVE_INFINITY'
  if (typeof x === 'string') return `'${x.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof x === 'boolean') return String(x)
  if (Array.isArray(x)) {
    if (x.length === 0) return '[]'
    const kort = x.map((v) => ts(v, inspring + 1))
    const opEenRegel = `[${kort.join(', ')}]`
    if (opEenRegel.length + pad.length < 110 && !opEenRegel.includes('\n')) return opEenRegel
    return `[\n${kort.map((v) => pad1 + v).join(',\n')},\n${pad}]`
  }
  if (typeof x === 'object') {
    const regels = Object.entries(x as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && typeof v !== 'function')
      .map(([k, v]) => `${sleutel(k)}: ${ts(v, inspring + 1)}`)
    if (regels.length === 0) return '{}'
    const opEenRegel = `{ ${regels.join(', ')} }`
    if (opEenRegel.length + pad.length < 110 && !opEenRegel.includes('\n')) return opEenRegel
    return `{\n${regels.map((v) => pad1 + v).join(',\n')},\n${pad}}`
  }
  return String(x)
}

export function moduleTekst(p: TaxYearParams, handmatig: string[], basisJaar: number): string {
  const imports = ["import type { TaxYearParams } from '../types'"]
  const o = p.ondernemer.waarde.auto
  const uit: Record<string, unknown> = JSON.parse(JSON.stringify(p, (_k, v) => (v === Number.POSITIVE_INFINITY ? '__INF__' : v)))
  const zetInf = (x: unknown): unknown => {
    if (x === '__INF__') return Number.POSITIVE_INFINITY
    if (Array.isArray(x)) return x.map(zetInf)
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, zetInf(v)]))
    return x
  }
  const obj = zetInf(uit) as Record<string, any>
  obj.varianten = []

  if (gelijk(o.bijtellingNulEmissiePerToelatingsjaar, BIJTELLING_NUL_EMISSIE)) {
    imports.push("import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'")
    obj.ondernemer.waarde.auto.bijtellingNulEmissiePerToelatingsjaar = new Code('BIJTELLING_NUL_EMISSIE')
  }
  const kbData = kinderbijslagData as Record<string, unknown>
  if (kbData[String(p.jaar)] && gelijk(kbData[String(p.jaar)], p.toeslagen.waarde.kinderbijslag)) {
    imports.push("import kinderbijslag from './data/kinderbijslag.json'")
    obj.toeslagen.waarde.kinderbijslag = new Code(`kinderbijslag['${p.jaar}']`)
  }
  for (const [kotJaar, bestand] of Object.entries(KOT_BESTANDEN)) {
    if (gelijk(bestand.rijen, p.toeslagen.waarde.kot.tabel)) {
      imports.push(`import kotTabel from './data/kot-tabel-${kotJaar}.json'`)
      obj.toeslagen.waarde.kot.tabel = new Code('kotTabel.rijen')
      break
    }
  }

  const kop = [
    '/**',
    ` * Belastingjaar ${p.jaar}: CONCEPT, afgeleid van ${basisJaar} met scripts/tax-derive.ts.`,
    ` * Indexatie: tcf ${p.indexatie.tcf}, toegepast deel ${p.indexatie.toegepastDeel}, schijf 1-factor ${p.indexatie.schijf1Factor}, beleidsmatig toptariefgrens ${p.indexatie.beleidsmatigToptariefgrens}.`,
    ' * Alle blokken staan op geschat. Handmatig nalopen:',
    ...handmatig.map((h) => ` *  - ${h}`),
    ' */',
  ]
  const naam = `params${p.jaar}`
  return `${imports.join('\n')}\n\n${kop.join('\n')}\n\nconst ${naam}: TaxYearParams = ${ts(obj)}\n\nexport default ${naam}\n`
}

// ---------------------------------------------------------------------------
// Uitvoeren
// ---------------------------------------------------------------------------

const { p, handmatig } = deriveer(basis)
const problemen = alleenFouten(validateYear(p))
const tekst = moduleTekst(p, handmatig, basisJaar)

if (process.argv.includes('--write')) {
  const hier = dirname(fileURLToPath(import.meta.url))
  const doel = join(hier, '..', 'lib', 'tax', 'years', `${jaar}.draft.ts`)
  if (existsSync(doel)) {
    console.error(`${doel} bestaat al; niets geschreven.`)
    process.exit(1)
  }
  writeFileSync(doel, tekst)
  console.log(`Geschreven: ${doel}`)
} else {
  process.stdout.write(tekst)
}
if (problemen.length > 0) {
  console.error(`\nLet op, validatie van het skelet meldt ${problemen.length} punt(en):`)
  for (const x of problemen) console.error(`  - ${x}`)
}
