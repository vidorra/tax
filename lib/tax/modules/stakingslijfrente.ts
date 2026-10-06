/**
 * Ronde 2 (A6): stakingslijfrente (art. 3.129 en 3.130 lid 2; art. 10a.29 lid 13) en de Zvw-correctie.
 *
 *   grondslag     = Σ StakingUitkomst.totaal van de ondernemingen die (gedeeltelijk) zijn gestaakt
 *                   ("winst behaald met of bij die staking": vóór stakingsaftrek en MKB-winstvrijstelling)
 *   categorie     = invoer, anders uit de leeftijd op de stakingsdatum: hoog als de AOW-datum binnen
 *                   `hoogBinnenJarenVoorAow` jaar ligt, midden binnen `middenBinnenJarenVoorAow` jaar, anders laag
 *   voorzieningen = pensioenaanspraken + eerder afgetrokken lijfrentepremies (standaard: de som van `alGebruikt` uit de
 *                   lijfrentehistorie, een benadering) + eerdere stakingslijfrenten + FOR aan het begin van het jaar
 *                   + eerdere FOR-omzettingen
 *   ruimte        = min(grondslag, max(0, maximum − voorzieningen))
 *   aftrek        = min(premie, ruimte); een premie betaald later dan `betaaltermijnMaanden` na het jaar telt niet mee
 * De aftrek is een uitgave voor inkomensvoorzieningen, naast de jaarruimte (telt op bij `InkomensvoorzieningResultaat.totaal`).
 *
 * Zvw (HR 23-11-2018, ECLI:NL:HR:2018:2175; HR 4-2-2022, 21/01274): in het stakingsjaar gaat het bijdrage-inkomen
 * omlaag met min(stakingslijfrenteaftrek + aftrek FOR-omzetting, FOR-vrijval), niet voor de overige stakingswinst.
 * Voor de aangifte splitst de uitkomst de premie: `uitFor` = min(aftrek, max(0, FOR-vrijval − aftrek FOR-omzetting))
 * ("betaalde uit de oudedagsreserve, bij staking") en `uitStakingswinst` = premie − uitFor ("uit alleen de stakingswinst").
 * Puur: geen I/O.
 */
import type { InkomensvoorzieningResultaat, LijfrenteHistorieJaar, OndernemingResultaat, StakingslijfrenteInvoer, StakingslijfrenteUitkomst, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { eur, euro, regel, waarschuwing, datumNL } from '../uitleg'
import { isoDatum, parseDatum } from '../datum'

export type StakingslijfrenteCategorie = StakingslijfrenteUitkomst['categorie']

/** Plus `jaren` jaar (ISO). */
function plusJaren(iso: string, jaren: number): string {
  const d = parseDatum(iso)
  return isoDatum(new Date(Date.UTC(d.getUTCFullYear() + jaren, d.getUTCMonth(), d.getUTCDate())))
}

/** Plus `maanden` maanden (ISO). */
function plusMaanden(iso: string, maanden: number): string {
  const d = parseDatum(iso)
  return isoDatum(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + maanden, d.getUTCDate())))
}

/** Categorie uit de AOW-datum en de stakingsdatum (art. 3.129 lid 2; arbeidsongeschiktheid en overlijden vult de gebruiker zelf in). */
export function stakingslijfrenteCategorie(aowDatum: string, stakingsdatum: string, params: TaxYearParams): StakingslijfrenteCategorie {
  const r = params.inkomensvoorziening.waarde.stakingslijfrenteRegels
  if (aowDatum <= plusJaren(stakingsdatum, r.hoogBinnenJarenVoorAow)) return 'hoog'
  if (aowDatum <= plusJaren(stakingsdatum, r.middenBinnenJarenVoorAow)) return 'midden'
  return 'laag'
}

/** Standaard voor de eerder afgetrokken lijfrentepremies: de som van `alGebruikt` in de lijfrentehistorie (benadering). */
export const eerderAfgetrokkenUitHistorie = (historie: LijfrenteHistorieJaar[] | undefined): number => (historie ?? []).reduce((s, h) => s + Math.max(0, h.alGebruikt), 0)

export interface StakingslijfrenteContext {
  params: TaxYearParams
  jaar: number
  /** Persoonlijke AOW-datum. */
  aowDatum: string
  /** De ondernemingen van de persoon met hun uitkomst (staking en FOR). */
  ondernemingen: OndernemingResultaat[]
  /** Datum van de staking per onderneming (zelfde volgorde), voor de categorie; ontbreekt = 31 december. */
  stakingsdatums: Array<string | undefined>
  historie?: LijfrenteHistorieJaar[]
  /** Aftrek voor omzetting van de FOR (art. 3.128 tekst 2022) van dit jaar. */
  forOmzettingAftrek: number
}

export interface StakingslijfrenteResultaat {
  uitkomst: StakingslijfrenteUitkomst | null
  aftrek: number
  /** Verlaging van het bijdrage-inkomen Zvw (0 zonder staking met FOR-vrijval). */
  zvwCorrectieFor: number
  /** FOR-vrijval van dit jaar door staking, voor de uitleg van de Zvw-correctie. */
  forVrijval: number
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

/** Soorten staking waarbij een stakingslijfrente kan (art. 3.129: staking van de onderneming of een deel ervan). */
const MET_STAKINGSLIJFRENTE = new Set(['geheel', 'gedeeltelijk'])

export function berekenStakingslijfrente(inv: StakingslijfrenteInvoer | undefined, ctx: StakingslijfrenteContext): StakingslijfrenteResultaat {
  const ip = ctx.params.inkomensvoorziening.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const gestaakt = ctx.ondernemingen.map((o, i) => ({ o, i })).filter(({ o }) => o.staking && MET_STAKINGSLIJFRENTE.has(o.staking.soort))
  const grondslag = gestaakt.reduce((s, { o }) => s + Math.max(0, o.staking!.totaal), 0)
  // FOR-vrijval bij staking (ook geruisloze inbreng en doorschuiving): verplichte en vrijwillige afname in dit jaar.
  const forVrijval = ctx.ondernemingen.filter((o) => o.staking).reduce((s, o) => s + Math.max(0, o.verplichteForAfname) + Math.max(0, o.forVrijwilligeAfname ?? 0), 0)
  const leeg = (aftrek = 0): StakingslijfrenteResultaat => {
    const zvwCorrectieFor = forVrijval > 0 ? Math.min(aftrek + Math.max(0, ctx.forOmzettingAftrek), forVrijval) : 0
    return { uitkomst: null, aftrek, zvwCorrectieFor, forVrijval, uitleg, waarschuwingen }
  }

  if (gestaakt.length === 0) {
    if (inv && inv.premie > 0) {
      waarschuwingen.push(
        waarschuwing(
          'stakingslijfrente.geenStaking',
          'let-op',
          'Een premie voor een stakingslijfrente is alleen aftrekbaar in het jaar waarin je je onderneming (of een deel ervan) staakt. Vul de staking in bij de onderneming, of zet de premie bij je gewone lijfrentepremies.',
        ),
      )
    }
    return leeg()
  }

  const datum = gestaakt.map(({ i }) => ctx.stakingsdatums[i]).find((d) => d !== undefined) ?? `${ctx.jaar}-12-31`
  const categorie = inv?.categorie ?? stakingslijfrenteCategorie(ctx.aowDatum, datum, ctx.params)
  const maximum = ip.stakingslijfrente[categorie]
  const uitHistorie = inv?.eerderAfgetrokkenLijfrentepremies === undefined
  const eerderAfgetrokken = inv?.eerderAfgetrokkenLijfrentepremies ?? eerderAfgetrokkenUitHistorie(ctx.historie)
  const forBegin = ctx.ondernemingen.reduce((s, o) => s + Math.max(0, o.forStandBegin ?? 0), 0)
  const delen = {
    pensioen: Math.max(0, inv?.waardePensioenaanspraken ?? 0),
    lijfrente: Math.max(0, eerderAfgetrokken),
    staking: Math.max(0, inv?.eerdereStakingslijfrenten ?? 0),
    forBegin,
    omzettingen: Math.max(0, inv?.eerdereForOmzettingen ?? 0),
  }
  const voorzieningen = delen.pensioen + delen.lijfrente + delen.staking + delen.forBegin + delen.omzettingen
  const ruimte = Math.min(grondslag, Math.max(0, maximum - voorzieningen))

  // Premie: betaald binnen de termijn na het stakingsjaar telt op verzoek mee in dat jaar (art. 3.130 lid 2).
  let premie = Math.max(0, inv?.premie ?? 0)
  const uiterlijk = plusMaanden(`${ctx.jaar + 1}-01-01`, ip.stakingslijfrenteRegels.betaaltermijnMaanden)
  if (premie > 0 && inv?.betaaldOp && inv.betaaldOp >= uiterlijk) {
    waarschuwingen.push(
      waarschuwing(
        'stakingslijfrente.teLaat',
        'let-op',
        `De premie voor de stakingslijfrente is betaald op ${datumNL(inv.betaaldOp)}. Alleen een premie die je uiterlijk ${ip.stakingslijfrenteRegels.betaaltermijnMaanden} maanden na het einde van ${ctx.jaar} betaalt, telt mee in ${ctx.jaar}. Deze premie tellen we niet mee.`,
      ),
    )
    premie = 0
  }
  const aftrek = Math.min(premie, ruimte)
  if (premie > ruimte) {
    waarschuwingen.push(
      waarschuwing(
        'stakingslijfrente.teVeel',
        'let-op',
        `Je stakingslijfrentepremie (${euro(premie)}) is hoger dan de ruimte voor een stakingslijfrente (${euro(ruimte)}). Het meerdere (${euro(premie - ruimte)}) is hier niet aftrekbaar; past het in je jaar- of reserveringsruimte, tel het dan bij je gewone lijfrentepremies op.`,
      ),
    )
  }
  if (uitHistorie && eerderAfgetrokken > 0) {
    waarschuwingen.push(
      waarschuwing(
        'stakingslijfrente.benadering',
        'info',
        `Voor de eerder afgetrokken lijfrentepremies nemen we wat in je lijfrentehistorie als gebruikt staat (${euro(eerderAfgetrokken)}). Dat is een benadering: het gaat om alle premies die je ooit op grond van je jaar- en reserveringsruimte aftrok. Vul het bedrag in als je het weet.`,
      ),
    )
  }

  uitleg.push(
    regel('stakingslijfrente.ruimte', 'Ruimte voor een stakingslijfrente', ruimte, 'info', {
      niveau: 2,
      formule: `min(stakingswinst ${eur(grondslag)}, maximum ${eur(maximum)} (${categorie}) − voorzieningen ${eur(voorzieningen)})`,
      parameter: `inkomensvoorziening.stakingslijfrente.${categorie}`,
    }),
  )
  if (aftrek > 0) {
    uitleg.push(regel('stakingslijfrente.aftrek', 'Premie stakingslijfrente', aftrek, 'min', { niveau: 1, formule: `${eur(aftrek)} van ${eur(premie)}, naast de jaarruimte` }))
  }
  const zvwCorrectieFor = forVrijval > 0 ? Math.min(aftrek + Math.max(0, ctx.forOmzettingAftrek), forVrijval) : 0
  // Splitsing voor de aangifte: het deel uit de vrijval van de oudedagsreserve (na de FOR-omzetting) en de rest.
  const uitFor = Math.min(aftrek, Math.max(0, forVrijval - Math.max(0, ctx.forOmzettingAftrek)))
  return {
    uitkomst: { categorie, maximum, voorzieningen, ruimte, premie, aftrek, uitFor, uitStakingswinst: premie - uitFor },
    aftrek,
    zvwCorrectieFor,
    forVrijval,
    uitleg,
    waarschuwingen,
  }
}

/**
 * Zet de stakingslijfrente in de uitkomst van de inkomensvoorziening: de aftrek telt op bij `totaal` (vóór box 1), de
 * uitleg komt vóór de totaalregel en de meldingen erbij. Wijzigt `iv` ter plekke (een nieuw object van de engine).
 */
export function voegStakingslijfrenteToe(iv: InkomensvoorzieningResultaat, sl: StakingslijfrenteResultaat): void {
  if (sl.uitkomst) iv.stakingslijfrente = sl.uitkomst
  iv.waarschuwingen.push(...sl.waarschuwingen)
  if (sl.uitleg.length === 0) return
  iv.totaal += sl.aftrek
  const i = iv.uitleg.findIndex((r) => r.id === 'inkomensvoorziening.totaal')
  if (i >= 0) {
    iv.uitleg.splice(i, 0, ...sl.uitleg)
    iv.uitleg[i + sl.uitleg.length] = { ...iv.uitleg[i + sl.uitleg.length], bedrag: iv.totaal }
  } else {
    iv.uitleg.push(...sl.uitleg)
  }
}
