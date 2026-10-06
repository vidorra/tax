/**
 * Jaarrekening uit Moneybird voor het fiscaal rapport (hoofdstuk 5): de balans per post op 31-12 van het
 * vorige jaar en van dit jaar, specificaties per grootboekrekening, aanschaf- en restwaarde van de vaste
 * activa, de privémutaties en de controles. Puur (geen fetch, geen klok). De winst- en verliesrekening in
 * rubrieken hangt af van de indeling van de gebruiker en staat daarom in indeling.ts.
 *
 * Indeling van een balansrekening, eerste treffer wint:
 *  1. RGS-code (taxonomy_item.code, RGS 3.x). Prefixen gecontroleerd tegen het RGS MKB-rekeningschema
 *     (boekhoudplaza.nl/cmm/rgs/decimaal_rekeningschema_rgs.php, RGS 3.8, geraadpleegd 4 oktober 2026):
 *       BEivFirFor                fiscale oudedagsreserve
 *       BEivKa[p2-5]Prs           privé-stortingen
 *       BEivKa[p2-5]Poc/Png/Pbe/Ppr/Pro  privé-onttrekkingen (contanten, natura, belastingen, premies, opnamen)
 *       BEiv (overig)             kapitaal en reserves: geen eigen post, deel van het ondernemingsvermogen
 *       BMva                      materiële vaste activa
 *       BIva, BVas                immateriële vaste activa en vastgoed: bij materiële vaste activa (benadering)
 *       BFvaOvrWaa                waarborgsommen (langlopend): overige vorderingen
 *       BFva (overig)             financiële vaste activa: overige vorderingen (benadering)
 *       BVrd, BPro                voorraden, onderhanden werk en onderhanden projecten
 *       BVorDeb                   vorderingen op handelsdebiteuren
 *       BVorVbkTvo, BVorVbkEob    terug te vorderen omzetbelasting: schuld omzetbelasting (negatief)
 *       BVor (overig)             overige vorderingen, overlopende activa, overige belastingvorderingen
 *       BEff                      effecten: overige vorderingen (benadering)
 *       BLim                      liquide middelen (ook kruisposten)
 *       BVrz                      voorzieningen
 *       BLas                      langlopende schulden
 *       BSchCre                   schulden aan leveranciers (crediteuren)
 *       BSchBepB*, BSchBepEob     omzetbelasting (per tarief, verlegd, te betalen, afdracht)
 *       BSch (overig)             overige kortlopende schulden (loonheffing, overlopende passiva, bank)
 *     Oudere codes uit eerdere versies van deze import tellen ook: BEivOdr (oudedagsreserve), BEivPrv
 *     (privé) en BVorOnw (onderhanden werk).
 *  2. Zonder bruikbare RGS-code: de soort van Moneybird (account_type, anders de sectie van de balans).
 *     Vaste activa, eigen vermogen, voorzieningen en schulden zijn daarmee eenduidig; de naam verfijnt
 *     (borg, oudedagsreserve, privé, crediteuren, btw). Vlottende activa alleen met een duidelijke naam
 *     (onderhanden werk, debiteuren, btw, borg, vooruitbetaald, bank, kas, spaarrekening).
 *  3. Anders: weglaten met een waarschuwing.
 *
 * Bedragen: Moneybird geeft credit-bedragen positief. Een rekening kan aan de andere kant staan dan zijn
 * post (een btw-vordering bij de omzetbelasting, een rood staande bank): het teken volgt de post.
 * Afronden op hele euro's gebeurt zo dat het rapport sluit: de activa op hun afgeronde som, het vreemd
 * vermogen zo dat activa min vreemd vermogen het afgeronde eigen vermogen is, de specificaties op hun post
 * en de privémutaties zo dat de kapitaalsvergelijking op de winst volgens de regels uitkomt. Dat alleen als
 * de onafgeronde cijfers al sluiten; anders gewoon afronden en een waarschuwing.
 */
import type { BalansPost, BalansStand, JaarrekeningInvoer, Waarschuwing } from '../tax/types'
import { bedragUit, type MbRuwBalans, type MbRuwRegelWaarde } from './client'
import { beperkLijst, MB_MAX_OMSCHRIJVING, normaliseer } from './indeling'
import type { MbJaarImport, MbPriveRegel } from './types'

/** Afronden op hele euro's, .5 van nul af (ook voor negatieve bedragen). */
export const rond = (x: number): number => Math.sign(x) * Math.round(Math.abs(x)) || 0

const fmt = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 })
export const euro = (n: number): string => `€ ${fmt.format(rond(n))}`

const cent = (x: number) => Math.round(x * 100) / 100
const som = (l: number[]) => l.reduce((s, x) => s + x, 0)
export const datumNl = (iso: string) => iso.split('-').reverse().join('-')

/** Maximaal aantal specificaties (gelijk aan JAARREKENING_GRENZEN.specificaties in lib/dossier/jaarrekening.ts). */
export const MB_MAX_SPECIFICATIES = 50

/**
 * Rondt bedragen af op hele euro's zodat de som precies `doel` is (grootste-restmethode). Is het verschil
 * groter dan één euro per bedrag, dan gewoon afronden en het restant bij het grootste bedrag.
 */
export function rondAfOpSom(waarden: number[], doel: number): number[] {
  if (waarden.length === 0) return []
  const w = waarden.map(cent)
  const basis = w.map(Math.floor)
  const k = doel - som(basis)
  if (k >= 0 && k <= w.length) {
    const volgorde = w.map((_, i) => i).sort((a, b) => w[b] - basis[b] - (w[a] - basis[a]) || Math.abs(w[b]) - Math.abs(w[a]) || a - b)
    const uit = [...basis]
    for (let j = 0; j < k; j++) uit[volgorde[j]] += 1
    return uit.map((x) => x || 0)
  }
  const gewoon = w.map(rond)
  let grootste = 0
  w.forEach((x, i) => {
    if (Math.abs(x) > Math.abs(w[grootste])) grootste = i
  })
  gewoon[grootste] += doel - som(gewoon)
  return gewoon.map((x) => x || 0)
}

// ---------------------------------------------------------------------------
// Balans van Moneybird plat maken
// ---------------------------------------------------------------------------

/** Eén grootboekrekening op de balans zoals Moneybird hem toont. */
export interface BalansBlad {
  id: string
  /** Bedrag zoals in het rapport: debet-kant en credit-kant elk positief bij hun gewone saldo. */
  waarde: number
  kant: 'debet' | 'credit'
  /** Sectie in het rapport (current_assets, equity, ...): de soort als de rekening onbekend is. */
  sectie: string
}

export interface BalansMoment {
  bladen: BalansBlad[]
  /** Resultaat van nog niet afgesloten jaren (open_years): eigen vermogen. */
  openJaren: number
}

const DEBET_SECTIES = ['non_current_assets', 'current_assets'] as const
const CREDIT_SECTIES = ['equity', 'provisions', 'non_current_liabilities', 'current_liabilities'] as const

function verzamel(lijst: MbRuwRegelWaarde[], sectie: string, kant: BalansBlad['kant'], inclusief: BalansBlad[], los: BalansBlad[], diepte: number): void {
  for (const r of lijst) {
    if (!r || typeof r !== 'object') continue
    const id = r.ledger_account_id === undefined || r.ledger_account_id === null ? '' : String(r.ledger_account_id)
    const waarde = bedragUit(r.value)
    const kinderen = Array.isArray(r.children) && diepte < 8 ? r.children : []
    if (id) los.push({ id, waarde, kant, sectie })
    if (kinderen.length > 0) {
      // De rekening zelf eerst (met wat er na de kinderen overblijft), dan de kinderen.
      const rest = waarde - kinderen.reduce((s, k) => s + bedragUit(k?.value), 0)
      if (Math.abs(rest) >= 0.005 && id) inclusief.push({ id, waarde: rest, kant, sectie })
      verzamel(kinderen, sectie, kant, inclusief, los, diepte + 1)
    } else if (id) inclusief.push({ id, waarde, kant, sectie })
  }
}

/**
 * Rekeningen van één balans. Een rekening met `children` telt de kinderen gewoonlijk mee in zijn eigen
 * waarde; sluit dat niet op het totaal van die kant en de losse waarden wel, dan zijn de waarden los.
 */
export function balansMoment(b: MbRuwBalans | null): BalansMoment | null {
  if (!b || typeof b !== 'object' || (!b.debit && !b.credit)) return null
  const openJaren = Array.isArray(b.credit?.open_years) ? b.credit.open_years.reduce((s, j) => s + bedragUit(j?.value), 0) : 0
  const kant = (k: BalansBlad['kant'], secties: readonly string[], blok: Record<string, unknown> | undefined, extra: number): BalansBlad[] => {
    const inclusief: BalansBlad[] = []
    const los: BalansBlad[] = []
    for (const sectie of secties) {
      const lijst = blok?.[sectie]
      if (Array.isArray(lijst)) verzamel(lijst as MbRuwRegelWaarde[], sectie, k, inclusief, los, 0)
    }
    const totaal = blok?.total
    if (totaal !== undefined && totaal !== null) {
      const t = bedragUit(totaal)
      const s = (l: BalansBlad[]) => som(l.map((x) => x.waarde)) + extra
      if (Math.abs(s(inclusief) - t) > 0.005 && Math.abs(s(los) - t) <= 0.005) return los
    }
    return inclusief
  }
  return {
    bladen: [...kant('debet', DEBET_SECTIES, b.debit as Record<string, unknown> | undefined, 0), ...kant('credit', CREDIT_SECTIES, b.credit as Record<string, unknown> | undefined, openJaren)],
    openJaren,
  }
}

// ---------------------------------------------------------------------------
// Indeling per balansrekening
// ---------------------------------------------------------------------------

export interface BalansRekening {
  naam: string
  rgsCode: string | null
  /** account_type uit Moneybird (current_assets, equity, ...). */
  soort: string
}

export type BalansIndeling =
  | { soort: 'post'; post: BalansPost; reden: string; /** Het rapport kent geen eigen post; dit is de dichtstbijzijnde. */ benadering: boolean }
  | { soort: 'vermogen'; prive: boolean; reden: string }
  | { soort: 'onbekend'; reden: string }

/** Kant van een post in de vermogensopstelling: activa, of vermogen en vreemd vermogen (credit). */
const ACTIVA_POSTEN: BalansPost[] = ['materieleVasteActiva', 'voorraden', 'handelsdebiteuren', 'overigeVorderingen', 'liquideMiddelen']
const VREEMD_POSTEN: BalansPost[] = ['voorzieningen', 'langlopendeSchulden', 'crediteuren', 'omzetbelasting', 'overigeKortlopendeSchulden']
const ALLE_POSTEN: BalansPost[] = [...ACTIVA_POSTEN, 'oudedagsreserve', ...VREEMD_POSTEN]
const isActivaPost = (p: BalansPost) => ACTIVA_POSTEN.includes(p)

/** Namen van de posten in meldingen. */
const POST_NAAM: Record<BalansPost, string> = {
  materieleVasteActiva: 'materiële vaste activa',
  voorraden: 'voorraden en onderhanden werk',
  handelsdebiteuren: 'vorderingen op handelsdebiteuren',
  overigeVorderingen: 'overige vorderingen',
  liquideMiddelen: 'liquide middelen',
  oudedagsreserve: 'fiscale oudedagsreserve',
  voorzieningen: 'voorzieningen',
  langlopendeSchulden: 'langlopende schulden',
  crediteuren: 'schulden aan leveranciers',
  omzetbelasting: 'omzetbelasting',
  overigeKortlopendeSchulden: 'overige kortlopende schulden',
}

/** Posten die altijd een specificatie krijgen, ook met één rekening (5.4.2 en 5.5.1). */
const ALTIJD_SPECIFICEREN = new Set<BalansPost>(['overigeVorderingen', 'omzetbelasting'])

const PRIVE_RGS = /^BEivKa[p2-5](Prs|Poc|Png|Pbe|Ppr|Pro)/
const KAPITAAL_RGS = /^BEivKa[p2-5]Ond/

const RGS_POSTEN: Array<[prefix: string, post: BalansPost, toelichting: string, benadering?: true]> = [
  ['BEivFirFor', 'oudedagsreserve', 'fiscale oudedagsreserve'],
  ['BEivOdr', 'oudedagsreserve', 'oudedagsreserve'],
  ['BIva', 'materieleVasteActiva', 'immateriële vaste activa', true],
  ['BMva', 'materieleVasteActiva', 'materiële vaste activa'],
  ['BVas', 'materieleVasteActiva', 'vastgoedbeleggingen', true],
  ['BFvaOvrWaa', 'overigeVorderingen', 'waarborgsommen'],
  ['BFva', 'overigeVorderingen', 'financiële vaste activa', true],
  ['BVrd', 'voorraden', 'voorraden en onderhanden werk'],
  ['BPro', 'voorraden', 'onderhanden projecten'],
  ['BVorOnw', 'voorraden', 'onderhanden werk'],
  ['BVorDeb', 'handelsdebiteuren', 'vorderingen op handelsdebiteuren'],
  ['BVorVbkTvo', 'omzetbelasting', 'terug te vorderen omzetbelasting'],
  ['BVorVbkEob', 'omzetbelasting', 'terug te vorderen omzetbelasting'],
  ['BVor', 'overigeVorderingen', 'overige vorderingen'],
  ['BEff', 'overigeVorderingen', 'effecten', true],
  ['BLim', 'liquideMiddelen', 'liquide middelen'],
  ['BVrz', 'voorzieningen', 'voorzieningen'],
  ['BLas', 'langlopendeSchulden', 'langlopende schulden'],
  ['BSchCre', 'crediteuren', 'schulden aan leveranciers'],
  ['BSchBepB', 'omzetbelasting', 'omzetbelasting'],
  ['BSchBepEob', 'omzetbelasting', 'omzetbelasting'],
  ['BSch', 'overigeKortlopendeSchulden', 'kortlopende schulden'],
]

const noemtPrive = (naam: string) => naam.includes('prive')
const noemtBtw = (naam: string) => /(^|[^a-z])btw|omzetbelasting|voorbelasting/.test(naam)
const noemtBorg = (naam: string) => /borg|vooruitbetaal|vooruit betaal|nog te ontvangen/.test(naam)
const noemtLiquide = (naam: string) => /(^|[^a-z])(bank|kas|spaar|kruispost|creditcard|paypal|stripe|mollie)/.test(naam)

const post = (p: BalansPost, reden: string, benadering = false): BalansIndeling => ({ soort: 'post', post: p, reden, benadering })

export function deelBalansrekeningIn(r: BalansRekening): BalansIndeling {
  const code = r.rgsCode?.trim() ?? ''
  const naam = normaliseer(r.naam ?? '')
  if (code) {
    if (PRIVE_RGS.test(code) || code.startsWith('BEivPrv')) return { soort: 'vermogen', prive: true, reden: `RGS ${code.slice(0, 10)}: privé` }
    const p = RGS_POSTEN.find(([c]) => code.startsWith(c))
    if (p) return post(p[1], `RGS ${p[0]}: ${p[2]}`, p[3] === true)
    if (code.startsWith('BEiv')) {
      const prive = !KAPITAAL_RGS.test(code) && noemtPrive(naam)
      return { soort: 'vermogen', prive, reden: prive ? "RGS BEiv en naam bevat 'privé'" : 'RGS BEiv: eigen vermogen' }
    }
  }
  switch (r.soort) {
    case 'equity':
      if (naam.includes('oudedagsreserve')) return post('oudedagsreserve', "naam bevat 'oudedagsreserve'")
      return { soort: 'vermogen', prive: noemtPrive(naam), reden: 'Moneybird-soort eigen vermogen' }
    case 'non_current_assets':
      return noemtBorg(naam) ? post('overigeVorderingen', "naam bevat 'borg'") : post('materieleVasteActiva', 'Moneybird-soort vaste activa')
    case 'current_assets':
      if (/onderhanden|voorraad/.test(naam)) return post('voorraden', 'naam wijst op onderhanden werk of voorraad')
      if (naam.includes('debiteur')) return post('handelsdebiteuren', "naam bevat 'debiteur'")
      if (noemtBtw(naam)) return post('omzetbelasting', 'naam wijst op btw')
      if (noemtBorg(naam)) return post('overigeVorderingen', 'naam wijst op een borg of vooruitbetaling')
      if (noemtLiquide(naam)) return post('liquideMiddelen', 'naam wijst op bank of kas')
      return { soort: 'onbekend', reden: 'vlottende activa zonder RGS-code' }
    case 'provisions':
      return post('voorzieningen', 'Moneybird-soort voorzieningen')
    case 'non_current_liabilities':
      return post('langlopendeSchulden', 'Moneybird-soort langlopende schulden')
    case 'current_liabilities':
      if (naam.includes('crediteur')) return post('crediteuren', "naam bevat 'crediteur'")
      if (noemtBtw(naam)) return post('omzetbelasting', 'naam wijst op btw')
      return post('overigeKortlopendeSchulden', 'Moneybird-soort kortlopende schulden')
    default:
      return { soort: 'onbekend', reden: code ? `RGS-code ${code.slice(0, 12)} hoort niet bij de balans` : 'geen RGS-code en geen bekende soort' }
  }
}

// ---------------------------------------------------------------------------
// Jaarrekening bouwen
// ---------------------------------------------------------------------------

export interface JaarrekeningBouw {
  begin: BalansMoment | null
  eind: BalansMoment | null
  /** Naam, RGS-code en soort per grootboekrekening. */
  rekeningen: ReadonlyMap<string, BalansRekening>
  activa: MbJaarImport['activa']
  /** Netto winst volgens Moneybird, onafgerond; null als de winst- en verliesrekening ontbreekt. */
  nettoWinst: number | null
  /** Som van de afgeronde bijdragen van alle regels, ook die op 'niet meenemen'. */
  winstRegels: number
  /** ISO-datums van de twee balansen. */
  peildatumBegin: string
  peildatumEind: string
}

export interface JaarrekeningUitBalans {
  /** Balansdelen (begin, eind, specificaties, mva) met bron 'moneybird'; zonder winst- en verliesrekening en privé. */
  jaarrekening: JaarrekeningInvoer
  priveMutaties?: MbJaarImport['priveMutaties']
  waarschuwingen: Waarschuwing[]
}

interface Rekening {
  id: string
  naam: string
  indeling: BalansIndeling
}

interface Stand {
  /** Per rekening het bedrag aan de kant van zijn post (activa debet, vermogen en schulden credit). */
  perRekening: Map<string, number>
  /** Onafgerond, per post. */
  posten: Map<BalansPost, number>
  /** Eigen vermogen inclusief oudedagsreserve en open jaren, onafgerond. */
  vermogen: number
  activa: number
  vreemd: number
  /** Activa min (vermogen plus vreemd vermogen); 0 als de balans sluit. */
  verschil: number
}

function stand(m: BalansMoment, rekening: (b: BalansBlad) => Rekening): Stand {
  const perRekening = new Map<string, number>()
  const posten = new Map<BalansPost, number>()
  let vermogen = m.openJaren
  for (const b of m.bladen) {
    const r = rekening(b)
    if (r.indeling.soort === 'onbekend') continue
    // Bedrag in activatermen: debet positief.
    const a = b.kant === 'debet' ? b.waarde : -b.waarde
    if (r.indeling.soort === 'vermogen') {
      perRekening.set(r.id, (perRekening.get(r.id) ?? 0) - a)
      vermogen -= a
      continue
    }
    const p = r.indeling.post
    const bedrag = isActivaPost(p) ? a : -a
    perRekening.set(r.id, (perRekening.get(r.id) ?? 0) + bedrag)
    posten.set(p, (posten.get(p) ?? 0) + bedrag)
    if (p === 'oudedagsreserve') vermogen += bedrag
  }
  const activa = som(ACTIVA_POSTEN.map((p) => posten.get(p) ?? 0))
  const vreemd = som(VREEMD_POSTEN.map((p) => posten.get(p) ?? 0))
  return { perRekening, posten, vermogen, activa, vreemd, verschil: activa - vreemd - vermogen }
}

const sluit = (s: Stand) => Math.abs(s.verschil) < 0.5

/** Afgeronde posten van één peildatum, zo dat activa min vreemd vermogen het afgeronde eigen vermogen is (als de balans sluit). */
function rondPosten(s: Stand, aanwezig: BalansPost[]): Map<BalansPost, number> {
  const uit = new Map<BalansPost, number>()
  const verdeel = (posten: BalansPost[], doel: number | null) => {
    const met = posten.filter((p) => aanwezig.includes(p) && Math.abs(s.posten.get(p) ?? 0) >= 0.005)
    const waarden = met.map((p) => s.posten.get(p) ?? 0)
    const afgerond = doel === null ? waarden.map(rond) : rondAfOpSom(waarden, doel)
    met.forEach((p, i) => uit.set(p, afgerond[i]))
  }
  const activa = rond(s.activa)
  verdeel(ACTIVA_POSTEN, activa)
  verdeel(VREEMD_POSTEN, sluit(s) ? activa - rond(s.vermogen) : null)
  if (aanwezig.includes('oudedagsreserve')) uit.set('oudedagsreserve', rond(s.posten.get('oudedagsreserve') ?? 0))
  return uit
}

const tekstNaam = (naam: string) => naam.slice(0, MB_MAX_OMSCHRIJVING)

export function bouwJaarrekening(input: JaarrekeningBouw): JaarrekeningUitBalans {
  const w: Waarschuwing[] = []
  const jaarrekening: JaarrekeningInvoer = {}
  const mva: JaarrekeningInvoer['mva'] =
    input.activa.length > 0
      ? { aanschafwaarde: Math.max(0, som(input.activa.map((a) => a.aanschafwaarde))), restwaarde: Math.max(0, som(input.activa.map((a) => a.restwaarde ?? 0))) }
      : undefined
  const klaar = (priveMutaties?: MbJaarImport['priveMutaties']): JaarrekeningUitBalans => {
    if (mva) jaarrekening.mva = mva
    jaarrekening.bron = 'moneybird'
    return priveMutaties ? { jaarrekening, priveMutaties, waarschuwingen: w } : { jaarrekening, waarschuwingen: w }
  }
  if (!input.eind) return klaar()

  // Indeling per rekening, één keer per id.
  const rekeningen = new Map<string, Rekening>()
  const rekening = (b: BalansBlad): Rekening => {
    const bestaand = rekeningen.get(b.id)
    if (bestaand) return bestaand
    const info = input.rekeningen.get(b.id)
    const naam = info?.naam?.trim() || `Grootboekrekening ${b.id}`
    const r: Rekening = { id: b.id, naam, indeling: deelBalansrekeningIn({ naam, rgsCode: info?.rgsCode ?? null, soort: info?.soort || b.sectie }) }
    rekeningen.set(b.id, r)
    return r
  }
  const eind = stand(input.eind, rekening)
  const begin = input.begin ? stand(input.begin, rekening) : null
  const momenten: Array<[Stand, string, 'begin' | 'eind']> = begin
    ? [
        [begin, input.peildatumBegin, 'begin'],
        [eind, input.peildatumEind, 'eind'],
      ]
    : [[eind, input.peildatumEind, 'eind']]

  // Niet ingedeelde rekeningen en benaderingen.
  const metSaldo = (id: string) => [input.begin, input.eind].some((m) => m?.bladen.some((b) => b.id === id && Math.abs(b.waarde) >= 0.005))
  const onbekend = [...rekeningen.values()].filter((r) => r.indeling.soort === 'onbekend' && metSaldo(r.id))
  if (onbekend.length > 0) {
    w.push({
      id: 'mb-jaarrekening-onbekend',
      ernst: 'let-op',
      tekst: `${onbekend.length === 1 ? 'Deze balansrekening is' : 'Deze balansrekeningen zijn'} niet ingedeeld en ${onbekend.length === 1 ? 'staat' : 'staan'} niet in de jaarrekening: ${onbekend.map((r) => `${r.naam} (${r.indeling.reden})`).join(', ')}. Geef ${onbekend.length === 1 ? 'de rekening' : 'ze'} in Moneybird een RGS-code en importeer opnieuw.`,
    })
  }
  const benadering = [...rekeningen.values()].filter((r) => r.indeling.soort === 'post' && r.indeling.benadering && metSaldo(r.id))
  if (benadering.length > 0) {
    w.push({
      id: 'mb-jaarrekening-benadering',
      ernst: 'info',
      tekst: `Het rapport heeft geen aparte post voor ${benadering
        .map((r) => (r.indeling.soort === 'post' ? `${r.naam} (${r.indeling.reden.replace(/^RGS \w+: /, '')}, nu bij ${POST_NAAM[r.indeling.post]})` : r.naam))
        .join(', ')}. ${benadering.length === 1 ? 'Die staat' : 'Die staan'} bij de post die er het dichtst bij ligt.`,
    })
  }

  for (const [s, datum, wanneer] of momenten) {
    if (sluit(s)) continue
    w.push({
      id: `mb-jaarrekening-balans-${wanneer}`,
      ernst: 'let-op',
      tekst: `De balans per ${datumNl(datum)} sluit niet: de activa zijn ${euro(s.activa)}, het eigen vermogen en de schulden samen ${euro(s.vermogen + s.vreemd)} (verschil ${euro(Math.abs(s.verschil))}). Meestal komt dat door een rekening die niet is ingedeeld. Controleer de jaarrekening voordat je het rapport gebruikt.`,
    })
  }
  if (input.begin && input.begin.bladen.length === 0 && input.begin.openJaren === 0) {
    w.push({
      id: 'mb-jaarrekening-begin-leeg',
      ernst: 'info',
      tekst: `Op ${datumNl(input.peildatumBegin)} staat in Moneybird nog niets op de balans. De jaarrekening begint daarom met een ondernemingsvermogen van € 0.`,
    })
  }

  // Posten die op een van beide peildatums een bedrag hebben, krijgen er twee (0 waar niets staat).
  const aanwezig = ALLE_POSTEN.filter((p) => momenten.some(([s]) => Math.abs(s.posten.get(p) ?? 0) >= 0.5))
  const afgerond = new Map(momenten.map(([s, , wanneer]) => [wanneer, rondPosten(s, aanwezig)] as const))
  const balansStand = (wanneer: 'begin' | 'eind'): BalansStand => {
    const posten = afgerond.get(wanneer)
    const uit: BalansStand = {}
    for (const p of aanwezig) uit[p] = posten?.get(p) ?? 0
    return uit
  }
  if (begin) jaarrekening.begin = balansStand('begin')
  jaarrekening.eind = balansStand('eind')

  // Specificaties per grootboekrekening.
  const specificaties: NonNullable<JaarrekeningInvoer['specificaties']> = []
  for (const p of aanwezig) {
    const inPost = [...rekeningen.values()].filter((r) => r.indeling.soort === 'post' && r.indeling.post === p && momenten.some(([s]) => Math.abs(s.perRekening.get(r.id) ?? 0) >= 0.005))
    if (inPost.length === 0 || (inPost.length === 1 && !ALTIJD_SPECIFICEREN.has(p))) continue
    const perMoment = (wanneer: 'begin' | 'eind'): number[] => {
      const s = wanneer === 'begin' ? begin : eind
      if (!s) return inPost.map(() => 0)
      return rondAfOpSom(
        inPost.map((r) => s.perRekening.get(r.id) ?? 0),
        afgerond.get(wanneer)?.get(p) ?? 0,
      )
    }
    const b = perMoment('begin')
    const e = perMoment('eind')
    inPost.forEach((r, i) => {
      if (b[i] !== 0 || e[i] !== 0) specificaties.push({ post: p, omschrijving: tekstNaam(r.naam), begin: b[i], eind: e[i] })
    })
  }
  if (specificaties.length > 0) jaarrekening.specificaties = beperkSpecificaties(specificaties)

  // Privémutaties: verschil per privérekening tussen begin en einde.
  if (!begin) {
    w.push({
      id: 'mb-jaarrekening-geen-begin',
      ernst: 'info',
      tekst: 'De balans aan het begin van het jaar ontbreekt. Zonder beginbalans staan de privé-onttrekkingen en de kapitaalsvergelijking niet in de jaarrekening.',
    })
    return klaar()
  }
  const prive = [...rekeningen.values()].filter((r) => r.indeling.soort === 'vermogen' && r.indeling.prive)
  const mutaties = prive.map((r) => (eind.perRekening.get(r.id) ?? 0) - (begin.perRekening.get(r.id) ?? 0))
  const vermogenBegin = rond(begin.vermogen)
  const vermogenEind = rond(eind.vermogen)
  const onttrekkingen: MbPriveRegel[] = []
  const stortingen: MbPriveRegel[] = []

  if (prive.length > 0) {
    let afgerondeMutaties = mutaties.map(rond)
    if (input.nettoWinst !== null) {
      // Kapitaalsvergelijking: eind − begin + onttrekkingen − stortingen = winst, en onttrekkingen − stortingen = −Σ mutaties.
      const verschil = eind.vermogen - begin.vermogen - som(mutaties) - input.nettoWinst
      if (Math.abs(verschil) < 0.5) {
        // Sluit onafgerond; afronden zo dat hij ook in hele euro's sluit (alleen als beide balansen sluiten).
        if (sluit(begin) && sluit(eind)) afgerondeMutaties = rondAfOpSom(mutaties, vermogenEind - vermogenBegin - input.winstRegels)
      } else {
        const winstBalans = eind.vermogen - begin.vermogen - som(mutaties)
        w.push({
          id: 'mb-jaarrekening-kapitaal',
          ernst: 'let-op',
          tekst: `De kapitaalsvergelijking sluit niet: volgens de balans en de privérekeningen is de winst ${euro(winstBalans)}, volgens de winst- en verliesrekening ${euro(input.nettoWinst)} (verschil ${euro(Math.abs(verschil))}). Dat gebeurt bijvoorbeeld als privéboekingen naar het kapitaal zijn overgeboekt, als er in dit jaar een beginbalans is geboekt of als een balansrekening niet is ingedeeld. Controleer de privérekeningen in Moneybird.`,
        })
      }
    }
    prive.forEach((r, i) => {
      const m = afgerondeMutaties[i]
      if (m < 0) onttrekkingen.push({ omschrijving: tekstNaam(r.naam), bedrag: -m })
      else if (m > 0) stortingen.push({ omschrijving: tekstNaam(r.naam), bedrag: m })
    })
  } else if (input.nettoWinst !== null) {
    // Geen privérekeningen: het saldo volgt uit de kapitaalsvergelijking.
    const saldo = input.winstRegels - (vermogenEind - vermogenBegin)
    if (saldo !== 0) {
      const regel = { omschrijving: 'Privé (saldo uit Moneybird)', bedrag: Math.abs(saldo) }
      if (saldo > 0) onttrekkingen.push(regel)
      else stortingen.push(regel)
      w.push({
        id: 'mb-jaarrekening-prive-saldo',
        ernst: 'let-op',
        tekst: `Op de balans in Moneybird staan geen herkenbare privérekeningen. De privéboekingen staan daarom als één regel in de kapitaalsvergelijking: de winst min de groei van het ondernemingsvermogen, per saldo ${euro(Math.abs(saldo))} ${saldo > 0 ? 'onttrokken' : 'gestort'}. Boek privé-opnamen, belastingen en premies in Moneybird op privérekeningen (RGS BEivKapPro, BEivKapPbe, BEivKapPpr, BEivKapPrs) als je ze per soort wilt zien.`,
      })
    }
  }

  return klaar({
    onttrekkingen: beperkLijst(onttrekkingen, 'Overige privé-onttrekkingen'),
    stortingen: beperkLijst(stortingen, 'Overige privéstortingen'),
  })
}

/**
 * Hooguit MB_MAX_SPECIFICATIES regels (grens van de dossiervalidatie). Bij meer houdt elke post zijn
 * drie grootste rekeningen en gaat de rest samen in 'Overige rekeningen'; zo blijft elke post sluiten.
 */
function beperkSpecificaties(lijst: NonNullable<JaarrekeningInvoer['specificaties']>): NonNullable<JaarrekeningInvoer['specificaties']> {
  if (lijst.length <= MB_MAX_SPECIFICATIES) return lijst
  const uit: typeof lijst = []
  for (const p of ALLE_POSTEN) {
    const regels = lijst.filter((s) => s.post === p)
    if (regels.length <= 4) {
      uit.push(...regels)
      continue
    }
    const grootte = (s: (typeof lijst)[number]) => Math.max(Math.abs(s.begin), Math.abs(s.eind))
    const top = new Set([...regels].sort((a, b) => grootte(b) - grootte(a)).slice(0, 3))
    const rest = regels.filter((s) => !top.has(s))
    uit.push(...regels.filter((s) => top.has(s)), { post: p, omschrijving: 'Overige rekeningen', begin: som(rest.map((s) => s.begin)), eind: som(rest.map((s) => s.eind)) })
  }
  return uit
}
