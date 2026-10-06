/**
 * Voorstel voor de fiscale categorie per grootboekrekening, en het herberekenen van de totalen
 * als de gebruiker de indeling aanpast. Puur: draait op de server en in de browser.
 *
 * Volgorde van het voorstel:
 *  1. Specifieke RGS-codes (taxonomy_item.code van Moneybird, RGS 3.x):
 *     - WOmz* omzet, WAfs* afschrijving, WBedAut* autokosten, WFbe* financieel, WBedAdlBan bankkosten.
 *     - Beperkt aftrekbaar (voedsel, drank, representatie, relatiegeschenken, congressen):
 *       WBedVkkRep Representatiekosten, WBedVkkRel Relatiegeschenken, WBedVkkKer Kerstpakketten relaties,
 *       WBedWkrWkiMmz Maaltijden met zakelijke relaties, WBedWkrWkgCem Consumpties en maaltijden dienstreis,
 *       WBedWkrWkfMow Maaltijden op de werkplek, WBedWkrWkgMbo Maaltijden bij overwerk,
 *       WBedOvpMlv Maaltijden en consumpties personeel, WBedOrgWrc Bedrijfsrestaurant en consumpties werkvloer.
 *       WBedWkrWkgOsc (opleidingen, studies, congressen, seminars, studiereizen) is gemengd: alleen
 *       beperkt als de naam op een congres of studiereis wijst, anders kosten (opleidingen zijn volledig aftrekbaar).
 *     Bron: boekhoudplaza.nl/rgs_rekeningen (RGS MKB, Overige bedrijfskosten WBed), geraadpleegd 4 oktober 2026.
 *  2. account_type: revenue wordt omzet, other_income_expenses financieel.
 *  3. Trefwoorden in de naam (voor kosten): representatie, lunch, congres en dergelijke worden beperkt
 *     aftrekbaar; afschrijving; auto, brandstof en lease worden autokosten (alleen bij expenses);
 *     rente en bankkosten financieel.
 *  4. Anders kosten.
 * Een keuze van de gebruiker (MbIndeling) gaat altijd voor.
 *
 * Voor het fiscaal rapport (hoofdstuk 5) volgt hier ook de jaarrekening die van de indeling afhangt:
 *  - Rubrieken van de winst- en verliesrekening (5.3), per regel uit de categorie, binnen 'kosten' verfijnd
 *    op RGS-code (WKpr inkoop en uitbesteed werk, WPer personeel, WBedHui huisvesting, WBedAut en WBedTra
 *    auto en transport, WBedVkkKmz kilometervergoeding ook auto, overige WBedVkk verkoop, WBedKan kantoor,
 *    de rest overig), zonder RGS-code op trefwoorden in de naam en anders de Moneybird-soort (directe kosten
 *    is inkoop). Omzet en kosten met RGS WWiv (behalve WWivGpv) zijn wijziging onderhanden werk. De som
 *    (opbrengsten min kosten plus baten min lasten) is precies de netto winst volgens de indeling.
 *  - Regels op 'niet meenemen' zijn privéboekingen die in de winst stonden: in de kapitaalsvergelijking een
 *    onttrekking (kosten) of storting (opbrengst). Zo sluit die vergelijking op de winst volgens de indeling.
 */
import type { JaarrekeningInvoer, WvRubriek } from '../tax/types'
import type { MbCategorie, MbGrootboekRegel, MbIndeling, MbJaarImport, MbIndelingWijziging, MbPriveRegel } from './types'
import { MB_CATEGORIEEN } from './types'

export interface RekeningInfo {
  naam: string
  rgsCode: string | null
  /** account_type uit Moneybird. */
  soort: string
}

export interface Voorstel {
  categorie: MbCategorie
  reden: string
}

const BEPERKT_RGS: Array<[string, string]> = [
  ['WBedVkkRep', 'representatiekosten'],
  ['WBedVkkRel', 'relatiegeschenken'],
  ['WBedVkkKer', 'kerstpakketten relaties'],
  ['WBedWkrWkiMmz', 'maaltijden met zakelijke relaties'],
  ['WBedWkrWkgCem', 'consumpties en maaltijden dienstreis'],
  ['WBedWkrWkfMow', 'maaltijden op de werkplek'],
  ['WBedWkrWkgMbo', 'maaltijden bij overwerk'],
  ['WBedOvpMlv', 'maaltijden en consumpties'],
  ['WBedOrgWrc', 'bedrijfsrestaurant en consumpties'],
]

const GROEP_RGS: Array<[string, MbCategorie, string]> = [
  ['WOmz', 'omzet', 'netto-omzet'],
  ['WAfs', 'afschrijving', 'afschrijvingen'],
  ['WBedAut', 'autokosten', 'autokosten en andere vervoermiddelen'],
  ['WFbe', 'financieel', 'financiële baten en lasten'],
  ['WBedAdlBan', 'financieel', 'bankkosten'],
]

const GEMENGD_CONGRES = 'WBedWkrWkgOsc'

const BEPERKT_WOORDEN = [
  'representatie',
  'relatiegeschenk',
  'lunch',
  'diner',
  'etentje',
  'zakelijke maaltijd',
  'congres',
  'seminar',
  'symposi',
  'studiereis',
  'kerstpakket',
  'consumptie',
  'horeca',
  'borrel',
  'eten en drinken',
]

const CONGRES_WOORDEN = ['congres', 'seminar', 'symposi', 'studiereis', 'excursie']

/** Kleine letters, zonder accenten. */
export function normaliseer(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function bevat(naam: string, woorden: string[]): string | null {
  return woorden.find((w) => naam.includes(w)) ?? null
}

/** Wijst de naam op een auto? 'automatisering', 'autorisatie' en 'autonoom' tellen niet mee. */
export function noemtAuto(naam: string): string | null {
  const n = normaliseer(naam)
  if (/(^|[^a-z])auto(?!mati|ris|nom)/.test(n) || /personenauto/.test(n)) return 'auto'
  if (n.includes('brandstof')) return 'brandstof'
  if (/(^|[^a-z])lease/.test(n) || n.includes('autolease')) return 'lease'
  return null
}

function noemtFinancieel(naam: string): string | null {
  const n = normaliseer(naam)
  if (n.includes('bankkosten')) return 'bankkosten'
  if (/(^|[^a-z])rente/.test(n) || /rente($|[^a-z])/.test(n) || n.includes('rentekosten')) return 'rente'
  return null
}

const KOSTEN_SOORTEN = new Set(['direct_costs', 'expenses'])

export function stelCategorieVoor(r: RekeningInfo): Voorstel {
  const code = r.rgsCode?.trim() ?? ''
  const naam = normaliseer(r.naam ?? '')

  if (code) {
    const beperkt = BEPERKT_RGS.find(([c]) => code.startsWith(c))
    if (beperkt) return { categorie: 'beperktAftrekbaar', reden: `RGS ${beperkt[0]}: ${beperkt[1]}` }
    if (code.startsWith(GEMENGD_CONGRES)) {
      const w = bevat(naam, CONGRES_WOORDEN)
      return w
        ? { categorie: 'beperktAftrekbaar', reden: `RGS ${GEMENGD_CONGRES} en naam bevat '${w}': congressen en studiereizen zijn beperkt aftrekbaar` }
        : { categorie: 'kosten', reden: `RGS ${GEMENGD_CONGRES}: opleidingen zijn volledig aftrekbaar; controleer of hier congressen of studiereizen in zitten` }
    }
    const groep = GROEP_RGS.find(([c]) => code.startsWith(c))
    // Autokosten volgen alleen uit de RGS-code bij gewone kosten, niet bij bijvoorbeeld een opbrengst.
    if (groep && !(groep[1] === 'autokosten' && r.soort !== 'expenses' && r.soort !== 'direct_costs')) {
      return { categorie: groep[1], reden: `RGS ${groep[0]}: ${groep[2]}` }
    }
  }

  if (r.soort === 'revenue') return { categorie: 'omzet', reden: 'Moneybird-soort omzet' }
  if (r.soort === 'other_income_expenses') return { categorie: 'financieel', reden: 'Moneybird-soort overige baten en lasten' }

  if (KOSTEN_SOORTEN.has(r.soort) || !r.soort) {
    const beperkt = bevat(naam, BEPERKT_WOORDEN)
    if (beperkt) return { categorie: 'beperktAftrekbaar', reden: `naam bevat '${beperkt}'` }
    if (naam.includes('afschrijving')) return { categorie: 'afschrijving', reden: "naam bevat 'afschrijving'" }
    const fin = noemtFinancieel(naam)
    if (fin) return { categorie: 'financieel', reden: `naam bevat '${fin}'` }
    if (r.soort === 'expenses') {
      const auto = noemtAuto(naam)
      if (auto) return { categorie: 'autokosten', reden: `naam bevat '${auto}'` }
    }
  }
  return { categorie: 'kosten', reden: r.soort === 'direct_costs' ? 'Moneybird-soort directe kosten' : 'Moneybird-soort kosten' }
}

const GELDIGE_CATEGORIEEN = new Set<string>(MB_CATEGORIEEN.map((c) => c.waarde))

export function isCategorie(x: unknown): x is MbCategorie {
  return typeof x === 'string' && GELDIGE_CATEGORIEEN.has(x)
}

/** Grootboekrekeningen in Moneybird met een opbrengstkarakter (bijdrage positief = winst omhoog). */
export function isOpbrengstSoort(soort: string): boolean {
  return soort === 'revenue' || soort === 'other_income_expenses'
}

type TekenRegel = Pick<MbGrootboekRegel, 'categorie' | 'voorstel' | 'soort'>

/**
 * +1 als een positief bedrag de winst verhoogt, -1 als het de winst verlaagt. Omzet en financieel
 * staan met hun bijdrage, de kostensoorten met min de bijdrage. Een regel op 'negeren' houdt het
 * teken van het voorstel (en als dat ook 'negeren' is, van de Moneybird-soort).
 */
export function opbrengstTeken(r: TekenRegel): 1 | -1 {
  const c = r.categorie === 'negeren' ? r.voorstel : r.categorie
  if (c === 'omzet' || c === 'financieel') return 1
  if (c === 'negeren') return isOpbrengstSoort(r.soort) ? 1 : -1
  return -1
}

/** Bijdrage van een regel aan de netto winst (positief = winst omhoog). */
export function bijdrageVan(r: TekenRegel & Pick<MbGrootboekRegel, 'bedrag'>): number {
  return opbrengstTeken(r) * r.bedrag
}

/** Bedrag zoals het in de regel staat, voor een bijdrage aan de winst. Omkering van bijdrageVan. */
export function bedragVoor(bijdrage: number, r: TekenRegel): number {
  return opbrengstTeken(r) * bijdrage || 0
}

/** Indeling per regel: keuze van de gebruiker, anders het voorstel. */
export function deelIn(info: RekeningInfo & { ledgerAccountId: string }, indeling: MbIndeling): Pick<MbGrootboekRegel, 'categorie' | 'voorstel' | 'reden' | 'aangepast'> {
  const v = stelCategorieVoor(info)
  const keuze = Object.prototype.hasOwnProperty.call(indeling, info.ledgerAccountId) ? indeling[info.ledgerAccountId] : undefined
  if (isCategorie(keuze) && keuze !== v.categorie) return { categorie: keuze, voorstel: v.categorie, reden: v.reden, aangepast: true }
  return { categorie: v.categorie, voorstel: v.categorie, reden: v.reden, aangepast: isCategorie(keuze) }
}

export function berekenTotalen(regels: MbGrootboekRegel[], nettoWinstMoneybird: number): MbJaarImport['totalen'] {
  const t = { omzet: 0, kosten: 0, afschrijvingen: 0, beperktAftrekbaar: 0, autokosten: 0, financieel: 0 }
  for (const r of regels) {
    if (r.categorie === 'omzet') t.omzet += r.bedrag
    else if (r.categorie === 'kosten') t.kosten += r.bedrag
    else if (r.categorie === 'afschrijving') t.afschrijvingen += r.bedrag
    else if (r.categorie === 'beperktAftrekbaar') t.beperktAftrekbaar += r.bedrag
    else if (r.categorie === 'autokosten') t.autokosten += r.bedrag
    else if (r.categorie === 'financieel') t.financieel += r.bedrag
  }
  const nettoWinstIndeling = t.omzet - t.kosten - t.afschrijvingen - t.beperktAftrekbaar - t.autokosten + t.financieel
  return { ...t, nettoWinstMoneybird, nettoWinstIndeling, verschil: nettoWinstMoneybird - nettoWinstIndeling }
}

/**
 * Past een (nieuwe) indeling toe op een bestaande import en rekent de totalen opnieuw uit, zonder
 * Moneybird opnieuw te vragen. Handig in de browser bij het wijzigen van een categorie.
 */
export function herindeel(imp: MbJaarImport, indeling: MbIndeling): MbJaarImport {
  const regels = imp.regels.map((r) => {
    const bijdrage = bijdrageVanRegel(r)
    const d = deelIn({ ledgerAccountId: r.ledgerAccountId, naam: r.naam, rgsCode: r.rgsCode, soort: r.soort }, indeling)
    return { ...r, ...d, bedrag: bedragVoor(bijdrage, { ...d, soort: r.soort }), bijdrage }
  })
  const uit: MbJaarImport = { ...imp, regels, totalen: berekenTotalen(regels, imp.totalen.nettoWinstMoneybird) }
  if (imp.jaarrekening) uit.jaarrekening = jaarrekeningMetIndeling(uit)
  return uit
}

export const MAX_INDELING_REGELS = 2_000

/** Controleert een indeling uit een verzoek: sleutels zijn Moneybird-id's, waarden geldige categorieën. */
export function schoonIndeling(x: unknown): { indeling: MbIndelingWijziging } | { fout: string } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { fout: 'de indeling moet een object zijn' }
  const sleutels = Object.keys(x)
  if (sleutels.length > MAX_INDELING_REGELS) return { fout: `maximaal ${MAX_INDELING_REGELS} grootboekrekeningen` }
  const uit: MbIndelingWijziging = {}
  for (const k of sleutels) {
    if (!/^\d{1,30}$/.test(k)) return { fout: `'${k.slice(0, 40)}' is geen geldig id van een grootboekrekening` }
    const v = (x as Record<string, unknown>)[k]
    if (v !== null && !isCategorie(v)) return { fout: `onbekende categorie voor grootboekrekening ${k}` }
    uit[k] = v
  }
  return { indeling: uit }
}

// ---------------------------------------------------------------------------
// Jaarrekening: rubrieken van de winst- en verliesrekening en privéboekingen
// ---------------------------------------------------------------------------

/** Grenzen van de dossiervalidatie (gelijk aan JAARREKENING_GRENZEN in lib/dossier/jaarrekening.ts). */
export const MB_MAX_PRIVEREGELS = 50
export const MB_MAX_OMSCHRIJVING = 200

type JaarrekeningRegel = Pick<MbGrootboekRegel, 'naam' | 'rgsCode' | 'soort' | 'bedrag' | 'categorie' | 'voorstel' | 'bijdrage'>

/** Effect van een regel op de winst: de vaste bijdrage van de import, anders uit bedrag en categorie. */
export function bijdrageVanRegel(r: TekenRegel & Pick<MbGrootboekRegel, 'bedrag' | 'bijdrage'>): number {
  return typeof r.bijdrage === 'number' && Number.isFinite(r.bijdrage) ? r.bijdrage : bijdrageVan(r)
}

/** Volgorde van de rubrieken in het rapport (5.3). */
export const WV_VOLGORDE: WvRubriek[] = [
  'omzet',
  'onderhandenWerk',
  'inkoop',
  'afschrijvingen',
  'personeel',
  'auto',
  'huisvesting',
  'verkoop',
  'kantoor',
  'beperktAftrekbaar',
  'overig',
  'financieleBaten',
  'financieleLasten',
]

/** Rubrieken waarin een positief bedrag de winst verhoogt; in de andere verlaagt het de winst. */
const OPBRENGST_RUBRIEKEN = new Set<WvRubriek>(['omzet', 'onderhandenWerk', 'financieleBaten'])

const KOSTEN_RGS: Array<[string, WvRubriek]> = [
  ['WKpr', 'inkoop'],
  ['WPer', 'personeel'],
  ['WBedHui', 'huisvesting'],
  ['WBedAut', 'auto'],
  ['WBedTra', 'auto'],
  ['WBedVkkKmz', 'auto'],
  ['WBedVkk', 'verkoop'],
  ['WBedKan', 'kantoor'],
]

const KOSTEN_WOORDEN: Array<[RegExp, WvRubriek]> = [
  [/kilometer|parkeer|parkeren|reiskosten|openbaar vervoer/, 'auto'],
  [/huisvesting|werkruimte|kantoorruimte|kantoorhuur|(^|[^a-z])huur($|[^a-z])|energie|elektra/, 'huisvesting'],
  [/reclame|advertentie|marketing|website|sponsor/, 'verkoop'],
  [/kantoor|automatisering|software|telefoon|internet|porti|drukwerk|vakliteratuur|abonnement/, 'kantoor'],
]

function isWijzigingOnderhandenWerk(code: string, naam: string): boolean {
  if (code) return code.startsWith('WWiv') && !code.startsWith('WWivGpv')
  return naam.includes('onderhanden')
}

/**
 * Rubriek van de winstberekening voor een regel. De categorie beslist (zodat de totalen per categorie
 * gelijk blijven aan die van de winstberekening); null voor 'negeren'.
 */
export function rubriekVoor(r: Pick<MbGrootboekRegel, 'naam' | 'rgsCode' | 'soort' | 'categorie'>, bijdrage: number): WvRubriek | null {
  const code = r.rgsCode?.trim() ?? ''
  const naam = normaliseer(r.naam ?? '')
  switch (r.categorie) {
    case 'negeren':
      return null
    case 'afschrijving':
      return 'afschrijvingen'
    case 'beperktAftrekbaar':
      return 'beperktAftrekbaar'
    case 'autokosten':
      return 'auto'
    case 'financieel':
      return bijdrage >= 0 ? 'financieleBaten' : 'financieleLasten'
    case 'omzet':
      return isWijzigingOnderhandenWerk(code, naam) ? 'onderhandenWerk' : 'omzet'
    case 'kosten': {
      if (isWijzigingOnderhandenWerk(code, naam)) return 'onderhandenWerk'
      if (code) return KOSTEN_RGS.find(([c]) => code.startsWith(c))?.[1] ?? 'overig'
      if (noemtAuto(naam)) return 'auto'
      const woord = KOSTEN_WOORDEN.find(([re]) => re.test(naam))
      if (woord) return woord[1]
      return r.soort === 'direct_costs' ? 'inkoop' : 'overig'
    }
  }
}

/**
 * Winst- en verliesrekening in rubrieken (één bedrag per rubriek, nul weggelaten). Opbrengsten en baten
 * positief als ze de winst verhogen, kosten en lasten positief als ze de winst verlagen.
 */
export function wvRubrieken(regels: ReadonlyArray<JaarrekeningRegel>): Array<{ rubriek: WvRubriek; bedrag: number }> {
  const totaal = new Map<WvRubriek, number>()
  for (const r of regels) {
    const b = bijdrageVanRegel(r)
    const rubriek = rubriekVoor(r, b)
    if (!rubriek) continue
    totaal.set(rubriek, (totaal.get(rubriek) ?? 0) + (OPBRENGST_RUBRIEKEN.has(rubriek) ? b : -b))
  }
  return WV_VOLGORDE.filter((x) => (totaal.get(x) ?? 0) !== 0).map((rubriek) => ({ rubriek, bedrag: totaal.get(rubriek) ?? 0 }))
}

/** Regels op 'niet meenemen' als privéboeking: kosten worden een onttrekking, opbrengsten een storting. */
export function negerenAlsPrive(regels: ReadonlyArray<JaarrekeningRegel>): { onttrekkingen: MbPriveRegel[]; stortingen: MbPriveRegel[] } {
  const uit = { onttrekkingen: [] as MbPriveRegel[], stortingen: [] as MbPriveRegel[] }
  for (const r of regels) {
    if (r.categorie !== 'negeren') continue
    const b = bijdrageVanRegel(r)
    if (b === 0) continue
    const regel = { omschrijving: `${r.naam} (niet in de winst)`.slice(0, MB_MAX_OMSCHRIJVING), bedrag: Math.abs(b) }
    if (b < 0) uit.onttrekkingen.push(regel)
    else uit.stortingen.push(regel)
  }
  return uit
}

/**
 * Hooguit `max` regels: bij meer blijven de grootste staan (in hun volgorde) en gaat de rest samen in één
 * regel, zodat het totaal gelijk blijft.
 */
export function beperkLijst(lijst: MbPriveRegel[], restLabel: string, max = MB_MAX_PRIVEREGELS): MbPriveRegel[] {
  if (lijst.length <= max) return lijst
  const houden = new Set([...lijst].sort((a, b) => b.bedrag - a.bedrag).slice(0, max - 1))
  const rest = lijst.filter((r) => !houden.has(r))
  return [...lijst.filter((r) => houden.has(r)), { omschrijving: restLabel, bedrag: rest.reduce((s, r) => s + r.bedrag, 0) }]
}

/**
 * Jaarrekening bij de huidige indeling: de balansdelen van de import, de winst- en verliesrekening in
 * rubrieken uit de regels, en de onttrekkingen en stortingen uit de privérekeningen plus de regels op
 * 'niet meenemen'. Werkt ook als de browser alleen de categorie van een regel heeft aangepast (de
 * bijdrage van een regel verandert niet). undefined als er niets in staat.
 */
export function jaarrekeningMetIndeling(imp: Pick<MbJaarImport, 'jaarrekening' | 'priveMutaties'> & { regels: ReadonlyArray<JaarrekeningRegel> }): JaarrekeningInvoer | undefined {
  const uit: JaarrekeningInvoer = { ...imp.jaarrekening }
  delete uit.winstEnVerlies
  delete uit.onttrekkingen
  delete uit.stortingen
  delete uit.bron
  const wv = wvRubrieken(imp.regels)
  if (wv.length > 0) uit.winstEnVerlies = wv
  if (imp.priveMutaties) {
    const negeren = negerenAlsPrive(imp.regels)
    const onttrekkingen = beperkLijst([...imp.priveMutaties.onttrekkingen, ...negeren.onttrekkingen], 'Overige privé-onttrekkingen')
    const stortingen = beperkLijst([...imp.priveMutaties.stortingen, ...negeren.stortingen], 'Overige privéstortingen')
    if (onttrekkingen.length > 0) uit.onttrekkingen = onttrekkingen
    if (stortingen.length > 0) uit.stortingen = stortingen
  }
  if (Object.values(uit).every((v) => v === undefined)) return undefined
  uit.bron = 'moneybird'
  return uit
}
