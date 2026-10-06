/**
 * Interne consistentiecontrole van een jaarmodule (en van elke variant).
 *
 * validateYear geeft een lijst met problemen terug; een lege lijst betekent dat het jaar
 * consistent is. Regels die alleen een waarschuwing zijn (bijvoorbeeld een KOT-tabel die
 * als onvolledig is gemarkeerd) beginnen met WAARSCHUWING_PREFIX, zodat tests en het
 * diff-script ze kunnen onderscheiden van echte fouten.
 *
 * De controles leggen geen fiscale getallen vast: ze vergelijken de parameters van een
 * jaar onderling (afgeleide nulpunten, aansluitende trajecten, oplopende grenzen).
 */
import type { ArbeidskortingParams, KotTabelRij, Status, TaxYearParams } from '../types'
import { BLOK_NAMEN } from '../types'
import kot2021 from './data/kot-tabel-2021.json'
import kot2022 from './data/kot-tabel-2022.json'
import kot2023 from './data/kot-tabel-2023.json'
import kot2024 from './data/kot-tabel-2024.json'
import kot2025 from './data/kot-tabel-2025.json'
import kot2026 from './data/kot-tabel-2026.json'
import kot2027 from './data/kot-tabel-2027.json'

export const WAARSCHUWING_PREFIX = 'WAARSCHUWING: '

/** Toleranties van de afgeleide controles (afrondingsruimte in hele euro's). */
export const TOLERANTIE = {
  arbeidskorting: 2,
  ahkNulpunt: 150,
  jaarruimte: 2,
  forfaitVast: 2,
} as const

interface KotBestand {
  rijen: KotTabelRij[]
  _onvolledig?: boolean
  _bron?: string
}

/** KOT-tabellen per jaar met hun metadata (voor de vlag `_onvolledig`). */
export const KOT_BESTANDEN: Record<number, KotBestand> = {
  2021: kot2021 as KotBestand,
  2022: kot2022 as KotBestand,
  2023: kot2023 as KotBestand,
  2024: kot2024 as KotBestand,
  2025: kot2025 as KotBestand,
  2026: kot2026 as KotBestand,
  2027: kot2027 as KotBestand,
}

const STATUS_RANG: Record<Status, number> = { definitief: 4, rechtspraak: 3, voorlopig: 2, voorstel: 1, geschat: 0 }

function laagste(p: TaxYearParams): Status {
  let l: Status = 'definitief'
  for (const naam of BLOK_NAMEN) {
    const b = p[naam] as { status: Status; veldStatus?: Record<string, Status | undefined> }
    if (STATUS_RANG[b.status] < STATUS_RANG[l]) l = b.status
    for (const s of Object.values(b.veldStatus ?? {})) if (s && STATUS_RANG[s] < STATUS_RANG[l]) l = s
  }
  return l
}

/** Sleutels die een fractie (0..1) bevatten. */
const PCT_SLEUTEL = /(pct|Pct|pcts|tarief|Tarief|belastingDeel|toegepastDeel|aftrekbaarDeel|forfaitBank|forfaitOverig|forfaitSchulden|mkbWinstvrijstelling|dividendbelasting|bodemwaardeGebouwEigenGebruik|aowFactor|^aow$|^anw$|^wlz$)/
/** Uitzonderingen: verhogingspercentage boven 100% is wettelijk (113% bij AOW); pctTot is een bedrag. */
const PCT_UITZONDERING = new Set(['verhogingPctAow', 'pctTot'])

function controleerPercentages(pad: string, x: unknown, sleutel: string, fouten: string[]): void {
  if (typeof x === 'number') {
    if (PCT_SLEUTEL.test(sleutel) && !PCT_UITZONDERING.has(sleutel) && (x < 0 || x > 1 || Number.isNaN(x))) {
      fouten.push(`${pad}: percentage ${x} ligt buiten 0..1`)
    }
    return
  }
  if (Array.isArray(x)) {
    x.forEach((v, i) => controleerPercentages(`${pad}[${i}]`, v, PCT_SLEUTEL.test(sleutel) && typeof v === 'number' ? sleutel : '', fouten))
    return
  }
  if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) controleerPercentages(`${pad}.${k}`, v, k, fouten)
  }
}

function controleerArbeidskorting(pad: string, ak: ArbeidskortingParams, fouten: string[]): void {
  const t = ak.opbouw
  if (t.length === 0) {
    fouten.push(`${pad}.opbouw is leeg`)
    return
  }
  if (Math.abs(t[0].basis) > TOLERANTIE.arbeidskorting) fouten.push(`${pad}.opbouw[0].basis is ${t[0].basis}, verwacht 0`)
  let vorigeTot = 0
  for (let i = 0; i < t.length; i++) {
    if (t[i].tot <= vorigeTot) fouten.push(`${pad}.opbouw[${i}].tot (${t[i].tot}) is niet hoger dan het vorige traject (${vorigeTot})`)
    if (i > 0) {
      const breedte = t[i - 1].tot - (i > 1 ? t[i - 2].tot : 0)
      const verwacht = t[i - 1].basis + t[i - 1].pct * breedte
      if (Math.abs(verwacht - t[i].basis) > TOLERANTIE.arbeidskorting) {
        fouten.push(`${pad}.opbouw[${i}].basis is ${t[i].basis}, sluit niet aan op het vorige traject (${verwacht.toFixed(1)})`)
      }
    }
    vorigeTot = t[i].tot
  }
  const laatste = t[t.length - 1]
  const breedte = laatste.tot - (t.length > 1 ? t[t.length - 2].tot : 0)
  const eind = laatste.basis + laatste.pct * breedte
  if (Math.abs(eind - ak.max) > TOLERANTIE.arbeidskorting) {
    fouten.push(`${pad}.max is ${ak.max}, maar het laatste traject eindigt op ${eind.toFixed(1)}`)
  }
  if (ak.afbouwVanaf !== laatste.tot) fouten.push(`${pad}.afbouwVanaf (${ak.afbouwVanaf}) is niet gelijk aan de bovengrens van het laatste traject (${laatste.tot})`)
}

function controleerKot(jaar: number, tabel: KotTabelRij[], fouten: string[]): void {
  if (tabel.length === 0) {
    fouten.push('toeslagen.kot.tabel is leeg')
    return
  }
  let vorige = -Infinity
  tabel.forEach((r, i) => {
    const laatste = i === tabel.length - 1
    if (laatste && r.totInkomen !== null) fouten.push('toeslagen.kot.tabel: de laatste rij moet totInkomen null hebben')
    if (!laatste && r.totInkomen === null) fouten.push(`toeslagen.kot.tabel[${i}]: totInkomen null vóór de laatste rij`)
    if (r.totInkomen !== null) {
      if (r.totInkomen <= vorige) fouten.push(`toeslagen.kot.tabel[${i}]: totInkomen ${r.totInkomen} loopt niet op`)
      vorige = r.totInkomen
    }
    for (const k of ['pctKind1', 'pctKind2'] as const) {
      if (r[k] < 0 || r[k] > 1) fouten.push(`toeslagen.kot.tabel[${i}].${k} ${r[k]} ligt buiten 0..1`)
    }
  })
  const bestand = KOT_BESTANDEN[jaar]
  if (bestand?._onvolledig) fouten.push(`${WAARSCHUWING_PREFIX}KOT-tabel ${jaar} is gemarkeerd als onvolledig`)
}

/** Controleert één jaar (of variant); geeft een lijst met problemen terug. */
export function validateYear(p: TaxYearParams): string[] {
  const fouten: string[] = []
  const j = p.jaar

  // Box 1-schijven oplopend, laatste open.
  const s = p.box1.waarde.schijven
  s.forEach((sch, i) => {
    const laatste = i === s.length - 1
    if (laatste && sch.tot !== null) fouten.push('box1.schijven: de laatste schijf moet tot null hebben')
    if (!laatste && sch.tot === null) fouten.push(`box1.schijven[${i}]: tot null vóór de laatste schijf`)
    if (i > 0 && sch.tot !== null && s[i - 1].tot !== null && sch.tot <= (s[i - 1].tot as number)) fouten.push(`box1.schijven[${i}]: grens loopt niet op`)
    if (sch.belastingDeel > sch.tarief + 1e-9) fouten.push(`box1.schijven[${i}]: belastingdeel hoger dan het tarief`)
  })
  const premie = p.box1.waarde.premies.aow + p.box1.waarde.premies.anw + p.box1.waarde.premies.wlz
  if (s.length > 0 && Math.abs(s[0].tarief - s[0].belastingDeel - premie) > 1e-6) {
    fouten.push(`box1.schijven[0]: tarief ${s[0].tarief} is niet belastingdeel ${s[0].belastingDeel} plus premies ${premie.toFixed(4)}`)
  }

  // Box 2-schijven.
  const b2 = p.box2.waarde.schijven
  if (b2.length === 0 || b2[b2.length - 1].tot !== null) fouten.push('box2.schijven: de laatste schijf moet tot null hebben')

  // Percentages.
  for (const naam of BLOK_NAMEN) controleerPercentages(naam, p[naam].waarde, naam, fouten)

  // Arbeidskorting.
  controleerArbeidskorting('heffingskortingen.arbeid', p.heffingskortingen.waarde.arbeid, fouten)
  controleerArbeidskorting('heffingskortingen.arbeidAow', p.heffingskortingen.waarde.arbeidAow, fouten)

  // Algemene heffingskorting nul uiterlijk bij de toptariefgrens.
  const ahk = p.heffingskortingen.waarde.algemeen
  const toptariefgrens = s.length >= 2 ? s[s.length - 2].tot : null
  if (toptariefgrens !== null && ahk.afbouwPct > 0) {
    const nulpunt = ahk.afbouwVanaf + ahk.max / ahk.afbouwPct
    if (nulpunt > toptariefgrens + TOLERANTIE.ahkNulpunt) {
      fouten.push(`heffingskortingen.algemeen: nulpunt ${Math.round(nulpunt)} ligt boven de toptariefgrens ${toptariefgrens}`)
    }
  }

  // Lijfrente: maximum jaarruimte is afgeleid.
  const lr = p.inkomensvoorziening.waarde.lijfrente
  if (lr.regime === 'wtp') {
    const verwacht = lr.pct * (lr.inkomensgrens - lr.franchise)
    if (Math.abs(verwacht - lr.maxJaarruimte) > TOLERANTIE.jaarruimte) {
      fouten.push(`inkomensvoorziening.lijfrente.maxJaarruimte ${lr.maxJaarruimte} wijkt af van pct × (inkomensgrens − franchise) = ${verwacht.toFixed(1)}`)
    }
    if (lr.reserveringsruimtePctGrondslag !== null) fouten.push('inkomensvoorziening.lijfrente: reserveringsruimtePctGrondslag hoort null te zijn bij wtp')
  } else if (lr.reserveringsruimtePctGrondslag === null) {
    fouten.push('inkomensvoorziening.lijfrente: reserveringsruimtePctGrondslag ontbreekt bij pre-wtp')
  }

  // Eigenwoningforfait: banden oplopend, hoogste band met vast bedrag = vorig pct × ondergrens.
  const f = p.eigenWoning.waarde.forfait
  f.forEach((band, i) => {
    const laatste = i === f.length - 1
    if (laatste && band.tot !== null) fouten.push('eigenWoning.forfait: de hoogste band moet tot null hebben')
    if (!laatste && band.tot === null) fouten.push(`eigenWoning.forfait[${i}]: tot null vóór de hoogste band`)
    if (i > 0 && band.tot !== null && (f[i - 1].tot as number) >= band.tot) fouten.push(`eigenWoning.forfait[${i}]: grens loopt niet op`)
  })
  if (f.length >= 2) {
    const hoogste = f[f.length - 1]
    const vorige = f[f.length - 2]
    const verwacht = vorige.pct * (vorige.tot as number)
    if (hoogste.vast === undefined) fouten.push('eigenWoning.forfait: de hoogste band mist het vaste bedrag')
    else if (Math.abs(hoogste.vast - verwacht) > TOLERANTIE.forfaitVast) fouten.push(`eigenWoning.forfait: vast bedrag ${hoogste.vast} wijkt af van ${verwacht.toFixed(1)}`)
  }

  // Box 3.
  const b3 = p.box3.waarde
  if (b3.regime === 'schijven2017') {
    const sch = b3.schijven2017 ?? []
    if (sch.length === 0) fouten.push('box3.schijven2017 ontbreekt bij regime schijven2017')
    else if (sch[sch.length - 1].tot !== null) fouten.push('box3.schijven2017: de laatste schijf moet tot null hebben')
  }
  if (b3.regime === 'werkelijkRendement' && !b3.regime2028) fouten.push('box3.regime2028 ontbreekt bij regime werkelijkRendement')

  // KOT-tabel.
  controleerKot(j, p.toeslagen.waarde.kot.tabel, fouten)

  // KGB-afbouwpunten oplopend.
  const afb = p.toeslagen.waarde.kgb.afbouw
  for (let i = 1; i < afb.length; i++) {
    if (afb[i].vanafAlleen < afb[i - 1].vanafAlleen || afb[i].vanafPaar < afb[i - 1].vanafPaar) fouten.push(`toeslagen.kgb.afbouw[${i}]: afbouwpunten lopen niet op`)
  }

  // Kinderbijslag binnen het jaar.
  const kb = p.toeslagen.waarde.kinderbijslag
  if (kb.length === 0) fouten.push('toeslagen.kinderbijslag is leeg')
  kb.forEach((r, i) => {
    if (!r.vanaf.startsWith(`${j}-`)) fouten.push(`toeslagen.kinderbijslag[${i}].vanaf ${r.vanaf} valt niet in ${j}`)
    if (i > 0 && r.vanaf <= kb[i - 1].vanaf) fouten.push(`toeslagen.kinderbijslag[${i}]: datums lopen niet op`)
  })

  // Status en changelog.
  const l = laagste(p)
  if (p.status !== l) fouten.push(`status '${p.status}' is niet de laagste status van de blokken ('${l}')`)
  if (p.changelog.length === 0) fouten.push('changelog is leeg')
  else {
    const laatsteDatum = p.changelog.map((c) => c.datum).sort().at(-1) as string
    if (p.bijgewerkt < laatsteDatum) fouten.push(`bijgewerkt ${p.bijgewerkt} is ouder dan de laatste changelogregel ${laatsteDatum}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.bijgewerkt)) fouten.push(`bijgewerkt '${p.bijgewerkt}' is geen ISO-datum`)

  return fouten.map((x) => (x.startsWith(WAARSCHUWING_PREFIX) ? x : `${j}: ${x}`))
}

/** Alleen de echte fouten (zonder waarschuwingen). */
export const alleenFouten = (problemen: string[]): string[] => problemen.filter((x) => !x.startsWith(WAARSCHUWING_PREFIX))
