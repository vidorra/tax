/**
 * Jaarrekening van een onderneming in het dossier (OndernemingInvoer.jaarrekening): de bekende
 * balansposten en rubrieken met hun labels, de totalen en de controles die de invoer en het rapport
 * (hoofdstuk 5) delen. Puur: geen React, geen I/O, dus ook in de browser te gebruiken.
 *
 * Het ondernemingsvermogen is geen invoerveld. Het is wat overblijft van de activa na aftrek van het
 * vreemd vermogen (voorzieningen en schulden); de fiscale oudedagsreserve is een deel daarvan. Zo sluit
 * de balans altijd. Of de cijfers kloppen, blijkt uit de vergelijking met de rest van het dossier: het
 * ondernemingsvermogen aan het einde van het jaar, de kapitaalsvergelijking tegen het saldo van de
 * winstberekening en de rubrieken van de winst-en-verliesrekening tegen datzelfde saldo.
 *
 * De engine rekent niet met deze gegevens; de belastinguitkomst verandert er niet door.
 */
import type { BalansPost, BalansStand, JaarrekeningInvoer, WvRubriek } from '@/lib/tax/types'

/** Activa, deel van het ondernemingsvermogen (oudedagsreserve) of vreemd vermogen. */
export type BalansKant = 'activa' | 'vermogen' | 'vreemd'

export interface BalansPostInfo {
  label: string
  kant: BalansKant
  /** Groep zoals de fiscale vermogensopstelling die toont (5.2). */
  groep: string
}

/** Alle balansposten in de volgorde van de vermogensopstelling. Record, zodat een nieuwe post hier niet vergeten wordt. */
export const BALANS_POST_INFO: Readonly<Record<BalansPost, BalansPostInfo>> = {
  materieleVasteActiva: { label: 'Materiële vaste activa', kant: 'activa', groep: 'Materiële vaste activa' },
  voorraden: { label: 'Voorraden en onderhanden werk', kant: 'activa', groep: 'Voorraden' },
  handelsdebiteuren: { label: 'Vorderingen op handelsdebiteuren', kant: 'activa', groep: 'Vorderingen' },
  overigeVorderingen: { label: 'Overige vorderingen', kant: 'activa', groep: 'Vorderingen' },
  liquideMiddelen: { label: 'Liquide middelen', kant: 'activa', groep: 'Liquide middelen' },
  oudedagsreserve: { label: 'Fiscale oudedagsreserve', kant: 'vermogen', groep: 'Ondernemingsvermogen' },
  voorzieningen: { label: 'Voorzieningen', kant: 'vreemd', groep: 'Voorzieningen' },
  langlopendeSchulden: { label: 'Langlopende schulden', kant: 'vreemd', groep: 'Langlopende schulden' },
  crediteuren: { label: 'Schulden aan leveranciers en handelskredieten', kant: 'vreemd', groep: 'Kortlopende schulden' },
  omzetbelasting: { label: 'Schuld omzetbelasting', kant: 'vreemd', groep: 'Kortlopende schulden' },
  overigeKortlopendeSchulden: { label: 'Overige kortlopende schulden', kant: 'vreemd', groep: 'Kortlopende schulden' },
}

export const BALANS_POSTEN = Object.keys(BALANS_POST_INFO) as BalansPost[]

export const isBalansPost = (x: unknown): x is BalansPost => typeof x === 'string' && Object.prototype.hasOwnProperty.call(BALANS_POST_INFO, x)

/** Opbrengst en baat verhogen het saldo, kosten en last verlagen het. Alle bedragen staan positief in de invoer. */
export type WvSoort = 'opbrengst' | 'kosten' | 'baat' | 'last'

export interface WvRubriekInfo {
  label: string
  soort: WvSoort
}

/** Rubrieken van de fiscale winstberekening (5.3), in de volgorde van het rapport. */
export const WV_RUBRIEK_INFO: Readonly<Record<WvRubriek, WvRubriekInfo>> = {
  omzet: { label: 'Netto-omzet', soort: 'opbrengst' },
  onderhandenWerk: { label: 'Wijziging onderhanden werk', soort: 'opbrengst' },
  inkoop: { label: 'Inkoop en uitbesteed werk', soort: 'kosten' },
  afschrijvingen: { label: 'Afschrijvingen', soort: 'kosten' },
  personeel: { label: 'Personeelskosten', soort: 'kosten' },
  auto: { label: 'Auto- en transportkosten', soort: 'kosten' },
  huisvesting: { label: 'Huisvestingskosten', soort: 'kosten' },
  verkoop: { label: 'Verkoopkosten', soort: 'kosten' },
  kantoor: { label: 'Kantoorkosten', soort: 'kosten' },
  beperktAftrekbaar: { label: 'Beperkt aftrekbare kosten', soort: 'kosten' },
  overig: { label: 'Overige kosten', soort: 'kosten' },
  financieleBaten: { label: 'Financiële baten', soort: 'baat' },
  financieleLasten: { label: 'Financiële lasten', soort: 'last' },
}

export const WV_RUBRIEKEN = Object.keys(WV_RUBRIEK_INFO) as WvRubriek[]

export const isWvRubriek = (x: unknown): x is WvRubriek => typeof x === 'string' && Object.prototype.hasOwnProperty.call(WV_RUBRIEK_INFO, x)

/** Grenzen voor de validatie: ruim boven wat een eenmanszaak nodig heeft. */
export const JAARREKENING_GRENZEN = {
  /** Elk bedrag ligt binnen ± dit bedrag (een miljard euro). */
  bedrag: 1e9,
  specificaties: 50,
  onttrekkingen: 50,
  stortingen: 50,
  omschrijving: 200,
  omschrijvingActiviteiten: 1000,
} as const

/** Verschillen kleiner dan een euro tellen als aansluitend (afronding per post). */
export const AANSLUIT_TOLERANTIE = 1

export const sluitAan = (a: number, b: number): boolean => Math.abs(a - b) < AANSLUIT_TOLERANTIE

const waarde = (s: BalansStand | undefined, post: BalansPost): number => s?.[post] ?? 0

/** true als op deze peildatum minstens één post is ingevuld (0 telt als ingevuld). */
export function heeftBalans(s: BalansStand | undefined): boolean {
  return !!s && BALANS_POSTEN.some((p) => typeof s[p] === 'number')
}

export interface BalansTotalen {
  activa: number
  /** Voorzieningen, langlopende en kortlopende schulden. */
  vreemdVermogen: number
  kortlopendeSchulden: number
  /** Activa min vreemd vermogen, inclusief de oudedagsreserve. */
  ondernemingsvermogen: number
  oudedagsreserve: number
  /** Ondernemingsvermogen exclusief fiscale reserves (5.2 regel 17). */
  exclusiefOudedagsreserve: number
}

export function balansTotalen(s: BalansStand | undefined): BalansTotalen {
  let activa = 0
  let vreemdVermogen = 0
  let kortlopendeSchulden = 0
  for (const post of BALANS_POSTEN) {
    const info = BALANS_POST_INFO[post]
    if (info.kant === 'activa') activa += waarde(s, post)
    else if (info.kant === 'vreemd') {
      vreemdVermogen += waarde(s, post)
      if (info.groep === 'Kortlopende schulden') kortlopendeSchulden += waarde(s, post)
    }
  }
  const ondernemingsvermogen = activa - vreemdVermogen
  const oudedagsreserve = waarde(s, 'oudedagsreserve')
  return { activa, vreemdVermogen, kortlopendeSchulden, ondernemingsvermogen, oudedagsreserve, exclusiefOudedagsreserve: ondernemingsvermogen - oudedagsreserve }
}

export function somBedragen(lijst: ReadonlyArray<{ bedrag: number }> | undefined): number {
  return (lijst ?? []).reduce((s, x) => s + (Number.isFinite(x.bedrag) ? x.bedrag : 0), 0)
}

export interface WvTotalen {
  opbrengsten: number
  kosten: number
  /** Baten min lasten. */
  financieel: number
  /** Opbrengsten min kosten plus het financiële saldo: hoort gelijk te zijn aan het saldo van de winstberekening. */
  saldo: number
}

export function wvTotalen(rubrieken: JaarrekeningInvoer['winstEnVerlies']): WvTotalen {
  const t: WvTotalen = { opbrengsten: 0, kosten: 0, financieel: 0, saldo: 0 }
  for (const r of rubrieken ?? []) {
    const info = WV_RUBRIEK_INFO[r.rubriek]
    if (!info || !Number.isFinite(r.bedrag)) continue
    if (info.soort === 'opbrengst') t.opbrengsten += r.bedrag
    else if (info.soort === 'kosten') t.kosten += r.bedrag
    else if (info.soort === 'baat') t.financieel += r.bedrag
    else t.financieel -= r.bedrag
  }
  t.saldo = t.opbrengsten - t.kosten + t.financieel
  return t
}

export interface Kapitaalsvergelijking {
  eindvermogen: number
  beginvermogen: number
  onttrekkingen: number
  stortingen: number
  /** Eind min begin plus onttrekkingen min stortingen: hoort gelijk te zijn aan het saldo van de winstberekening. */
  winst: number
}

/** De kapitaalsvergelijking (5.1.1); null zolang de balans aan het begin of aan het einde ontbreekt. */
export function kapitaalsvergelijking(j: JaarrekeningInvoer | undefined): Kapitaalsvergelijking | null {
  if (!j || !heeftBalans(j.begin) || !heeftBalans(j.eind)) return null
  const eindvermogen = balansTotalen(j.eind).ondernemingsvermogen
  const beginvermogen = balansTotalen(j.begin).ondernemingsvermogen
  const onttrekkingen = somBedragen(j.onttrekkingen)
  const stortingen = somBedragen(j.stortingen)
  return { eindvermogen, beginvermogen, onttrekkingen, stortingen, winst: eindvermogen - beginvermogen + onttrekkingen - stortingen }
}

export interface SpecificatieVerschil {
  post: BalansPost
  peildatum: 'begin' | 'eind'
  specificatie: number
  balans: number
}

/** Posten waarvan de specificaties niet optellen tot het bedrag op de balans (alleen waar de balans is ingevuld). */
export function specificatieVerschillen(j: JaarrekeningInvoer | undefined): SpecificatieVerschil[] {
  const uit: SpecificatieVerschil[] = []
  if (!j?.specificaties?.length) return uit
  for (const post of BALANS_POSTEN) {
    const regels = j.specificaties.filter((s) => s.post === post)
    if (regels.length === 0) continue
    for (const peildatum of ['begin', 'eind'] as const) {
      const balans = j[peildatum]?.[post]
      if (typeof balans !== 'number') continue
      const specificatie = regels.reduce((s, r) => s + (Number.isFinite(r[peildatum]) ? r[peildatum] : 0), 0)
      if (!sluitAan(specificatie, balans)) uit.push({ post, peildatum, specificatie, balans })
    }
  }
  return uit
}

function schoonStand(s: BalansStand | undefined): BalansStand | undefined {
  if (!s) return undefined
  const uit: BalansStand = {}
  for (const post of BALANS_POSTEN) if (typeof s[post] === 'number') uit[post] = s[post]
  return heeftBalans(uit) ? uit : undefined
}

/**
 * Haalt lege delen weg: een peildatum zonder posten, lege lijsten en een lege omschrijving. Leeg blijft
 * leeg (er komen geen nullen bij). Geeft undefined als er buiten de herkomst niets is ingevuld.
 */
export function schoonJaarrekening(j: JaarrekeningInvoer | undefined): JaarrekeningInvoer | undefined {
  if (!j) return undefined
  const uit: JaarrekeningInvoer = {}
  const begin = schoonStand(j.begin)
  const eind = schoonStand(j.eind)
  if (begin) uit.begin = begin
  if (eind) uit.eind = eind
  if (j.specificaties?.length) uit.specificaties = j.specificaties
  if (j.mva) uit.mva = j.mva
  if (j.onttrekkingen?.length) uit.onttrekkingen = j.onttrekkingen
  if (j.stortingen?.length) uit.stortingen = j.stortingen
  if (j.winstEnVerlies?.length) uit.winstEnVerlies = j.winstEnVerlies
  if (j.omschrijvingActiviteiten?.trim()) uit.omschrijvingActiviteiten = j.omschrijvingActiviteiten
  if (Object.keys(uit).length === 0) return undefined
  if (j.bron) uit.bron = j.bron
  return uit
}

/** Een nieuw jaar begint met de eindbalans van het vorige jaar; de rest van de jaarrekening hoort bij dat vorige jaar. */
export function jaarrekeningVoorNieuwJaar(j: JaarrekeningInvoer | undefined): JaarrekeningInvoer | undefined {
  const eind = schoonStand(j?.eind)
  return eind ? { begin: { ...eind } } : undefined
}
