/**
 * Bijtelling privégebruik auto van de zaak (IB-ondernemer) en de btw-correctie privégebruik.
 *
 * Bijtelling, per maand van het belastingjaar dat de auto ter beschikking staat (`terBeschikkingSinds` tot en met
 * `terBeschikkingTot`; zonder datums het hele jaar):
 *  - youngtimer (vanaf de maand na de maand waarin de auto youngtimerLeeftijd jaar oud wordt): youngtimerPct × dagwaarde.
 *    De Belastingdienst rekent per dag (vanaf de dag dat de auto ouder is); deze berekening per maand.
 *  - nulemissie binnen termijnMaanden na de maand van eerste toelating: tabelpercentage van het toelatingsjaar over de
 *    cataloguswaarde tot de cap, het algemene percentage daarboven
 *  - anders (fossiel of na de termijn): bijtellingAlgemeen × cataloguswaarde
 * Overgangsrecht youngtimer (`youngtimerOvergang`, ronde 2): een auto die op `youngtimerOp` al ouder was dan
 * `oudeLeeftijd` jaar en uiterlijk op `terBeschikkingUiterlijk` ter beschikking stond, is het hele jaar youngtimer.
 * Het is een goedkeuring en dus een keuze: we rekenen beide regimes en nemen de laagste bijtelling. Zonder
 * `terBeschikkingSinds` nemen we in het eerste jaar na `terBeschikkingUiterlijk` aan dat de auto er al was; later niet.
 * Eigen bijdrage eraf (art. 3.20 lid 4). Nooit hoger dan de autokosten, plus de btw-correctie als die niet in de
 * autokosten zit. Nul bij hooguit priveKmGrens privékilometers met een sluitende rittenregistratie.
 *
 * Btw-correctie privégebruik (alleen met `auto.btw`; goedkeuring van de Belastingdienst):
 *   geen btw-aftrek op de kosten (KOR, vrijgesteld)                      0, reden 'geen-aftrek'
 *   jaarIngebruikname = btw.jaarIngebruikname ?? jaar van terBeschikkingSinds ?? aanschafjaar uit het register
 *   forfait     pct = btw bij aanschaf afgetrokken en jaar ≤ jaarIngebruikname + verlaagdNaJaren ? standaard : verlaagd
 *               correctie = pct × catalogus × maanden ter beschikking / 12
 *   kilometers  correctie = btwOpKosten × privékilometers (met woon-werk) / totaal
 *   maximum     btwOpKosten + (jaar ≤ jaarIngebruikname + verlaagdNaJaren − 1 ? btwBijAanschaf / 5 : 0); zonder btwOpKosten geen maximum
 * De correctie is een autokost; zit ze niet in de autokosten (`zitInSaldo(btw.inAutokosten, onderneming, 'autoBtw')`),
 * dan gaat ze van de winst af (`btwCorrectieAfgetrokken`) en telt ze mee in het plafond.
 */
import type { AutoInvoer, AutoUitkomst, OndernemingInvoer, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { isoDatum, leeftijdOp, parseDatum } from '../../datum'
import { datumNL, eur, euro, pct, regel, waarschuwing } from '../../uitleg'
import { zitInSaldo } from './in-saldo'

export interface BijtellingAutoResultaat {
  bijtelling: number
  /** Bijtelling vóór de eigen bijdrage en de begrenzing op de autokosten. */
  bruto: number
  soort: 'geen' | 'youngtimer' | 'nulEmissie' | 'algemeen' | 'gemengd'
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
  /** Ronde 2 (A6): de hele uitkomst met de btw-correctie (OndernemingResultaat.auto). */
  uitkomst: AutoUitkomst
}

export interface AutoContext {
  params: TaxYearParams
  jaar: number
  prefix?: string
  /** Onderneming: `winstBron` (zit de btw-correctie in de autokosten?) en het register (jaar van ingebruikname). */
  onderneming?: Pick<OndernemingInvoer, 'winstBron' | 'activa'>
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const jaarVan = (iso: string) => parseDatum(iso).getUTCFullYear()
const LAATSTE_MAAND = 11

/** Eerste en laatste maand (0..11) van dit jaar waarin de auto ter beschikking staat; leeg als van > tot. */
export function maandenTerBeschikking(auto: Pick<AutoInvoer, 'terBeschikkingSinds' | 'terBeschikkingTot'>, jaar: number): { van: number; tot: number; aantal: number } {
  let van = 0
  let tot = LAATSTE_MAAND
  if (auto.terBeschikkingSinds) {
    const j = jaarVan(auto.terBeschikkingSinds)
    if (j > jaar) van = 12
    else if (j === jaar) van = parseDatum(auto.terBeschikkingSinds).getUTCMonth()
  }
  if (auto.terBeschikkingTot) {
    const j = jaarVan(auto.terBeschikkingTot)
    if (j < jaar) tot = -1
    else if (j === jaar) tot = parseDatum(auto.terBeschikkingTot).getUTCMonth()
  }
  return { van, tot, aantal: Math.max(0, tot - van + 1) }
}

/** Datum `jaren` jaar na een ISO-datum (29 februari wordt 1 maart in een gewoon jaar). */
function plusJaren(iso: string, jaren: number): string {
  const d = parseDatum(iso)
  return isoDatum(new Date(Date.UTC(d.getUTCFullYear() + jaren, d.getUTCMonth(), d.getUTCDate())))
}

/** Eerste maand (index sinds jaar 0) waarin de auto youngtimer is: de maand na de maand waarin hij de leeftijd bereikt. */
export function youngtimerMaandIndex(datumEersteToelating: string, leeftijd: number): number {
  const t = parseDatum(datumEersteToelating)
  return (t.getUTCFullYear() + leeftijd) * 12 + t.getUTCMonth() + 1
}

/** Eerste dag waarop de auto in dit jaar youngtimer wordt, of undefined als dat niet in dit jaar valt. */
export function youngtimerVanafInJaar(datumEersteToelating: string, params: TaxYearParams, jaar: number): string | undefined {
  const idx = youngtimerMaandIndex(datumEersteToelating, params.ondernemer.waarde.auto.youngtimerLeeftijd)
  if (idx < jaar * 12 || idx > jaar * 12 + LAATSTE_MAAND) return undefined
  const maand = idx - jaar * 12 + 1
  return `${jaar}-${String(maand).padStart(2, '0')}-01`
}

/** "mei 2026" voor de eerste dag van een maand. */
export const maandJaar = (iso: string): string => `${MAANDEN[parseDatum(iso).getUTCMonth()]} ${parseDatum(iso).getUTCFullYear()}`

/**
 * Overgangsrecht youngtimer: kan het gelden voor deze auto (al ouder dan `oudeLeeftijd` op `youngtimerOp`), en stond
 * hij op tijd ter beschikking? null als er in dit jaar geen overgangsrecht is of de auto er niet onder valt.
 */
export function youngtimerOvergang(auto: Pick<AutoInvoer, 'datumEersteToelating' | 'terBeschikkingSinds'>, params: TaxYearParams, jaar: number): NonNullable<AutoUitkomst['overgang']> | null {
  const og = params.ondernemer.waarde.auto.youngtimerOvergang
  if (!og || !auto.datumEersteToelating) return null
  if (!(plusJaren(auto.datumEersteToelating, og.oudeLeeftijd) < og.youngtimerOp)) return null
  if (auto.terBeschikkingSinds) return { terBeschikking: auto.terBeschikkingSinds <= og.terBeschikkingUiterlijk ? 'ja' : 'nee' }
  return { terBeschikking: jaar === jaarVan(og.terBeschikkingUiterlijk) + 1 ? 'aangenomen' : 'onbekend' }
}

/**
 * Geen bijtelling: een sluitende rittenregistratie met niet meer dan `priveKmGrens` privékilometers. De dagwaarde
 * (youngtimer) en de cataloguswaarde spelen dan geen rol; de engine geeft soort 'geen' (de btw-correctie loopt wel door).
 */
export function zonderBijtellingDoorRitten(auto: Pick<AutoInvoer, 'rittenregistratie' | 'priveKm'>, params: TaxYearParams): boolean {
  return Boolean(auto.rittenregistratie) && auto.priveKm !== undefined && auto.priveKm <= params.ondernemer.waarde.auto.priveKmGrens
}

/** Jaar waarin de ondernemer de auto ging gebruiken: invoer, dan terBeschikkingSinds, dan een auto in het register. */
export function jaarIngebruikname(auto: AutoInvoer, activa?: OndernemingInvoer['activa']): number | null {
  if (auto.btw?.jaarIngebruikname !== undefined) return auto.btw.jaarIngebruikname
  if (auto.terBeschikkingSinds) return jaarVan(auto.terBeschikkingSinds)
  const inRegister = (activa ?? []).find((a) => /auto/i.test(a.omschrijving) && a.aanschafdatum)
  return inRegister ? jaarVan(inRegister.aanschafdatum) : null
}

/** Btw-correctie privégebruik met de uitleg (zonder `auto.btw`: 0 en null). */
export function berekenBtwCorrectie(
  auto: AutoInvoer,
  ctx: AutoContext,
): { correctie: number; detail: AutoUitkomst['btwDetail']; formule: string; waarschuwingen: Waarschuwing[] } {
  const b = auto.btw
  const prefix = ctx.prefix ?? 'onderneming'
  const waarschuwingen: Waarschuwing[] = []
  if (!b) return { correctie: 0, detail: null, formule: '', waarschuwingen }
  const bp = ctx.params.ondernemer.waarde.auto.btwPrive
  const { aantal: maanden } = maandenTerBeschikking(auto, ctx.jaar)
  if (b.aftrekOpKosten === false) {
    return { correctie: 0, detail: { pct: null, maanden, maximum: null, jaarIngebruikname: null, reden: 'geen-aftrek' }, formule: 'je trekt geen btw af op deze auto: geen correctie', waarschuwingen }
  }
  const jaarIn = jaarIngebruikname(auto, ctx.onderneming?.activa)
  let bruto = 0
  let p: number | null = null
  let reden: NonNullable<AutoUitkomst['btwDetail']>['reden']
  let formule: string
  if (b.methode === 'kilometers') {
    reden = 'kilometers'
    const km = b.priveKmInclWoonWerk ?? 0
    const totaal = b.totaalKm ?? 0
    if (b.btwOpKosten === undefined || totaal <= 0) {
      waarschuwingen.push(waarschuwing(`${prefix}.auto.btwKm`, 'let-op', 'Vul voor de btw-correctie met kilometers de btw op de autokosten, de privékilometers (met woon-werk) en het totaal aantal kilometers in.'))
    } else {
      bruto = (b.btwOpKosten * Math.min(km, totaal)) / totaal
    }
    formule = `btw op de kosten ${eur(b.btwOpKosten ?? 0)} × ${eur(km)} privé (met woon-werk) / ${eur(totaal)} km`
  } else {
    const verlaagd = !b.aftrekBijAanschaf || (jaarIn !== null && ctx.jaar > jaarIn + bp.verlaagdNaJaren)
    p = verlaagd ? bp.verlaagdPct : bp.standaardPct
    reden = !b.aftrekBijAanschaf || jaarIn !== null ? (verlaagd ? 'forfait-verlaagd' : 'forfait') : 'onbekend-jaar'
    if (reden === 'onbekend-jaar') {
      waarschuwingen.push(
        waarschuwing(
          `${prefix}.auto.btwJaar`,
          'let-op',
          `Vul in welk jaar je de auto in gebruik nam. Zonder dat jaar rekenen we met ${pct(bp.standaardPct, 1)}; later dan ${bp.verlaagdNaJaren} jaar na dat jaar is het ${pct(bp.verlaagdPct, 1)}.`,
        ),
      )
    }
    bruto = (p * auto.cataloguswaarde * maanden) / 12
    formule = `${pct(p, 1)} × catalogus ${eur(auto.cataloguswaarde)}${maanden < 12 ? ` × ${maanden}/12` : ''}${!b.aftrekBijAanschaf ? ' (geen btw afgetrokken bij aankoop)' : verlaagd ? ` (later dan ${bp.verlaagdNaJaren} jaar na ${jaarIn})` : ''}`
  }
  const eersteJaren = jaarIn !== null && ctx.jaar <= jaarIn + bp.verlaagdNaJaren - 1
  // Herzieningstermijn van de aanschaf-btw: het jaar van ingebruikname plus `verlaagdNaJaren` jaar (vijf jaar); per jaar
  // telt dus een vijfde van de btw bij aankoop mee in het maximum.
  const herzieningsjaren = bp.verlaagdNaJaren + 1
  const maximum = b.btwOpKosten !== undefined ? b.btwOpKosten + (eersteJaren && b.btwBijAanschaf ? b.btwBijAanschaf / herzieningsjaren : 0) : null
  if (maximum === null && b.methode === 'forfait') {
    waarschuwingen.push(
      waarschuwing(`${prefix}.auto.btwMax`, 'info', 'De btw-correctie is nooit hoger dan de btw die je dit jaar op de autokosten aftrok (in de eerste jaren plus een vijfde van de btw bij aankoop). Vul die btw in, dan toetsen we het maximum.'),
    )
  }
  let correctie = maximum !== null ? Math.min(bruto, maximum) : bruto
  if (maximum !== null && maximum < bruto) formule += `, maximaal ${eur(maximum)} (btw op de kosten${eersteJaren && b.btwBijAanschaf ? ` plus een vijfde van ${eur(b.btwBijAanschaf)}` : ''})`
  correctie = Math.max(0, AFRONDING.btwPrive(correctie))
  return { correctie, detail: { pct: p, maanden, maximum: maximum === null ? null : AFRONDING.btwPrive(maximum), jaarIngebruikname: jaarIn, reden }, formule, waarschuwingen }
}

interface Regime {
  bruto: number
  soort: BijtellingAutoResultaat['soort']
  formule: string
  maandenYoungtimer: number
}

export function berekenBijtellingAuto(auto: AutoInvoer, ctx: AutoContext): BijtellingAutoResultaat {
  const a = ctx.params.ondernemer.waarde.auto
  const prefix = ctx.prefix ?? 'onderneming'
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const id = `${prefix}.bijtellingAuto`
  const jaar = ctx.jaar

  // Btw-correctie: ook bij een rittenregistratie (voor de btw is woon-werk privé).
  const btw = berekenBtwCorrectie(auto, ctx)
  waarschuwingen.push(...btw.waarschuwingen)
  const btwInAutokosten = auto.btw ? zitInSaldo(auto.btw.inAutokosten, ctx.onderneming, 'autoBtw') : true
  const btwCorrectieAfgetrokken = btwInAutokosten ? 0 : btw.correctie
  const autokosten = Math.max(0, auto.autokosten)
  const plafond = autokosten + btwCorrectieAfgetrokken
  const eigenBijdrage = Math.max(0, auto.eigenBijdrage ?? 0)
  if (auto.btw) {
    uitleg.push(
      regel(`${prefix}.auto.btw`, 'Btw-correctie privégebruik auto', btw.correctie, 'info', {
        niveau: 2,
        formule: `${btw.formule}${btw.correctie > 0 ? (btwInAutokosten ? '; zit in de autokosten' : '; zit niet in de autokosten en gaat van de winst af') : ''}`,
        parameter: 'ondernemer.auto.btwPrive',
      }),
    )
  }
  const overgang = youngtimerOvergang(auto, ctx.params, jaar)
  const basisUitkomst = { btwCorrectie: btw.correctie, btwCorrectieAfgetrokken, btwDetail: btw.detail, autokosten, btwInAutokosten, ...(overgang ? { overgang } : {}) }

  if (zonderBijtellingDoorRitten(auto, ctx.params) && auto.priveKm !== undefined) {
    uitleg.push(
      regel(id, 'Bijtelling privégebruik auto', 0, 'info', {
        formule: `${eur(auto.priveKm)} privékilometers (niet meer dan ${eur(a.priveKmGrens)}) met rittenregistratie`,
        parameter: 'ondernemer.auto.priveKmGrens',
      }),
    )
    return { bijtelling: 0, bruto: 0, soort: 'geen', uitleg, waarschuwingen, uitkomst: { soort: 'geen', bruto: 0, eigenBijdrage, plafond, bijtelling: 0, overgangsrecht: false, ...basisUitkomst } }
  }

  const leeftijd = leeftijdOp(auto.datumEersteToelating, `${jaar}-01-01`)
  const cw = auto.cataloguswaarde
  const toelating = parseDatum(auto.datumEersteToelating)
  const toelatingsjaar = toelating.getUTCFullYear()
  const youngtimerIdx = youngtimerMaandIndex(auto.datumEersteToelating, a.youngtimerLeeftijd)
  // De verlaagde nulemissiebijtelling loopt vanaf de maand na de eerste toelating (maandindex sinds jaar 0).
  const startIdx = toelatingsjaar * 12 + toelating.getUTCMonth() + 1
  const eindIdx = startIdx + a.termijnMaanden // exclusief
  const tabel = a.bijtellingNulEmissiePerToelatingsjaar[String(toelatingsjaar)]
  const algemeen = a.bijtellingAlgemeen * cw
  const verlaagd = tabel ? (tabel.cap > 0 ? tabel.pct * Math.min(cw, tabel.cap) + a.bijtellingAlgemeen * Math.max(0, cw - tabel.cap) : tabel.pct * cw) : algemeen
  const youngtimer = auto.dagwaarde !== undefined ? a.youngtimerPct * auto.dagwaarde : 0
  const periode = maandenTerBeschikking(auto, jaar)

  const reken = (heelJaarYoungtimer: boolean): Regime => {
    let maandenYoungtimer = 0
    let maandenVerlaagd = 0
    let maandenAlgemeen = 0
    for (let m = periode.van; m <= periode.tot; m++) {
      const idx = jaar * 12 + m
      if (auto.dagwaarde !== undefined && (heelJaarYoungtimer || idx >= youngtimerIdx)) maandenYoungtimer += 1
      else if (auto.nulEmissie && tabel && idx >= startIdx && idx < eindIdx) maandenVerlaagd += 1
      else maandenAlgemeen += 1
    }
    const bruto = (youngtimer * maandenYoungtimer + verlaagd * maandenVerlaagd + algemeen * maandenAlgemeen) / 12
    const totaal = maandenYoungtimer + maandenVerlaagd + maandenAlgemeen
    const deel = totaal < 12 ? ` (${totaal} maanden ter beschikking)` : ''
    let soort: Regime['soort']
    let formule: string
    if (totaal === 0) {
      soort = 'geen'
      formule = 'de auto stond dit jaar niet ter beschikking'
    } else if (maandenYoungtimer === totaal) {
      soort = 'youngtimer'
      formule = `youngtimer (${leeftijd} jaar${heelJaarYoungtimer && youngtimerIdx > jaar * 12 ? ', overgangsrecht' : ''}): ${pct(a.youngtimerPct)} × dagwaarde ${eur(auto.dagwaarde ?? 0)}${deel}`
    } else if (maandenVerlaagd === totaal) {
      soort = 'nulEmissie'
      formule =
        tabel && tabel.cap > 0 && cw > tabel.cap
          ? `${pct(tabel.pct)} × ${eur(tabel.cap)} + ${pct(a.bijtellingAlgemeen)} × ${eur(cw - tabel.cap)} (nulemissie, eerste toelating ${toelatingsjaar})${deel}`
          : `${pct(tabel!.pct)} × ${eur(cw)} (nulemissie, eerste toelating ${toelatingsjaar})${deel}`
    } else if (maandenYoungtimer > 0 || maandenVerlaagd > 0) {
      soort = 'gemengd'
      const delen: string[] = []
      if (maandenYoungtimer > 0) delen.push(`${maandenYoungtimer} maanden youngtimer (${pct(a.youngtimerPct)} × dagwaarde ${eur(auto.dagwaarde ?? 0)})`)
      if (maandenVerlaagd > 0) delen.push(`${maandenVerlaagd} maanden verlaagd (${eur(verlaagd)} per jaar)`)
      if (maandenAlgemeen > 0) delen.push(`${maandenAlgemeen} maanden ${pct(a.bijtellingAlgemeen)} × ${eur(cw)}`)
      formule = delen.join(' en ')
    } else {
      soort = 'algemeen'
      formule = `${pct(a.bijtellingAlgemeen)} × cataloguswaarde ${eur(cw)}${deel}`
    }
    return { bruto, soort, formule, maandenYoungtimer }
  }

  const naGrenzen = (r: Regime) => Math.min(Math.max(0, AFRONDING.bijtelling(r.bruto) - eigenBijdrage), plafond)
  const wet = reken(false)
  const metOvergang = overgang && (overgang.terBeschikking === 'ja' || overgang.terBeschikking === 'aangenomen') ? reken(true) : null
  const kies = metOvergang && naGrenzen(metOvergang) < naGrenzen(wet) ? metOvergang : wet
  const overgangsrecht = kies === metOvergang

  if (auto.dagwaarde === undefined && (jaar * 12 + LAATSTE_MAAND >= youngtimerIdx || (overgang && overgang.terBeschikking !== 'nee'))) {
    waarschuwingen.push(
      waarschuwing(`${prefix}.auto.dagwaarde`, 'let-op', 'Deze auto is een youngtimer. Vul de dagwaarde in; zonder dagwaarde rekenen we met de cataloguswaarde.'),
    )
  }
  if (overgang?.terBeschikking === 'onbekend' && wet.maandenYoungtimer < periode.aantal) {
    const og = a.youngtimerOvergang!
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.auto.overgang`,
        'let-op',
        `Vul in sinds wanneer de auto tot je beschikking staat. Stond hij er uiterlijk op ${datumNL(og.terBeschikkingUiterlijk)} al, dan geldt het overgangsrecht en is hij het hele jaar youngtimer.`,
      ),
    )
  }
  if (kies.soort === 'algemeen' && auto.nulEmissie && !tabel) {
    waarschuwingen.push(
      waarschuwing(`${prefix}.auto.tabel`, 'let-op', `Geen verlaagd bijtellingspercentage bekend voor eerste toelating in ${toelatingsjaar}; we rekenen met het algemene percentage.`),
    )
  }

  const bruto = AFRONDING.bijtelling(kies.bruto)
  let bijtelling = Math.max(0, bruto - eigenBijdrage)
  let formule = kies.formule
  if (overgangsrecht) formule += `; overgangsrecht, zonder ${eur(naGrenzen(wet))}`
  if (eigenBijdrage > 0) formule += `; min eigen bijdrage ${eur(eigenBijdrage)}`
  if (bijtelling > plafond) {
    formule += `; begrensd op de autokosten ${eur(plafond)}${btwCorrectieAfgetrokken > 0 ? ` (met de btw-correctie ${eur(btwCorrectieAfgetrokken)})` : ''}`
    bijtelling = plafond
  }
  uitleg.push(regel(id, 'Bijtelling privégebruik auto', bijtelling, 'plus', { formule, parameter: 'ondernemer.auto', status: ctx.params.ondernemer.status }))
  if (auto.priveKm !== undefined && auto.priveKm <= a.priveKmGrens && !auto.rittenregistratie) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.auto.ritten`,
        'info',
        `Met een sluitende rittenregistratie en niet meer dan ${eur(a.priveKmGrens)} privékilometers vervalt de bijtelling.`,
      ),
    )
  }
  const youngtimerVanaf = youngtimerVanafInJaar(auto.datumEersteToelating, ctx.params, jaar)
  return {
    bijtelling,
    bruto,
    soort: kies.soort,
    uitleg,
    waarschuwingen,
    uitkomst: {
      soort: kies.soort,
      bruto,
      eigenBijdrage,
      plafond,
      bijtelling,
      overgangsrecht,
      ...(metOvergang ? { zonderOvergangsrecht: naGrenzen(wet) } : {}),
      ...(youngtimerVanaf ? { youngtimerVanaf } : {}),
      ...basisUitkomst,
    },
  }
}

/** Tekst voor een btw-correctie zonder gegevens of met een bedrag (UI en rapport). */
export const btwCorrectieTekst = (u: Pick<AutoUitkomst, 'btwCorrectie' | 'btwDetail'> | undefined): string =>
  !u || u.btwDetail === null || u.btwDetail === undefined ? 'nog niet ingevuld' : euro(u.btwCorrectie)
