/**
 * Vereenvoudigde invoer van de publieke calculator en de vertaling naar het
 * contract van de rekenkern (HuishoudenInvoer).
 *
 * Geen fiscale getallen hier: drempels komen uit de jaarparameters. Het urencriterium is een vraag
 * (standaard ja) en gaat als `urencriteriumGehaald` naar de rekenkern, zonder uren.
 * De standaardwaarden zijn voorbeeldinvoer, geen fiscale regels.
 */
import type {
  HuishoudenInvoer,
  KindInvoer,
  OndernemingInvoer,
  PersoonId,
  PersoonInvoer,
  SchuldPositie,
  VermogensPositie,
} from '@/lib/tax/types'
import { BESCHIKBARE_JAREN, STANDAARD_JAAR, getJaar } from '@/lib/tax/years'

export type OpvangSoort = 'dagopvang' | 'bso' | 'gastouder'

export interface PersoonState {
  /** Geboortejaar (voor de AOW-toets en de leeftijd bij heffingskortingen). */
  geboortejaar: number
  heeftOnderneming: boolean
  omzet: number
  kosten: number
  /** Aantal maanden waarover omzet en kosten zijn ingevuld (1 tot en met 12). */
  maandenGewerkt: number
  urencriterium: boolean
  startjaar: number
  /** Totaal geïnvesteerd in bedrijfsmiddelen dit jaar (voor de KIA). */
  investeringen: number
  zakelijkeKmPrive: number
  loonAan: boolean
  loonBruto: number
  loonheffing: number
  lijfrente: number
  aov: number
  voorlopigeAanslag: { ib: number; zvw: number }
}

export interface KindState {
  geboortedatum: string
  opvang: { soort: OpvangSoort; urenPerMaand: number; uurtarief: number } | null
}

export interface CalculatorState {
  jaar: number
  variant?: string
  /** Toon de uitkomst ook voor het jaar erna. */
  vergelijk: boolean
  partner: boolean
  personen: { A: PersoonState; B: PersoonState }
  woning: { aan: boolean; woz: number; rente: number }
  vermogen: { bank: number; beleggingen: number; crypto: number; schulden: number }
  kinderen: KindState[]
  belastingpot: { saldo: number; maandenVerstreken: number }
}

export const PERSOON_IDS: readonly PersoonId[] = ['A', 'B']

/** Maximaal aantal kinderen in de publieke calculator. */
export const MAX_KINDEREN = 6

export function standaardPersoon(id: PersoonId): PersoonState {
  const a = id === 'A'
  return {
    geboortejaar: a ? 1985 : 1987,
    heeftOnderneming: a,
    omzet: a ? 90000 : 0,
    kosten: a ? 15000 : 0,
    maandenGewerkt: 12,
    // Standaard ja, ook voor de partner zodra die een onderneming aanzet.
    urencriterium: true,
    startjaar: 2015,
    investeringen: 0,
    zakelijkeKmPrive: 0,
    loonAan: false,
    loonBruto: 0,
    loonheffing: 0,
    lijfrente: 0,
    aov: 0,
    voorlopigeAanslag: { ib: 0, zvw: 0 },
  }
}

export function standaardKind(jaar: number): KindState {
  return { geboortedatum: `${jaar - 3}-03-01`, opvang: null }
}

export function standaardOpvang(): NonNullable<KindState['opvang']> {
  return { soort: 'dagopvang', urenPerMaand: 80, uurtarief: 10 }
}

export function standaardState(jaar: number = STANDAARD_JAAR, variant?: string): CalculatorState {
  return {
    jaar,
    variant: variant && variantBestaat(variant) ? variant : undefined,
    vergelijk: false,
    partner: false,
    personen: { A: standaardPersoon('A'), B: standaardPersoon('B') },
    woning: { aan: false, woz: 400000, rente: 8000 },
    vermogen: { bank: 0, beleggingen: 0, crypto: 0, schulden: 0 },
    kinderen: [],
    belastingpot: { saldo: 0, maandenVerstreken: 9 },
  }
}

/** De variant als die voor dit jaar bestaat, anders undefined. */
export function variantVoor(jaar: number, variant: string | undefined): string | undefined {
  if (!variant) return undefined
  try {
    return getJaar(jaar).varianten.some((v) => v.id === variant) ? variant : undefined
  } catch {
    return undefined
  }
}

/** Bestaat deze variant in een van de jaren? (De state onthoudt hem ook als het gekozen jaar hem niet heeft.) */
export function variantBestaat(variant: string): boolean {
  return BESCHIKBARE_JAREN().some((j) => variantVoor(j, variant) !== undefined)
}

export function jaarBestaat(jaar: number): boolean {
  return BESCHIKBARE_JAREN().includes(jaar)
}

// ---------------------------------------------------------------------------
// Vertaling naar de rekenkern
// ---------------------------------------------------------------------------

export interface Omrekening {
  persoon: PersoonId
  maanden: number
  omzet: number
  kosten: number
  omzetJaar: number
  kostenJaar: number
}

export interface InvoerMetNotities {
  invoer: HuishoudenInvoer
  /** Leesbare toelichtingen op aannames (bijv. omrekening naar een heel jaar). */
  notities: string[]
  omrekeningen: Omrekening[]
}

const eurTekst = (n: number) => `€ ${Math.round(n).toLocaleString('nl-NL')}`

/** Schaalt een bedrag over `maanden` naar een heel jaar. */
export function naarJaarbasis(bedrag: number, maanden: number): number {
  const m = Math.min(12, Math.max(1, Math.round(maanden)))
  return m >= 12 ? bedrag : Math.round((bedrag * 12) / m)
}

function onderneming(p: PersoonState, jaar: number): { o: OndernemingInvoer; omrekening: Omrekening | null } {
  const maanden = Math.min(12, Math.max(1, Math.round(p.maandenGewerkt)))
  const omzetJaar = naarJaarbasis(p.omzet, maanden)
  const kostenJaar = naarJaarbasis(p.kosten, maanden)
  const o: OndernemingInvoer = {
    naam: 'Onderneming',
    winstberekening: { soort: 'uitgesplitst', omzet: omzetJaar, kosten: kostenJaar },
    // De schakelaar is het antwoord op de vraag "voldoe je aan het urencriterium?"; uren vullen we niet in.
    uren: { onderneming: 0, urencriteriumGehaald: p.urencriterium },
    startjaar: Math.round(p.startjaar),
  }
  if (p.investeringen > 0) {
    o.investeringen = [{ omschrijving: 'Investeringen in bedrijfsmiddelen', datum: `${jaar}-07-01`, bedrag: Math.round(p.investeringen), regeling: 'kia' }]
  }
  if (p.zakelijkeKmPrive > 0) o.zakelijkeKmPrive = Math.round(p.zakelijkeKmPrive)
  return {
    o,
    omrekening: maanden < 12 ? { persoon: 'A', maanden, omzet: p.omzet, kosten: p.kosten, omzetJaar, kostenJaar } : null,
  }
}

function persoon(id: PersoonId, p: PersoonState, jaar: number): { invoer: PersoonInvoer; omrekening: Omrekening | null } {
  let omrekening: Omrekening | null = null
  const ondernemingen: OndernemingInvoer[] = []
  if (p.heeftOnderneming) {
    const r = onderneming(p, jaar)
    ondernemingen.push(r.o)
    if (r.omrekening) omrekening = { ...r.omrekening, persoon: id }
  }
  const invoer: PersoonInvoer = {
    id,
    geboortedatum: `${Math.round(p.geboortejaar)}-06-15`,
    ondernemingen,
    loon:
      p.loonAan && p.loonBruto > 0
        ? [{ omschrijving: 'Loon', soort: 'loon', bruto: Math.round(p.loonBruto), ingehoudenLoonheffing: Math.round(p.loonheffing), zvwBijdrageloon: Math.round(p.loonBruto) }]
        : [],
    inkomensvoorziening: { lijfrentePremies: Math.round(p.lijfrente), aovPremies: Math.round(p.aov) },
  }
  if (p.lijfrente > 0) {
    // De publieke calculator kent het inkomen van vorig jaar niet: neem aan dat het gelijk was aan dit jaar.
    const winst = ondernemingen.reduce((s, o) => s + (o.winstberekening.soort === 'uitgesplitst' ? o.winstberekening.omzet - o.winstberekening.kosten : o.winstberekening.saldo), 0)
    invoer.inkomensvoorziening.premiegrondslagInkomenVorigJaar = Math.max(0, winst + (p.loonAan ? Math.round(p.loonBruto) : 0))
  }
  if (p.voorlopigeAanslag.ib > 0) invoer.voorlopigeAanslagIB = Math.round(p.voorlopigeAanslag.ib)
  if (p.voorlopigeAanslag.zvw > 0) invoer.voorlopigeAanslagZvw = Math.round(p.voorlopigeAanslag.zvw)
  return { invoer, omrekening }
}

function vermogen(s: CalculatorState): { posities: VermogensPositie[]; schulden: SchuldPositie[] } {
  const v = s.vermogen
  const posities: VermogensPositie[] = []
  if (v.bank > 0) posities.push({ id: 'bank', omschrijving: 'Bank- en spaarrekeningen', categorie: 'bankNL', eigenaar: 'A', waardeBegin: Math.round(v.bank) })
  if (v.beleggingen > 0) posities.push({ id: 'beleggingen', omschrijving: 'Beleggingen', categorie: 'beleggingen', eigenaar: 'A', waardeBegin: Math.round(v.beleggingen) })
  if (v.crypto > 0) posities.push({ id: 'crypto', omschrijving: 'Crypto', categorie: 'crypto', eigenaar: 'A', waardeBegin: Math.round(v.crypto) })
  const schulden: SchuldPositie[] = v.schulden > 0 ? [{ id: 'schulden', omschrijving: 'Schulden', eigenaar: 'A', waardeBegin: Math.round(v.schulden) }] : []
  return { posities, schulden }
}

function kinderen(s: CalculatorState): KindInvoer[] {
  return s.kinderen.map((k, i) => {
    const kind: KindInvoer = { id: `kind-${i + 1}`, naam: `Kind ${i + 1}`, geboortedatum: k.geboortedatum }
    if (k.opvang && k.opvang.urenPerMaand > 0) {
      kind.opvang = [{ soort: k.opvang.soort, urenPerMaand: Math.round(k.opvang.urenPerMaand), uurtarief: k.opvang.uurtarief, maanden: 12 }]
    }
    return kind
  })
}

export function naarInvoerMetNotities(s: CalculatorState, jaar: number = s.jaar): InvoerMetNotities {
  const ids: PersoonId[] = s.partner ? ['A', 'B'] : ['A']
  const personen: PersoonInvoer[] = []
  const omrekeningen: Omrekening[] = []
  for (const id of ids) {
    const r = persoon(id, s.personen[id], jaar)
    personen.push(r.invoer)
    if (r.omrekening) omrekeningen.push(r.omrekening)
  }

  const invoer: HuishoudenInvoer = {
    jaar,
    personen,
    fiscaalPartner: s.partner,
    kinderen: kinderen(s),
    box3: vermogen(s),
    verdeling: s.partner ? 'optimaal' : { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
  }
  const variant = variantVoor(jaar, s.variant)
  if (variant) invoer.variant = variant
  if (s.woning.aan && s.woning.woz > 0) invoer.eigenWoning = { woz: Math.round(s.woning.woz), rente: Math.round(s.woning.rente) }

  const notities: string[] = omrekeningen.map((o) => {
    const wie = s.partner ? (o.persoon === 'A' ? 'Voor partner A: ' : 'Voor partner B: ') : ''
    const maandTekst = o.maanden === 1 ? '1 maand' : `${o.maanden} maanden`
    return `${wie}omzet en kosten gaan over ${maandTekst}. We rekenen ze om naar een heel jaar: omzet ${eurTekst(o.omzet)} × 12 / ${o.maanden} = ${eurTekst(o.omzetJaar)}, kosten ${eurTekst(o.kosten)} × 12 / ${o.maanden} = ${eurTekst(o.kostenJaar)}.`
  })
  if (ids.some((id) => s.personen[id].lijfrente > 0)) {
    notities.push('Voor de jaarruimte gaan we ervan uit dat je inkomen vorig jaar even hoog was als dit jaar. Wijkt dat af, reken je jaarruimte dan apart uit.')
  }
  return { invoer, notities, omrekeningen }
}

export function naarInvoer(s: CalculatorState, jaar: number = s.jaar): HuishoudenInvoer {
  return naarInvoerMetNotities(s, jaar).invoer
}

// ---------------------------------------------------------------------------
// Delen via de URL en bewaren in de browser
// ---------------------------------------------------------------------------

export const STATE_VERSIE = 1
export const OPSLAG_SLEUTEL = 'ibcalculator:state:v1'

function base64urlEncode(tekst: string): string {
  const bytes = new TextEncoder().encode(tekst)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeState(s: CalculatorState): string {
  return base64urlEncode(JSON.stringify({ v: STATE_VERSIE, s }))
}

type Ruw = Record<string, unknown>
const isObj = (x: unknown): x is Ruw => typeof x === 'object' && x !== null && !Array.isArray(x)

function getal(x: unknown, standaard: number, min: number, max: number, heel = true): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return standaard
  const n = heel ? Math.round(x) : Math.round(x * 100) / 100
  return Math.min(max, Math.max(min, n))
}
const bool = (x: unknown, standaard: boolean): boolean => (typeof x === 'boolean' ? x : standaard)
const BEDRAG_MAX = 100_000_000

function leesPersoon(x: unknown, id: PersoonId): PersoonState {
  const d = standaardPersoon(id)
  if (!isObj(x)) return d
  const va = isObj(x.voorlopigeAanslag) ? x.voorlopigeAanslag : {}
  return {
    geboortejaar: getal(x.geboortejaar, d.geboortejaar, 1900, 2030),
    heeftOnderneming: bool(x.heeftOnderneming, d.heeftOnderneming),
    omzet: getal(x.omzet, d.omzet, 0, BEDRAG_MAX),
    kosten: getal(x.kosten, d.kosten, 0, BEDRAG_MAX),
    maandenGewerkt: getal(x.maandenGewerkt, d.maandenGewerkt, 1, 12),
    urencriterium: bool(x.urencriterium, d.urencriterium),
    startjaar: getal(x.startjaar, d.startjaar, 1900, 2100),
    investeringen: getal(x.investeringen, d.investeringen, 0, BEDRAG_MAX),
    zakelijkeKmPrive: getal(x.zakelijkeKmPrive, d.zakelijkeKmPrive, 0, 1_000_000),
    loonAan: bool(x.loonAan, d.loonAan),
    loonBruto: getal(x.loonBruto, d.loonBruto, 0, BEDRAG_MAX),
    loonheffing: getal(x.loonheffing, d.loonheffing, 0, BEDRAG_MAX),
    lijfrente: getal(x.lijfrente, d.lijfrente, 0, BEDRAG_MAX),
    aov: getal(x.aov, d.aov, 0, BEDRAG_MAX),
    voorlopigeAanslag: { ib: getal(va.ib, 0, 0, BEDRAG_MAX), zvw: getal(va.zvw, 0, 0, BEDRAG_MAX) },
  }
}

const OPVANG_SOORTEN: readonly OpvangSoort[] = ['dagopvang', 'bso', 'gastouder']
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

function leesKind(x: unknown, jaar: number): KindState | null {
  if (!isObj(x)) return null
  const d = standaardKind(jaar)
  const geboortedatum = typeof x.geboortedatum === 'string' && ISO_DATUM.test(x.geboortedatum) ? x.geboortedatum : d.geboortedatum
  let opvang: KindState['opvang'] = null
  if (isObj(x.opvang)) {
    const o = x.opvang
    const s = standaardOpvang()
    opvang = {
      soort: OPVANG_SOORTEN.includes(o.soort as OpvangSoort) ? (o.soort as OpvangSoort) : s.soort,
      urenPerMaand: getal(o.urenPerMaand, s.urenPerMaand, 0, 744),
      uurtarief: getal(o.uurtarief, s.uurtarief, 0, 1000, false),
    }
  }
  return { geboortedatum, opvang }
}

/**
 * Maakt van willekeurige (oude, onvolledige of gemanipuleerde) data een geldige state.
 * Ontbrekende of ongeldige velden krijgen de standaardwaarde.
 */
export function normaliseerState(x: unknown, standaardJaar: number = STANDAARD_JAAR): CalculatorState {
  const ruw = isObj(x) ? x : {}
  const jaar = typeof ruw.jaar === 'number' && jaarBestaat(ruw.jaar) ? ruw.jaar : standaardJaar
  const d = standaardState(jaar)
  const personen = isObj(ruw.personen) ? ruw.personen : {}
  const woning = isObj(ruw.woning) ? ruw.woning : {}
  const vermogen = isObj(ruw.vermogen) ? ruw.vermogen : {}
  const pot = isObj(ruw.belastingpot) ? ruw.belastingpot : {}
  const kinderen = Array.isArray(ruw.kinderen)
    ? ruw.kinderen.map((k) => leesKind(k, jaar)).filter((k): k is KindState => k !== null).slice(0, MAX_KINDEREN)
    : []
  return {
    jaar,
    variant: typeof ruw.variant === 'string' && variantBestaat(ruw.variant) ? ruw.variant : undefined,
    vergelijk: bool(ruw.vergelijk, d.vergelijk),
    partner: bool(ruw.partner, d.partner),
    personen: { A: leesPersoon(personen.A, 'A'), B: leesPersoon(personen.B, 'B') },
    woning: {
      aan: bool(woning.aan, d.woning.aan),
      woz: getal(woning.woz, d.woning.woz, 0, BEDRAG_MAX),
      rente: getal(woning.rente, d.woning.rente, 0, BEDRAG_MAX),
    },
    vermogen: {
      bank: getal(vermogen.bank, 0, 0, BEDRAG_MAX),
      beleggingen: getal(vermogen.beleggingen, 0, 0, BEDRAG_MAX),
      crypto: getal(vermogen.crypto, 0, 0, BEDRAG_MAX),
      schulden: getal(vermogen.schulden, 0, 0, BEDRAG_MAX),
    },
    kinderen,
    belastingpot: {
      saldo: getal(pot.saldo, d.belastingpot.saldo, 0, BEDRAG_MAX),
      maandenVerstreken: getal(pot.maandenVerstreken, d.belastingpot.maandenVerstreken, 0, 12),
    },
  }
}

/** Leest een gedeelde state uit ?s=. Geeft null bij onleesbare of te nieuwe data. */
export function decodeState(code: string | null | undefined): CalculatorState | null {
  if (!code || code.length > 20000) return null
  try {
    const data: unknown = JSON.parse(base64urlDecode(code))
    if (!isObj(data)) return null
    const versie = typeof data.v === 'number' ? data.v : 1
    if (versie > STATE_VERSIE) return null
    return normaliseerState(data.s)
  } catch {
    return null
  }
}

export function bewaarState(s: CalculatorState): void {
  try {
    window.localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify({ v: STATE_VERSIE, s }))
  } catch {
    // Opslag niet beschikbaar (privévenster, geblokkeerd); de calculator werkt gewoon door.
  }
}

export function laadState(): CalculatorState | null {
  try {
    const ruw = window.localStorage.getItem(OPSLAG_SLEUTEL)
    if (!ruw) return null
    const data: unknown = JSON.parse(ruw)
    if (!isObj(data) || (typeof data.v === 'number' && data.v > STATE_VERSIE)) return null
    return normaliseerState(data.s)
  } catch {
    return null
  }
}

export function wisState(): void {
  try {
    window.localStorage.removeItem(OPSLAG_SLEUTEL)
  } catch {
    // negeren
  }
}
