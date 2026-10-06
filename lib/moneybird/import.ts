/**
 * Haalt de cijfers van één jaar uit Moneybird en zet ze om in een MbJaarImport (server-only).
 *
 * Aannames over Moneybird (zie ook de tests en fixtures):
 *  - Bedragen zijn decimale strings. De secties van de winst- en verliesrekening hebben elk hun eigen
 *    tekenconventie; het teken per sectie leiden we af door te kijken welke combinatie optelt tot
 *    net_profit (en gross_profit / operating_profit als die er zijn).
 *  - Een regel met `children` telt in de bovenliggende waarde alle kinderen mee; we splitsen hem in de
 *    kinderen plus een eventueel restant op de bovenliggende rekening.
 *  - Balans: credit-bedragen zijn positief. Ondernemingsvermogen = eigen vermogen plus het resultaat
 *    van nog niet afgesloten jaren (open_years); klopt dat niet met totaal minus schulden, dan nemen we
 *    totaal activa minus voorzieningen en schulden.
 *  - revenue_by_contact, disposal en value_changes zijn niet volledig gedocumenteerd: de parsers
 *    accepteren de waarschijnlijke veldnamen en negeren de rest.
 *  - Jaarrekening (jaarrekening.ts): de balans per 31-12 van het vorige jaar en van dit jaar ingedeeld op
 *    RGS-code, privémutaties als verschil per privérekening, en de winst- en verliesrekening in rubrieken
 *    volgens de indeling (indeling.ts). Controles: balans sluit niet, kapitaalsvergelijking sluit niet.
 *  - Vaste activa: de activamodule wordt bij de overname het activaregister (overname.ts). De import toetst het
 *    afschrijvingsplan fiscaal (maximaal percentage per jaar, goodwill, geen plan), legt afgestoten middelen vast
 *    (`afgestoten`, voor de koppeling met het register bij de overname) en vergelijkt de afschrijving in de module met
 *    de geboekte afschrijving. Alleen meldingen; rekenen doet de engine.
 *  - Oudedagsreserve: de stand op 1 januari komt van de beginbalans, die op de eindbalans is een controle (forMeldingen).
 * Een onderdeel waarvoor het token geen scope heeft (403) wordt overgeslagen met een waarschuwing;
 * andere fouten gaan door naar de route (502).
 */
import { getJaar } from '@/lib/tax/years'
import type { DesinvesteringInvoer, InvesteringInvoer, OpdrachtgeverInvoer, Waarschuwing } from '@/lib/tax/types'
import {
  bedragUit,
  geldigMbId,
  maakClient,
  MoneybirdFout,
  type MbClient,
  type MbOmzetContact,
  type MbOpties,
  type MbRuwActief,
  type MbRuwBalans,
  type MbRuwGrootboek,
  type MbRuwRegelWaarde,
  type MbRuwUren,
  type MbRuwWinstVerlies,
} from './client'
import { bedragVoor, berekenTotalen, bijdrageVan, bijdrageVanRegel, deelIn, jaarrekeningMetIndeling, noemtAuto, normaliseer } from './indeling'
import { balansMoment, bouwJaarrekening, datumNl, euro, rond, type BalansRekening } from './jaarrekening'
import { noemtGoodwill, paramsVoorActiva, standaardLevensduur } from './overname'
import type { MbAdministratie, MbGrootboekRegel, MbIndeling, MbJaarImport } from './types'

export { rond }

/** Het jaar kan niet worden geïmporteerd (bijvoorbeeld een jaar in de toekomst). */
export class ImportFout extends Error {
  constructor(melding: string) {
    super(melding)
    this.name = 'ImportFout'
  }
}

const MAX_OPDRACHTGEVERS = 100


function datumIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function isoDatum(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(x.trim())
  if (!m || Number.isNaN(Date.parse(`${m[1]}T00:00:00Z`))) return null
  return m[1]
}

// ---------------------------------------------------------------------------
// Winst- en verliesrekening
// ---------------------------------------------------------------------------

type Sectie = 'revenue' | 'direct_costs' | 'expenses' | 'other_income_expenses'
const SECTIES: Array<{ sectie: Sectie; veld: keyof MbRuwWinstVerlies }> = [
  { sectie: 'revenue', veld: 'revenue_by_ledger_account' },
  { sectie: 'direct_costs', veld: 'direct_costs_by_ledger_account' },
  { sectie: 'expenses', veld: 'expenses_by_ledger_account' },
  { sectie: 'other_income_expenses', veld: 'other_income_expenses_by_ledger_account' },
]

function sectieRegels(x: unknown): MbRuwRegelWaarde[] {
  if (Array.isArray(x)) return x as MbRuwRegelWaarde[]
  if (x && typeof x === 'object' && Array.isArray((x as { ledger_accounts?: unknown }).ledger_accounts)) return (x as { ledger_accounts: MbRuwRegelWaarde[] }).ledger_accounts
  return []
}

/** Splitst een boom in losse rekeningen: de kinderen plus het restant van de ouder. */
export function plat(regels: MbRuwRegelWaarde[], diepte = 0): Array<{ id: string; waarde: number }> {
  const uit: Array<{ id: string; waarde: number }> = []
  for (const r of regels) {
    if (!r || typeof r !== 'object') continue
    const id = r.ledger_account_id === undefined || r.ledger_account_id === null ? '' : String(r.ledger_account_id)
    const waarde = bedragUit(r.value)
    const kinderen = Array.isArray(r.children) && diepte < 8 ? r.children : []
    if (kinderen.length > 0) {
      const sub = plat(kinderen, diepte + 1)
      const somKinderen = kinderen.reduce((s, k) => s + bedragUit(k?.value), 0)
      uit.push(...sub)
      const rest = waarde - somKinderen
      if (Math.abs(rest) >= 0.005 && id) uit.push({ id, waarde: rest })
    } else if (id) uit.push({ id, waarde })
  }
  return uit
}

const PRIOR: Record<Sectie, 1 | -1> = { revenue: 1, direct_costs: -1, expenses: -1, other_income_expenses: 1 }

/**
 * Teken per sectie zodat de som de netto winst geeft. Alle zestien combinaties worden geprobeerd;
 * bij gelijke fout wint de combinatie die het minst afwijkt van de gebruikelijke (omzet +, kosten −).
 */
export function bepaalTekens(sommen: Record<Sectie, number>, wv: MbRuwWinstVerlies): { tekens: Record<Sectie, 1 | -1>; zeker: boolean } {
  const netto = wv.net_profit !== undefined && wv.net_profit !== null ? bedragUit(wv.net_profit) : null
  const bruto = wv.gross_profit !== undefined && wv.gross_profit !== null ? bedragUit(wv.gross_profit) : null
  const operationeel = wv.operating_profit !== undefined && wv.operating_profit !== null ? bedragUit(wv.operating_profit) : null
  if (netto === null) return { tekens: { ...PRIOR }, zeker: false }
  let beste: { tekens: Record<Sectie, 1 | -1>; fout: number; afwijking: number } | null = null
  for (let m = 0; m < 16; m++) {
    const t: Record<Sectie, 1 | -1> = {
      revenue: m & 1 ? -1 : 1,
      direct_costs: m & 2 ? 1 : -1,
      expenses: m & 4 ? 1 : -1,
      other_income_expenses: m & 8 ? -1 : 1,
    }
    const b = t.revenue * sommen.revenue + t.direct_costs * sommen.direct_costs
    const o = b + t.expenses * sommen.expenses
    const n = o + t.other_income_expenses * sommen.other_income_expenses
    let fout = Math.abs(n - netto)
    if (bruto !== null) fout += Math.abs(b - bruto)
    if (operationeel !== null) fout += Math.abs(o - operationeel)
    const afwijking = (Object.keys(t) as Sectie[]).filter((s) => t[s] !== PRIOR[s]).length
    if (!beste || fout < beste.fout - 0.005 || (Math.abs(fout - beste.fout) <= 0.005 && afwijking < beste.afwijking)) beste = { tekens: t, fout, afwijking }
  }
  if (!beste || beste.fout > 0.5) return { tekens: { ...PRIOR }, zeker: false }
  return { tekens: beste.tekens, zeker: true }
}

export function bouwRegels(
  wv: MbRuwWinstVerlies,
  rekeningen: Map<string, MbRuwGrootboek>,
  indeling: MbIndeling,
): { regels: MbGrootboekRegel[]; nettoWinstMoneybird: number; nettoWinstRuw: number; tekensZeker: boolean } {
  const perSectie = SECTIES.map(({ sectie, veld }) => ({ sectie, regels: plat(sectieRegels(wv[veld])) }))
  const sommen = Object.fromEntries(perSectie.map((s) => [s.sectie, s.regels.reduce((t, r) => t + r.waarde, 0)])) as Record<Sectie, number>
  const { tekens, zeker } = bepaalTekens(sommen, wv)

  // Dezelfde rekening kan (via een restant) twee keer voorkomen; tel dan op.
  const opgeteld = new Map<string, { sectie: Sectie; bijdrage: number }>()
  for (const { sectie, regels } of perSectie) {
    for (const r of regels) {
      const bestaand = opgeteld.get(r.id)
      const bijdrage = tekens[sectie] * r.waarde
      if (bestaand) bestaand.bijdrage += bijdrage
      else opgeteld.set(r.id, { sectie, bijdrage })
    }
  }

  const regels: MbGrootboekRegel[] = []
  for (const [id, { sectie, bijdrage }] of opgeteld) {
    const afgerond = rond(bijdrage)
    if (Math.abs(bijdrage) < 0.005) continue
    const rek = rekeningen.get(id)
    const naam = rek?.name || `Grootboekrekening ${id}`
    const rgsCode = rek?.taxonomy_item?.code?.trim() || null
    const soort = rek?.account_type || sectie
    const d = deelIn({ ledgerAccountId: id, naam, rgsCode, soort }, indeling)
    regels.push({ ledgerAccountId: id, naam, rgsCode, soort, bedrag: bedragVoor(afgerond, { ...d, soort }), ...d, bijdrage: afgerond })
  }
  const volgorde: Record<string, number> = { revenue: 0, direct_costs: 1, expenses: 2, other_income_expenses: 3 }
  regels.sort((a, b) => (volgorde[a.soort] ?? 9) - (volgorde[b.soort] ?? 9) || a.naam.localeCompare(b.naam, 'nl'))
  const nettoRuw = wv.net_profit !== undefined && wv.net_profit !== null ? bedragUit(wv.net_profit) : regels.reduce((s, r) => s + bijdrageVan(r), 0)
  return { regels, nettoWinstMoneybird: rond(nettoRuw), nettoWinstRuw: nettoRuw, tekensZeker: zeker }
}

// ---------------------------------------------------------------------------
// Balans
// ---------------------------------------------------------------------------

const somTop = (lijst: MbRuwRegelWaarde[] | undefined) => (Array.isArray(lijst) ? lijst.reduce((s, r) => s + bedragUit(r?.value), 0) : 0)

function zoekRegel(lijst: MbRuwRegelWaarde[] | undefined, past: (id: string) => boolean, diepte = 0): MbRuwRegelWaarde | null {
  if (!Array.isArray(lijst) || diepte > 8) return null
  for (const r of lijst) {
    if (!r || typeof r !== 'object') continue
    if (r.ledger_account_id !== undefined && r.ledger_account_id !== null && past(String(r.ledger_account_id))) return r
    const kind = zoekRegel(r.children, past, diepte + 1)
    if (kind) return kind
  }
  return null
}

export function ondernemingsvermogen(b: MbRuwBalans | null): { waarde: number | null; viaTotaal: boolean } {
  const credit = b?.credit
  if (!credit) return { waarde: null, viaTotaal: false }
  const eigen = Array.isArray(credit.equity) || Array.isArray(credit.open_years)
    ? somTop(credit.equity) + (Array.isArray(credit.open_years) ? credit.open_years.reduce((s, j) => s + bedragUit(j?.value), 0) : 0)
    : null
  const schulden = somTop(credit.provisions) + somTop(credit.non_current_liabilities) + somTop(credit.current_liabilities)
  const totaal = b?.debit?.total ?? credit.total
  const viaTotaal = totaal !== undefined && totaal !== null ? bedragUit(totaal) - schulden : null
  if (eigen !== null && (viaTotaal === null || Math.abs(eigen - viaTotaal) <= 1)) return { waarde: rond(eigen), viaTotaal: false }
  if (viaTotaal !== null) return { waarde: rond(viaTotaal), viaTotaal: eigen !== null }
  return { waarde: null, viaTotaal: false }
}

function rgsBegint(rek: MbRuwGrootboek | undefined, prefix: string): boolean {
  return Boolean(rek?.taxonomy_item?.code?.startsWith(prefix))
}

export function forStand(b: MbRuwBalans | null, rekeningen: Map<string, MbRuwGrootboek>): number | null {
  const r = zoekRegel(b?.credit?.equity, (id) => {
    const rek = rekeningen.get(id)
    // RGS BEivFirFor (fiscale oudedagsreserve); BEivOdr kende een eerdere versie van deze import.
    return rgsBegint(rek, 'BEivFirFor') || rgsBegint(rek, 'BEivOdr') || normaliseer(rek?.name ?? '').includes('oudedagsreserve')
  })
  return r ? rond(bedragUit(r.value)) : null
}

export function onderhandenWerk(b: MbRuwBalans | null, rekeningen: Map<string, MbRuwGrootboek>): number | null {
  if (!b?.debit) return null
  const past = (id: string) => {
    const rek = rekeningen.get(id)
    // RGS BVrdOwe (onderhanden werk) en BProOnp (onderhanden projecten); BVorOnw kende een eerdere versie.
    return rgsBegint(rek, 'BVrdOwe') || rgsBegint(rek, 'BProOnp') || rgsBegint(rek, 'BVorOnw') || normaliseer(rek?.name ?? '').includes('onderhanden')
  }
  const r = zoekRegel(b.debit.current_assets, past) ?? zoekRegel(b.debit.non_current_assets, past)
  return r ? rond(bedragUit(r.value)) : null
}

/**
 * Meldingen over de oudedagsreserve op de balans. De overname rekent met de stand op 1 januari (beginbalans); de
 * stand op de eindbalans is alleen een controle, want een afname die in Moneybird is geboekt, rekent de engine zelf.
 */
export function forMeldingen(balans: MbJaarImport['balans'], jaar: number, tot: string): Waarschuwing[] {
  const begin = balans.forStandBegin ?? null
  const eind = balans.forStand
  if (eind === null) return []
  if (begin === null) {
    return [
      {
        id: 'mb-for-begin-ontbreekt',
        ernst: 'let-op',
        tekst: `Op de balans van ${datumNl(tot)} staat een oudedagsreserve van ${euro(eind)}, maar op de beginbalans niet. We rekenen met de stand op 1 januari en nemen deze stand daarom niet over. Staat bij de oudedagsreserve nog geen stand, vul dan de stand op 1 januari ${jaar} in: de eindstand uit je aangifte van ${jaar - 1}.`,
      },
    ]
  }
  if (begin === eind) return []
  return [
    {
      id: 'mb-for-mutatie',
      ernst: 'info',
      tekst: `In Moneybird gaat de oudedagsreserve van ${euro(begin)} op 1 januari naar ${euro(eind)} op ${datumNl(tot)}. We rekenen met de stand op 1 januari. Heb je in ${jaar} vrijwillig afgenomen, vul die afname dan in bij de oudedagsreserve; een verplichte afname rekenen we zelf uit. De stand op de eindbalans is je controle: die hoort gelijk te zijn aan de stand na de afname.`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Vaste activa
// ---------------------------------------------------------------------------

const UITGESLOTEN = /(^|[^a-z])(pand|gebouw|grond|woning|kavel)/

function lijktUitgesloten(naam: string): boolean {
  const n = normaliseer(naam)
  return noemtAuto(n) === 'auto' || UITGESLOTEN.test(n)
}

function eersteVeld(o: Record<string, unknown>, velden: string[]): unknown {
  for (const v of velden) if (o[v] !== undefined && o[v] !== null && o[v] !== '') return o[v]
  return undefined
}

export interface ActivaUitkomst {
  investeringen: InvesteringInvoer[]
  desinvesteringen: DesinvesteringInvoer[]
  /** De middelen achter `desinvesteringen`, in dezelfde volgorde (zie MbJaarImport.afgestoten). */
  afgestoten: NonNullable<MbJaarImport['afgestoten']>
  activa: MbJaarImport['activa']
  waarschuwingen: Waarschuwing[]
  /**
   * Afschrijving die Moneybird dit jaar boekte op de bedrijfsmiddelen in `activa` (boekwaarde begin min
   * boekwaarde eind). null als dat niet vast te stellen is, omdat bij een middel het waardeverloop ontbreekt.
   */
  afschrijvingInModule: number | null
}

/** Percentage per jaar waarmee Moneybird afschrijft: (aanschaf − rest) / levensduur, als deel van de aanschafwaarde. */
function pctPerJaar(aanschafwaarde: number, restwaarde: number, levensduur: number): number {
  if (aanschafwaarde <= 0 || levensduur <= 0) return 0
  return Math.max(0, aanschafwaarde - restwaarde) / levensduur / aanschafwaarde
}

const pctTekst = (x: number) => `${Math.round(x * 1000) / 10}%`.replace('.', ',')

/** KIA-percentage en drempels uit de parameters van het investeringsjaar (of het dossierjaar als die er niet zijn). */
function kiaParams(investeringsjaar: number, dossierjaar: number) {
  for (const j of [investeringsjaar, dossierjaar]) {
    try {
      const p = getJaar(j).ondernemer.waarde
      return { pct: p.kia.pct, min: p.kia.minPerBedrijfsmiddel, jaren: p.desinvestering.jaren, eigenJaar: j === investeringsjaar }
    } catch {
      /* volgende */
    }
  }
  return null
}

export function verwerkActiva(ruw: MbRuwActief[], jaar: number, van: string, tot: string, rekeningen: Map<string, MbRuwGrootboek>, vandaag: string): ActivaUitkomst {
  const uit: ActivaUitkomst = { investeringen: [], desinvesteringen: [], afgestoten: [], activa: [], waarschuwingen: [], afschrijvingInModule: 0 }
  let boekwaardeNu = false
  // Fiscale toets op het afschrijvingsplan (alleen meldingen; het register rekent zelf fiscaal).
  const params = paramsVoorActiva(jaar)
  const af = params?.ondernemer.waarde.afschrijving
  const dagVoorVan = `${jaar - 1}-12-31`
  for (const a of ruw) {
    if (!a || typeof a !== 'object') continue
    const naam = (typeof a.name === 'string' && a.name.trim()) || 'Bedrijfsmiddel'
    const aanschaf = isoDatum(a.purchase_date)
    if (!aanschaf || aanschaf > tot) continue
    const waarde = rond(bedragUit(a.purchase_value))
    const rekNaam = a.ledger_account_id ? (rekeningen.get(String(a.ledger_account_id))?.name ?? '') : ''
    const disposal = a.disposal && typeof a.disposal === 'object' ? a.disposal : null
    const disposalDatum = disposal ? isoDatum(eersteVeld(disposal, ['date', 'disposal_date', 'disposed_on', 'disposed_at'])) : null
    const afgestoten = Boolean(disposal) && (disposalDatum === null || disposalDatum <= tot)

    if (aanschaf >= van) {
      const inv: InvesteringInvoer = { omschrijving: naam, datum: aanschaf, bedrag: waarde, regeling: 'kia' }
      if (noemtGoodwill(`${naam} ${rekNaam}`)) {
        inv.uitgesloten = true
        uit.waarschuwingen.push({
          id: `mb-goodwill-${uit.investeringen.length}`,
          ernst: 'info',
          tekst: `"${naam}" is goodwill. Daarover krijg je geen investeringsaftrek, dus deze investering telt niet mee voor de KIA. In het activaregister schrijven we het af als goodwill.`,
        })
      } else if (lijktUitgesloten(`${naam} ${rekNaam}`)) {
        inv.uitgesloten = true
        uit.waarschuwingen.push({
          id: `mb-uitgesloten-${uit.investeringen.length}`,
          ernst: 'let-op',
          tekst: `"${naam}" lijkt een personenauto of onroerend goed. Die zijn uitgesloten van de investeringsaftrek, dus deze investering telt niet mee. Is het bijvoorbeeld een bestelauto, zet uitgesloten dan uit.`,
        })
      } else if (rgsBegint(rekeningen.get(String(a.ledger_account_id ?? '')), 'BMvaTev') || normaliseer(`${naam} ${rekNaam}`).includes('vervoermiddel')) {
        uit.waarschuwingen.push({
          id: `mb-vervoermiddel-${uit.investeringen.length}`,
          ernst: 'let-op',
          tekst: `"${naam}" staat bij de vervoermiddelen. Is het een personenauto, zet dan uitgesloten aan: personenauto's krijgen geen investeringsaftrek.`,
        })
      }
      uit.investeringen.push(inv)
    }

    if (afgestoten && disposalDatum !== null && disposalDatum >= van) {
      const invJaar = Number(aanschaf.slice(0, 4))
      const prijsRuw = disposal ? eersteVeld(disposal, ['sale_price', 'selling_price', 'proceeds', 'price', 'amount']) : undefined
      const verkoopprijs = prijsRuw === undefined ? 0 : rond(bedragUit(prijsRuw))
      if (prijsRuw === undefined) {
        uit.waarschuwingen.push({
          id: `mb-desinvestering-prijs-${uit.desinvesteringen.length}`,
          ernst: 'let-op',
          tekst: `Bij "${naam}" staat in Moneybird geen verkoopprijs. De import rekent met € 0; vul de werkelijke opbrengst in als het bedrijfsmiddel is verkocht.`,
        })
      }
      const kia = kiaParams(invJaar, jaar)
      let genotenPct = 0
      if (kia && jaar - invJaar < kia.jaren && waarde >= kia.min) {
        genotenPct = kia.pct
        uit.waarschuwingen.push({
          id: `mb-desinvestering-kia-${uit.desinvesteringen.length}`,
          ernst: 'let-op',
          tekst: `"${naam}" is binnen ${kia.jaren} jaar na de investering afgestoten. De import gaat uit van ${Math.round(kia.pct * 100)}% investeringsaftrek in ${invJaar}${kia.eigenJaar ? '' : ' (percentage van dit jaar)'}; controleer hoeveel aftrek je toen echt hebt gehad.`,
        })
      }
      uit.desinvesteringen.push({ omschrijving: naam, verkoopprijs, investeringsjaar: invJaar, genotenPct })
      uit.afgestoten.push({ naam, aanschafdatum: aanschaf, aanschafwaarde: waarde, datum: disposalDatum, verkoopprijs, prijsBekend: prijsRuw !== undefined })
    }

    if (afgestoten) continue
    const plan = a.value_change_plan && typeof a.value_change_plan === 'object' ? a.value_change_plan : null
    const levensduurRuw = plan?.lifespan_in_years !== undefined && plan?.lifespan_in_years !== null ? Number(plan.lifespan_in_years) : null
    const levensduur = levensduurRuw !== null && Number.isFinite(levensduurRuw) ? levensduurRuw : null
    const rest = plan?.residual_value !== undefined && plan?.residual_value !== null ? rond(bedragUit(plan.residual_value)) : null
    const bw = boekwaardeOp(a, tot, vandaag)
    if (bw.uitHuidige) boekwaardeNu = true
    const bwBegin = aanschaf > dagVoorVan ? { waarde: waarde, uitHuidige: false } : boekwaardeOp(a, dagVoorVan, vandaag)
    if (bw.uitHuidige || bwBegin.uitHuidige || uit.afschrijvingInModule === null) uit.afschrijvingInModule = null
    else uit.afschrijvingInModule += bwBegin.waarde - bw.waarde
    const index = uit.activa.length
    uit.activa.push({
      naam,
      aanschafdatum: aanschaf,
      aanschafwaarde: waarde,
      boekwaarde: bw.waarde,
      levensduurJaren: levensduur,
      restwaarde: rest,
    })

    if (!af || waarde < af.directAftrekbaarTot) continue
    const goodwill = noemtGoodwill(naam)
    const maxPct = goodwill ? af.goodwillPct : af.maxPctPerJaar
    if (levensduur !== null && levensduur > 0) {
      if (pctPerJaar(waarde, rest ?? 0, levensduur) > maxPct + 1e-9) {
        uit.waarschuwingen.push({
          id: `mb-afschrijving-termijn-${index}`,
          ernst: 'let-op',
          tekst: `Moneybird schrijft "${naam}" af in ${levensduur} jaar; fiscaal mag maximaal ${pctTekst(maxPct)} per jaar${goodwill ? ' voor goodwill' : ''}. In het activaregister rekenen we met de fiscale afschrijving, dus je winst wordt hoger dan in Moneybird.`,
        })
      }
    } else if (Number(aanschaf.slice(0, 4)) + standaardLevensduur(params, goodwill) > jaar) {
      uit.waarschuwingen.push({
        id: `mb-afschrijving-plan-${index}`,
        ernst: 'info',
        tekst: `Bij "${naam}" staat in Moneybird geen afschrijvingsplan. In het activaregister rekenen we met ${standaardLevensduur(params, goodwill)} jaar zonder restwaarde; pas dat aan als het anders moet.`,
      })
    }
  }
  // Afgestoten middelen: de overname koppelt ze aan het activaregister; de meldingen daarover komen uit overnameMeldingen.
  if (uit.activa.length === 0) uit.afschrijvingInModule = null
  else if (uit.afschrijvingInModule !== null) uit.afschrijvingInModule = rond(uit.afschrijvingInModule)
  if (boekwaardeNu) {
    uit.waarschuwingen.push({
      id: 'mb-boekwaarde-huidig',
      ernst: 'info',
      tekst: 'Voor een of meer bedrijfsmiddelen staat in Moneybird geen waardeverloop. De boekwaarde is dan de huidige waarde, niet die aan het eind van dit jaar.',
    })
  }
  return uit
}

/** Boekwaarde op `tot`: aanschafwaarde plus de waardeveranderingen tot en met die datum, anders current_value. */
function boekwaardeOp(a: MbRuwActief, tot: string, vandaag: string): { waarde: number; uitHuidige: boolean } {
  const veranderingen = Array.isArray(a.value_changes) ? a.value_changes.filter((v) => v && typeof v === 'object') : []
  const huidig = a.current_value !== undefined && a.current_value !== null ? bedragUit(a.current_value) : bedragUit(a.purchase_value)
  const totNu = tot >= vandaag
  if (veranderingen.length === 0) return { waarde: rond(huidig), uitHuidige: !totNu }
  const gedateerd = veranderingen
    .map((v) => ({ datum: isoDatum(eersteVeld(v, ['date', 'value_date', 'booked_at', 'created_at'])), bedrag: bedragUit(eersteVeld(v, ['amount', 'value_change', 'value'])) }))
    .filter((v) => v.datum !== null)
  if (gedateerd.length === 0) return { waarde: rond(huidig), uitHuidige: !totNu }
  // Afschrijvingen staan als negatief bedrag of allemaal als positief bedrag; in dat laatste geval aftrekken.
  const metTeken = gedateerd.some((v) => v.bedrag < 0)
  const mutatie = gedateerd.filter((v) => (v.datum as string) <= tot).reduce((s, v) => s + (metTeken ? v.bedrag : -Math.abs(v.bedrag)), 0)
  return { waarde: rond(bedragUit(a.purchase_value) + mutatie), uitHuidige: false }
}

// ---------------------------------------------------------------------------
// Opdrachtgevers en uren
// ---------------------------------------------------------------------------

/** Uren van een tijdregistratie: eind − begin − pauze; alleen afgesloten regels. */
export function urenVan(e: MbRuwUren): number {
  if (!e.ended_at || !e.started_at) return 0
  const begin = Date.parse(e.started_at)
  const eind = Date.parse(e.ended_at)
  if (Number.isNaN(begin) || Number.isNaN(eind) || eind <= begin) return 0
  const pauze = bedragUit(e.paused_duration ?? 0)
  return Math.max(0, (eind - begin) / 3_600_000 - pauze / 3600)
}

// ---------------------------------------------------------------------------
// Hoofdfunctie
// ---------------------------------------------------------------------------

interface Deel<T> {
  waarde: T
  gelukt: boolean
}

async function deel<T>(onderdeel: string, sleutel: string, f: () => Promise<T>, leeg: T, w: Waarschuwing[]): Promise<Deel<T>> {
  try {
    return { waarde: await f(), gelukt: true }
  } catch (e) {
    if (e instanceof MoneybirdFout && e.status === 403) {
      w.push({
        id: `mb-scope-${sleutel}`,
        ernst: 'let-op',
        tekst: `${onderdeel} is overgeslagen: het Moneybird-token mist de scope ${e.scope ?? 'voor dit onderdeel'}. Voeg die scope toe aan het token en importeer opnieuw.`,
      })
      return { waarde: leeg, gelukt: false }
    }
    throw e
  }
}

export interface ImportOpties extends MbOpties {
  /** Bestaande client (tests); anders maakt de import er zelf een. */
  client?: MbClient
}

export async function haalJaarImport(
  token: string,
  administratie: MbAdministratie,
  jaar: number,
  indeling: MbIndeling,
  koppelingId: string,
  nu: Date,
  opties: ImportOpties = {},
): Promise<MbJaarImport> {
  if (!geldigMbId(administratie.id)) throw new ImportFout('Kies eerst een Moneybird-administratie.')
  const huidigJaar = nu.getFullYear()
  if (!Number.isInteger(jaar) || jaar > huidigJaar) throw new ImportFout(`${jaar} is nog niet begonnen; er is nog niets te importeren.`)
  const gedeeltelijk = jaar === huidigJaar
  const van = `${jaar}-01-01`
  const tot = gedeeltelijk ? datumIso(nu) : `${jaar}-12-31`
  const client = opties.client ?? maakClient(token, administratie.id, opties)
  const w: Waarschuwing[] = []

  if (gedeeltelijk) {
    w.push({
      id: 'mb-gedeeltelijk-jaar',
      ernst: 'let-op',
      tekst: `${jaar} is nog niet voorbij: de cijfers lopen tot en met ${tot.split('-').reverse().join('-')}. Maak een prognose voor de rest van het jaar voordat je hier conclusies aan verbindt.`,
    })
  }

  const [rek, wv, balansEind, balansBegin, activaRuw, omzetContact, urenRuw] = await Promise.all([
    deel('De namen en RGS-codes van de grootboekrekeningen', 'settings', () => client.grootboekrekeningen(), [] as MbRuwGrootboek[], w),
    deel('De winst- en verliesrekening', 'winst', () => client.winstEnVerlies(van, tot), null as MbRuwWinstVerlies | null, w),
    deel('De balans', 'balans', () => client.balans(van, tot), null as MbRuwBalans | null, w),
    deel('De beginbalans', 'beginbalans', () => client.balans(`${jaar - 1}-01-01`, `${jaar - 1}-12-31`), null as MbRuwBalans | null, w),
    deel('De vaste activa', 'activa', () => client.activa(), [] as MbRuwActief[], w),
    deel('De omzet per klant', 'omzet-klant', () => client.omzetPerContact(van, tot), [] as MbOmzetContact[], w),
    deel('De urenregistratie', 'uren', () => client.uren(van, tot), [] as MbRuwUren[], w),
  ])
  // Scope 'bank' ontbreekt: één waarschuwing voor de balans is genoeg.
  const beginIdx = w.findIndex((x) => x.id === 'mb-scope-beginbalans')
  if (beginIdx >= 0 && w.some((x) => x.id === 'mb-scope-balans')) w.splice(beginIdx, 1)

  const rekeningen = new Map(rek.waarde.map((r) => [r.id, r]))

  // Winst- en verliesrekening
  let regels: MbGrootboekRegel[] = []
  let nettoWinstMoneybird = 0
  let nettoWinstRuw: number | null = null
  if (wv.waarde) {
    const r = bouwRegels(wv.waarde, rekeningen, indeling)
    regels = r.regels
    nettoWinstMoneybird = r.nettoWinstMoneybird
    nettoWinstRuw = r.nettoWinstRuw
    if (!r.tekensZeker) {
      w.push({
        id: 'mb-tekens',
        ernst: 'let-op',
        tekst: 'De bedragen uit de winst- en verliesrekening tellen niet op tot de netto winst in Moneybird. Controleer per regel of opbrengsten en kosten goed staan.',
      })
    }
  }
  const totalen = berekenTotalen(regels, nettoWinstMoneybird)
  const genegeerd = regels.filter((r) => r.categorie === 'negeren')
  const effectGenegeerd = genegeerd.reduce((s, r) => s + bijdrageVan(r), 0)
  const onverklaard = totalen.verschil - effectGenegeerd
  const tolerantie = Math.max(1, regels.length - genegeerd.length)
  if (Math.abs(onverklaard) > tolerantie) {
    w.push({
      id: 'mb-verschil-winst',
      ernst: 'let-op',
      tekst: `De winst volgens de indeling (${euro(totalen.nettoWinstIndeling)}) wijkt ${euro(Math.abs(totalen.verschil))} af van de netto winst in Moneybird (${euro(totalen.nettoWinstMoneybird)}), en dat komt niet door regels op 'niet meenemen'. Controleer de winst- en verliesrekening in Moneybird.`,
    })
  } else if (genegeerd.length > 0 && totalen.verschil !== 0) {
    w.push({
      id: 'mb-verschil-negeren',
      ernst: 'info',
      tekst: `${genegeerd.length === 1 ? 'Eén regel staat' : `${genegeerd.length} regels staan`} op 'niet meenemen'. Daardoor is de winst volgens de indeling ${euro(Math.abs(totalen.verschil))} ${totalen.verschil > 0 ? 'lager' : 'hoger'} dan de netto winst in Moneybird.`,
    })
  }

  // Balans
  const eind = ondernemingsvermogen(balansEind.waarde)
  const begin = ondernemingsvermogen(balansBegin.waarde)
  if (eind.viaTotaal || begin.viaTotaal) {
    w.push({
      id: 'mb-vermogen-totaal',
      ernst: 'info',
      tekst: 'Het eigen vermogen op de balans sluit niet aan op de activa min de schulden. Het ondernemingsvermogen is daarom berekend als de activa min voorzieningen en schulden.',
    })
  }
  const balans: MbJaarImport['balans'] = {
    ondernemingsvermogenBegin: begin.waarde,
    ondernemingsvermogenEinde: eind.waarde,
    forStand: forStand(balansEind.waarde, rekeningen),
    forStandBegin: forStand(balansBegin.waarde, rekeningen),
    onderhandenWerkBegin: onderhandenWerk(balansBegin.waarde, rekeningen),
    onderhandenWerkEind: onderhandenWerk(balansEind.waarde, rekeningen),
  }

  w.push(...forMeldingen(balans, jaar, tot))

  // Vaste activa
  const act = verwerkActiva(activaRuw.waarde, jaar, van, tot, rekeningen, datumIso(nu))
  w.push(...act.waarschuwingen)
  // Het register vervangt de geboekte afschrijving: waarschuw als de activamodule die niet helemaal verklaart.
  if (act.afschrijvingInModule !== null && Math.abs(totalen.afschrijvingen - act.afschrijvingInModule) > Math.max(1, act.activa.length)) {
    w.push({
      id: 'mb-afschrijving-buiten-module',
      ernst: 'let-op',
      tekst: `In de winst- en verliesrekening staat ${euro(totalen.afschrijvingen)} aan afschrijving, en in de activamodule ${euro(act.afschrijvingInModule)}. Het activaregister vervangt de geboekte afschrijving door de fiscale afschrijving van de bedrijfsmiddelen uit de activamodule. Boek je ook afschrijving buiten de activamodule, voeg die bedrijfsmiddelen dan met de hand toe aan het register.`,
    })
  }

  // Jaarrekening voor het rapport
  const balansRekeningen = new Map<string, BalansRekening>(
    rek.waarde.map((r) => [r.id, { naam: r.name, rgsCode: r.taxonomy_item?.code?.trim() || null, soort: r.account_type }]),
  )
  const jr = bouwJaarrekening({
    begin: balansMoment(balansBegin.waarde),
    eind: balansMoment(balansEind.waarde),
    rekeningen: balansRekeningen,
    activa: act.activa,
    nettoWinst: nettoWinstRuw,
    winstRegels: regels.reduce((s, r) => s + bijdrageVanRegel(r), 0),
    peildatumBegin: `${jaar - 1}-12-31`,
    peildatumEind: tot,
  })
  w.push(...jr.waarschuwingen)
  const jaarrekening = jaarrekeningMetIndeling({ regels, jaarrekening: jr.jaarrekening, priveMutaties: jr.priveMutaties })

  // Uren per contact
  const urenPerContactId = new Map<string, number>()
  let urenTotaal = 0
  let urenRegels = 0
  for (const e of urenRuw.waarde) {
    if (!e || typeof e !== 'object' || !e.ended_at) continue
    const u = urenVan(e)
    urenRegels++
    urenTotaal += u
    const id = e.contact_id === undefined || e.contact_id === null ? '' : String(e.contact_id)
    urenPerContactId.set(id, (urenPerContactId.get(id) ?? 0) + u)
  }

  // Contactnamen (één opvraging per contact, gecachet; 403 betekent: zonder namen verder)
  let namenGeblokkeerd = false
  let namenOnbekend = 0
  const naamVan = async (id: string | null, bekend: string | null): Promise<string> => {
    if (bekend) return bekend
    if (!id) return 'Zonder klant'
    if (!namenGeblokkeerd) {
      try {
        const n = await client.contactNaam(id)
        if (n) return n
        namenOnbekend++
      } catch (e) {
        if (!(e instanceof MoneybirdFout && e.status === 403)) throw e
        namenGeblokkeerd = true
        w.push({
          id: 'mb-scope-contacten',
          ernst: 'info',
          tekst: `De namen van klanten zijn niet opgehaald: het Moneybird-token mist de scope ${e.scope ?? 'voor contacten'}. Klanten staan daarom met hun nummer in de lijst.`,
        })
      }
    }
    return `Klant ${id}`
  }

  // Opdrachtgevers
  let omzetItems = omzetContact.waarde.filter((o) => rond(o.bedrag) !== 0)
  if (omzetItems.reduce((s, o) => s + o.bedrag, 0) < 0) omzetItems = omzetItems.map((o) => ({ ...o, bedrag: -o.bedrag }))
  omzetItems.sort((a, b) => b.bedrag - a.bedrag)
  const opdrachtgevers: OpdrachtgeverInvoer[] = []
  const overige = omzetItems.slice(MAX_OPDRACHTGEVERS - 1)
  const top = omzetItems.length > MAX_OPDRACHTGEVERS ? omzetItems.slice(0, MAX_OPDRACHTGEVERS - 1) : omzetItems
  const namenPerId = new Map<string, string>()
  for (const o of top) {
    const naam = await naamVan(o.contactId, o.naam)
    if (o.contactId) namenPerId.set(o.contactId, naam)
    const og: OpdrachtgeverInvoer = { naam, omzet: rond(o.bedrag) }
    const uren = o.contactId ? urenPerContactId.get(o.contactId) : undefined
    if (uren !== undefined && uren >= 1) og.uurtarief = rond(o.bedrag / uren)
    opdrachtgevers.push(og)
  }
  if (omzetItems.length > MAX_OPDRACHTGEVERS) {
    opdrachtgevers.push({ naam: 'Overige klanten', omzet: rond(overige.reduce((s, o) => s + o.bedrag, 0)) })
  }

  // Uren
  let uren: MbJaarImport['uren'] = null
  if (urenRuw.gelukt && urenRegels > 0) {
    const perContact: Record<string, number> = {}
    const gesorteerd = [...urenPerContactId.entries()].sort((a, b) => b[1] - a[1])
    for (const [id, u] of gesorteerd) {
      const naam = id ? (namenPerId.get(id) ?? (await naamVan(id, null))) : 'Zonder klant'
      perContact[naam] = rond((perContact[naam] ?? 0) + u)
    }
    uren = { totaal: rond(urenTotaal), perContact }
  }
  if (namenOnbekend > 0) {
    w.push({
      id: 'mb-namen-grens',
      ernst: 'info',
      tekst: `Van ${namenOnbekend === 1 ? 'één klant' : `${namenOnbekend} klanten`} is de naam niet opgehaald (grens op het aantal verzoeken naar Moneybird). Die staan met hun nummer in de lijst.`,
    })
  }

  for (const pad of client.afgekapt) {
    w.push({
      id: `mb-afgekapt-${pad.replace(/[^a-z_]/g, '')}`,
      ernst: 'let-op',
      tekst: 'Moneybird gaf meer gegevens dan de import ophaalt (meer dan 5.000 regels). De lijst is mogelijk niet compleet.',
    })
  }

  return {
    koppelingId,
    administratie,
    jaar,
    opgehaaldOp: nu.toISOString(),
    regels,
    totalen,
    balans,
    investeringen: act.investeringen,
    desinvesteringen: act.desinvesteringen,
    afgestoten: act.afgestoten,
    activa: act.activa,
    opdrachtgevers,
    uren,
    ...(jaarrekening ? { jaarrekening } : {}),
    ...(jr.priveMutaties ? { priveMutaties: jr.priveMutaties } : {}),
    waarschuwingen: w,
  }
}
