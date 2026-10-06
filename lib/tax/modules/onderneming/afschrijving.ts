/**
 * Afschrijvingen op bedrijfsmiddelen uit het activaregister.
 *
 * Regels (alle grenzen uit `params.ondernemer.afschrijving` en `params.ondernemer.vamil`):
 *  - lineair: (aanschaf − restwaarde) / levensduur, maximaal maxPctPerJaar (goodwill: goodwillPct) van de
 *    aanschafwaarde per jaar; het eerste jaar naar rato van de maanden vanaf de aanschafmaand
 *  - aanschafwaarde onder directAftrekbaarTot (van het aanschafjaar) of methode 'direct': alles in het aanschafjaar
 *  - gebouwen: ook maximaal maxPctPerJaar van de aanschafwaarde per jaar (art. 3.30 lid 2 noemt naast goodwill
 *    alle andere bedrijfsmiddelen), en daarbovenop niet verder dan de bodemwaarde (art. 3.30a:
 *    bodemwaardeGebouwEigenGebruik × WOZ)
 *  - willekeurig-starter: alleen als in het aanschafjaar de regeling bestond en de ondernemer toen starter was;
 *    die status van het aanschafjaar geldt ook voor de jaren daarna. Na het aanschafjaar gaat de rest lineair over
 *    de resterende gebruiksduur (art. 3.30 lid 1): (boekwaarde − restwaarde) / resterende jaren, gerekend in maanden
 *    vanaf de aanschafmaand, met het maximum per jaar
 *  - vamil: tot vamil.pct (van het aanschafjaar) van de aanschafwaarde vrij in het aanschafjaar, de rest lineair
 *  - verkoop: afschrijving tot en met de verkoopmaand, boekwinst = verkoopprijs − boekwaarde; de boekwaarde aan het
 *    einde van het verkoopjaar is 0
 *
 * Zonder `boekwaardeBegin` simuleren we de eerdere jaren vanaf het aanschafjaar, elk jaar met de parameters en de
 * starterstatus van dat jaar (als `paramsVoorJaar` en `startjaar` zijn meegegeven; anders die van het lopende jaar).
 *
 * `willekeurigBedrag` op een actief met methode 'willekeurig-starter' of 'vamil' = het gekozen vrije
 * afschrijvingsbedrag in het aanschafjaar. Zonder dat veld nemen we het maximum.
 *
 * Ronde 2 (A6): een afgeboekte herinvesteringsreserve (`herinvesteringsreserveAfboeking`, art. 3.54 lid 1) gaat als
 * eerste afschrijving van de aanschafwaarde af: daarna afschrijven over (aanschaf − afboeking − restwaarde), ook het
 * maximum per jaar over die fiscale aanschafwaarde.
 */
import type { ActiefInvoer, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { parseDatum, maandenTotEindeJaar } from '../../datum'
import { eur, pct, regel, waarschuwing } from '../../uitleg'
import { kanReserveren } from './reserves'

export type ActiefMetKeuze = ActiefInvoer

export interface AfschrijvingPerActief {
  omschrijving: string
  aanschafwaarde: number
  restwaarde: number
  boekwaardeBegin: number
  afschrijving: number
  boekwaardeEind: number
  boekwinst: number
  /** Positie in de invoerlijst. */
  invoerIndex: number
  verkochtDitJaar: boolean
  formule: string
}

export interface AfschrijvingResultaat {
  totaal: number
  boekwinst: number
  perActief: AfschrijvingPerActief[]
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

export interface AfschrijvingContext {
  params: TaxYearParams
  jaar: number
  /** Starter in het lopende jaar. */
  isStarter: boolean
  prefix?: string
  /** Startjaar van de onderneming: daarmee bepalen we de starterstatus van eerdere jaren. */
  startjaar?: number
  /** Parameters van een eerder jaar; undefined = die van het lopende jaar gebruiken. */
  paramsVoorJaar?: (jaar: number) => TaxYearParams | undefined
  /**
   * Ronde 2 (A6): herkomst-id's van middelen waarvoor al een herinvesteringsreserve is gevormd
   * (`HerinvesteringsreserveInvoer.herkomst.actiefHerkomst`); daar geen hint meer om er een te vormen.
   */
  reserveHerkomsten?: ReadonlySet<string>
}

interface JaarUitkomst {
  bedrag: number
  formule: string
}

/** Fiscale aanschafwaarde: aanschafwaarde min de afgeboekte herinvesteringsreserve (ronde 2, A6). */
export function fiscaleAanschafwaarde(a: Pick<ActiefInvoer, 'aanschafwaarde' | 'herinvesteringsreserveAfboeking'>): number {
  return a.aanschafwaarde - Math.max(0, Math.min(a.herinvesteringsreserveAfboeking ?? 0, a.aanschafwaarde))
}

function jaarVan(iso: string): number {
  return parseDatum(iso).getUTCFullYear()
}

function maandVan(iso: string): number {
  return parseDatum(iso).getUTCMonth() + 1
}

/** Afschrijving in één jaar, gegeven de boekwaarde aan het begin van dat jaar. */
function afschrijvingInJaar(
  a: ActiefMetKeuze,
  j: number,
  boekwaarde: number,
  ctx: {
    /** Parameters van jaar j. */
    params: TaxYearParams
    /** Parameters van het aanschafjaar (directe aftrek, Vamil-percentage, willekeurige afschrijving). */
    paramsAanschaf: TaxYearParams
    /** Starter in het aanschafjaar. */
    starterAanschaf: boolean
  },
  meld: (w: Waarschuwing) => void,
): JaarUitkomst {
  const af = ctx.params.ondernemer.waarde.afschrijving
  const afAanschaf = ctx.paramsAanschaf.ondernemer.waarde.afschrijving
  const vamil = ctx.paramsAanschaf.ondernemer.waarde.vamil
  const aanschafjaar = jaarVan(a.aanschafdatum)
  const soort = a.soort ?? 'bedrijfsmiddel'
  const fiscaal = fiscaleAanschafwaarde(a)
  const bodem = soort === 'gebouw' && a.woz ? af.bodemwaardeGebouwEigenGebruik * a.woz : 0
  const ondergrens = Math.max(a.restwaarde, bodem)
  const ruimte = Math.max(0, boekwaarde - ondergrens)
  if (ruimte <= 0) {
    return { bedrag: 0, formule: bodem > a.restwaarde ? `boekwaarde niet boven de bodemwaarde (${pct(af.bodemwaardeGebouwEigenGebruik)} × WOZ ${eur(a.woz ?? 0)})` : 'volledig afgeschreven' }
  }
  if (soort === 'gebouw' && !a.woz) {
    meld(
      waarschuwing(
        'onderneming.afschrijving.gebouwZonderWoz',
        'let-op',
        `${a.omschrijving}: vul de WOZ-waarde in. Op een gebouw mag je niet verder afschrijven dan de bodemwaarde (${pct(af.bodemwaardeGebouwEigenGebruik)} van de WOZ-waarde); zonder WOZ-waarde kunnen we dat niet toetsen.`,
      ),
    )
  }

  // Factor voor een gedeeltelijk jaar (aanschafjaar en verkoopjaar).
  let maanden = j === aanschafjaar ? maandenTotEindeJaar(a.aanschafdatum, j) : 12
  if (a.verkocht && jaarVan(a.verkocht.datum) === j) {
    const totVerkoop = maandVan(a.verkocht.datum)
    maanden = j === aanschafjaar ? Math.max(0, totVerkoop - maandVan(a.aanschafdatum) + 1) : totVerkoop
  }
  const factor = maanden / 12

  const direct = a.methode === 'direct' || a.aanschafwaarde < afAanschaf.directAftrekbaarTot
  if (direct) {
    if (j !== aanschafjaar) return { bedrag: 0, formule: 'in het aanschafjaar volledig afgetrokken' }
    return {
      bedrag: ruimte,
      formule:
        a.aanschafwaarde < afAanschaf.directAftrekbaarTot
          ? `aanschafwaarde ${eur(a.aanschafwaarde)} is minder dan ${eur(afAanschaf.directAftrekbaarTot)}: direct ten laste van de winst`
          : 'direct ten laste van de winst',
    }
  }

  // Art. 3.30 lid 2: maximaal goodwillPct per jaar voor goodwill en maxPctPerJaar voor alle andere bedrijfsmiddelen,
  // ook gebouwen (de bodemwaarde van art. 3.30a komt daar bovenop, via de ondergrens hierboven).
  const maxPct = soort === 'goodwill' ? af.goodwillPct : af.maxPctPerJaar
  const lineairBasis = (basis: number): JaarUitkomst => {
    const perJaar = Math.max(0, basis - a.restwaarde) / Math.max(1, a.levensduurJaren)
    const begrensd = Math.min(perJaar, maxPct * fiscaal)
    const bedrag = Math.min(ruimte, begrensd * factor)
    const delen = [`(${eur(basis)} − ${eur(a.restwaarde)}) / ${a.levensduurJaren} jaar`]
    if (fiscaal < a.aanschafwaarde) delen.push(`na afboeking herinvesteringsreserve ${eur(a.aanschafwaarde - fiscaal)}`)
    if (begrensd < perJaar) delen.push(`maximaal ${pct(maxPct)} van ${eur(fiscaal)}`)
    if (factor < 1) delen.push(`× ${maanden}/12`)
    return { bedrag, formule: delen.join(', ') }
  }
  /**
   * Art. 3.30 lid 1: na een willekeurige afschrijving gaat de rest over de resterende gebruiksduur. De gebruiksduur
   * loopt vanaf de aanschafmaand; is er minder dan een jaar over, dan gaat de hele rest dit jaar (met het maximum).
   */
  const restOverResterendeDuur = (): JaarUitkomst => {
    const verstreken = maandenTotEindeJaar(a.aanschafdatum, aanschafjaar) + (j - aanschafjaar - 1) * 12
    const resterend = Math.max(0, Math.max(1, a.levensduurJaren) * 12 - verstreken)
    const rest = Math.max(0, boekwaarde - a.restwaarde)
    const perJaar = resterend >= 12 ? (rest * 12) / resterend : rest
    const begrensd = Math.min(perJaar, maxPct * fiscaal)
    const bedrag = Math.min(ruimte, begrensd * factor)
    const jaren = resterend / 12
    const jarenTekst = Number.isInteger(jaren) ? `${jaren}` : jaren.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
    const delen = [resterend >= 12 ? `(${eur(boekwaarde)} − ${eur(a.restwaarde)}) / ${jarenTekst} resterende jaren` : `rest ${eur(rest)}: ${resterend > 0 ? 'de gebruiksduur eindigt dit jaar' : 'de gebruiksduur is voorbij'}`]
    if (begrensd < perJaar) delen.push(`maximaal ${pct(maxPct)} van ${eur(fiscaal)}`)
    if (factor < 1) delen.push(`× ${maanden}/12`)
    return { bedrag, formule: delen.join(', ') }
  }

  if (a.methode === 'willekeurig-starter') {
    if (afAanschaf.willekeurigStarters && ctx.starterAanschaf) {
      if (j === aanschafjaar) {
        const gekozen = Math.min(ruimte, Math.max(0, a.willekeurigBedrag ?? ruimte))
        return { bedrag: gekozen, formule: `willekeurige afschrijving starters: ${eur(gekozen)} gekozen in het aanschafjaar` }
      }
      return restOverResterendeDuur()
    }
    meld(
      waarschuwing(
        'onderneming.afschrijving.willekeurig',
        'let-op',
        `${a.omschrijving}: willekeurig afschrijven kan alleen voor starters, op bedrijfsmiddelen uit een jaar waarin de regeling bestond. We rekenen met lineaire afschrijving.`,
      ),
    )
    return lineairBasis(fiscaal)
  }

  if (a.methode === 'vamil') {
    const vamilMax = vamil.pct * fiscaal
    if (j === aanschafjaar) {
      const vrij = Math.min(ruimte, Math.max(0, Math.min(vamilMax, a.willekeurigBedrag ?? vamilMax)))
      const rest = lineairBasis(fiscaal - vrij)
      const bedrag = Math.min(ruimte, vrij + rest.bedrag)
      return { bedrag, formule: `Vamil ${eur(vrij)} (maximaal ${pct(vamil.pct)} van ${eur(fiscaal)}) + ${rest.formule}` }
    }
    return lineairBasis(fiscaal - Math.min(vamilMax, a.willekeurigBedrag ?? vamilMax))
  }

  return lineairBasis(fiscaal)
}

export function berekenAfschrijvingen(activa: ActiefMetKeuze[], ctx: AfschrijvingContext): AfschrijvingResultaat {
  const prefix = ctx.prefix ?? 'onderneming'
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const meld = (w: Waarschuwing) => {
    if (!waarschuwingen.some((x) => x.id === w.id && x.tekst === w.tekst)) waarschuwingen.push(w)
  }
  const perActief: AfschrijvingPerActief[] = []

  const paramsVan = (j: number): TaxYearParams => (j === ctx.jaar ? ctx.params : (ctx.paramsVoorJaar?.(j) ?? ctx.params))
  const starterIn = (j: number): boolean =>
    j === ctx.jaar || ctx.startjaar === undefined ? ctx.isStarter : j - ctx.startjaar < paramsVan(j).ondernemer.waarde.urencriterium.startersVrijstellingJaren

  activa.forEach((a, invoerIndex) => {
    const aanschafjaar = jaarVan(a.aanschafdatum)
    if (aanschafjaar > ctx.jaar) return
    if (a.verkocht && jaarVan(a.verkocht.datum) < ctx.jaar) return
    const jaarCtx = (j: number) => ({ params: paramsVan(j), paramsAanschaf: paramsVan(aanschafjaar), starterAanschaf: starterIn(aanschafjaar) })

    // Boekwaarde begin: opgegeven, of gesimuleerd vanaf het aanschafjaar.
    let boekwaarde = fiscaleAanschafwaarde(a)
    if (a.boekwaardeBegin !== undefined && aanschafjaar < ctx.jaar) {
      boekwaarde = a.boekwaardeBegin
    } else {
      for (let j = aanschafjaar; j < ctx.jaar; j++) {
        boekwaarde -= AFRONDING.afschrijving(afschrijvingInJaar(a, j, boekwaarde, jaarCtx(j), () => undefined).bedrag)
      }
    }
    const { bedrag, formule } = afschrijvingInJaar(a, ctx.jaar, boekwaarde, jaarCtx(ctx.jaar), meld)
    const afschrijving = AFRONDING.afschrijving(bedrag)
    const naAfschrijving = boekwaarde - afschrijving
    const verkochtDitJaar = !!a.verkocht && jaarVan(a.verkocht.datum) === ctx.jaar
    const boekwinst = verkochtDitJaar ? a.verkocht!.verkoopprijs - naAfschrijving : 0
    perActief.push({
      omschrijving: a.omschrijving,
      aanschafwaarde: a.aanschafwaarde,
      restwaarde: a.restwaarde,
      boekwaardeBegin: boekwaarde,
      afschrijving,
      boekwaardeEind: verkochtDitJaar ? 0 : naAfschrijving,
      boekwinst,
      invoerIndex,
      verkochtDitJaar,
      formule,
    })
    uitleg.push(regel(`${prefix}.afschrijving.item`, a.omschrijving, afschrijving, 'info', { niveau: 2, formule, parameter: 'ondernemer.afschrijving' }))
    if (boekwinst !== 0) {
      uitleg.push(
        regel(`${prefix}.afschrijving.boekwinst`, `Boekresultaat bij verkoop van ${a.omschrijving}`, boekwinst, boekwinst > 0 ? 'plus' : 'min', {
          niveau: 2,
          formule: `verkoopprijs ${eur(a.verkocht!.verkoopprijs)} − boekwaarde ${eur(naAfschrijving)}`,
        }),
      )
      // Ronde 2 (A6): de hint alleen als een reserve kan (niet voor beleggingen en kleine middelen, art. 3.54 lid 7) en
      // er voor dit middel nog geen is.
      const alGevormd = a.herkomst !== undefined && ctx.reserveHerkomsten?.has(a.herkomst) === true
      if (boekwinst > 0 && !alGevormd && kanReserveren(a, ctx.params)) {
        meld(
          waarschuwing(
            `${prefix}.afschrijving.hir`,
            'info',
            `Met de boekwinst op ${a.omschrijving} kun je een herinvesteringsreserve vormen als je van plan bent binnen ${ctx.params.ondernemer.waarde.hir.termijnJaren} jaar opnieuw te investeren.`,
          ),
        )
      }
    }
  })

  const totaal = perActief.reduce((s, x) => s + x.afschrijving, 0)
  const boekwinst = perActief.reduce((s, x) => s + x.boekwinst, 0)
  return { totaal, boekwinst, perActief, uitleg, waarschuwingen }
}
