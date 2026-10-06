/**
 * Fiscale oudedagsreserve (FOR): afnemingen en (tot en met 2022) dotatie.
 *
 * Verplichte afneming (art. 3.70 lid 1 onder b Wet IB 2001, tekst 2022; sinds 2023 via art. 10a.29 lid 1):
 * de FOR neemt af met het bedrag waarmee de FOR het ondernemingsvermogen aan het einde van het jaar overtreft,
 * maar alleen als in het jaar
 *  - de onderneming of een deel ervan is gestaakt (grond 'staking'),
 *  - de belastingplichtige op 1 januari de AOW-leeftijd had (grond 'aow'), of
 *  - het urencriterium dit jaar én vorig jaar niet is gehaald (grond 'urencriterium2jaar').
 * Een FOR boven het ondernemingsvermogen is op zichzelf geen grond: zonder een van de drie gronden is er geen
 * verplichte afname, alleen een melding.
 *
 * Bij staking van de hele onderneming is het ondernemingsvermogen daarna nihil, dus valt de hele FOR vrij. Bij een
 * gedeeltelijke staking, AOW of twee jaar geen urencriterium is het ondernemingsvermogen nodig: uit de invoer, anders
 * uit de eindbalans van de jaarrekening, anders een actiemelding en geen afname.
 *
 * Vrijwillige afneming (art. 3.70 lid 1 onder a): ten hoogste de lijfrentepremies die dit jaar als uitgaven voor
 * inkomensvoorzieningen worden afgetrokken (`vrijwilligeAfnameMax`, door de engine per persoon bepaald). Die afname
 * komt eerst: de verplichte afname onder b meet de FOR aan het einde van het jaar, dus na de vrijwillige afname.
 *   vrijwillig = min(gewenst, stand, vrijwilligeAfnameMax)
 *   verplicht  = max(0, stand − vrijwillig − max(0, ondernemingsvermogen))   (volledige staking: stand − vrijwillig)
 * Dotatie alleen als `params.ondernemer.for.dotatie` (tot en met 2022).
 *
 * Optioneel veld (bovenop het contract): `dotatie` op de FOR-invoer = gewenste dotatie (alleen jaren met dotatie).
 */
import type { BalansStand, OndernemingInvoer, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { eur, euro, pct, regel, waarschuwing } from '../../uitleg'

export type ForInvoer = NonNullable<OndernemingInvoer['for']> & { dotatie?: number }

export type ForGrond = 'staking' | 'aow' | 'urencriterium2jaar'

export interface ForResultaat {
  verplichteAfname: number
  vrijwilligeAfname: number
  dotatie: number
  standEind: number
  /** Grond voor de verplichte afname; null als geen van de drie gronden geldt (dan is de afname altijd 0). */
  reden: ForGrond | null
  /** Ondernemingsvermogen aan het einde waarmee is gerekend, en waar het vandaan komt. */
  ondernemingsvermogen?: number
  ondernemingsvermogenBron?: 'invoer' | 'balans'
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

/** Balansposten aan de actiefzijde en het vreemd vermogen (zelfde indeling als de jaarrekening in het dossier). */
const ACTIVA: Array<keyof BalansStand> = ['materieleVasteActiva', 'voorraden', 'handelsdebiteuren', 'overigeVorderingen', 'liquideMiddelen']
const VREEMD: Array<keyof BalansStand> = ['voorzieningen', 'langlopendeSchulden', 'crediteuren', 'omzetbelasting', 'overigeKortlopendeSchulden']

/**
 * Ondernemingsvermogen van een balansstand: activa min voorzieningen en schulden (de FOR hoort bij het
 * ondernemingsvermogen, art. 3.71). Undefined als er geen activa- of schuldpost is ingevuld.
 */
export function ondernemingsvermogenUitBalans(s: BalansStand | undefined): number | undefined {
  if (!s) return undefined
  const ingevuld = [...ACTIVA, ...VREEMD].some((p) => typeof s[p] === 'number' && Number.isFinite(s[p]))
  if (!ingevuld) return undefined
  const som = (posten: Array<keyof BalansStand>) => posten.reduce((t, p) => t + (Number.isFinite(s[p]) ? (s[p] as number) : 0), 0)
  return som(ACTIVA) - som(VREEMD)
}

export function berekenFor(
  f: ForInvoer,
  ctx: {
    params: TaxYearParams
    staking: boolean
    /** Alleen een deel van de onderneming is gestaakt. */
    gedeeltelijkeStaking?: boolean
    aowBereikt: boolean
    urencriteriumGehaald: boolean
    urencriteriumVorigJaar?: boolean
    /** Ondernemingsvermogen uit de eindbalans; geldt als `ondernemingsvermogenEinde` ontbreekt. */
    ondernemingsvermogenBalans?: number
    /** Winst vóór FOR-mutaties (voor het dotatiemaximum). */
    winstVoorFor: number
    /**
     * Art. 3.70 lid 1 onder a: de vrijwillige afname is ten hoogste de lijfrentepremies die dit jaar worden afgetrokken
     * (het deel daarvan voor deze onderneming). Ontbreekt = niet begrensd (alleen bij een losse aanroep; de engine geeft
     * het altijd mee).
     */
    vrijwilligeAfnameMax?: number
    prefix?: string
  },
): ForResultaat {
  const fp = ctx.params.ondernemer.waarde.for
  const prefix = ctx.prefix ?? 'onderneming'
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const stand = Math.max(0, f.stand)
  const gronden = new Set(fp.verplichteAfnameBij)

  const ovInvoer = f.ondernemingsvermogenEinde
  const ov = ovInvoer ?? ctx.ondernemingsvermogenBalans
  const ovBron: ForResultaat['ondernemingsvermogenBron'] = ovInvoer !== undefined ? 'invoer' : ov !== undefined ? 'balans' : undefined
  const ovTekst = (n: number) => `${ovBron === 'balans' ? 'het ondernemingsvermogen uit de eindbalans' : 'het ondernemingsvermogen'} (${euro(n)})`

  let reden: ForGrond | null = null
  if (ctx.staking && gronden.has('staking')) reden = 'staking'
  else if (ctx.aowBereikt && gronden.has('aow')) reden = 'aow'
  else if (!ctx.urencriteriumGehaald && ctx.urencriteriumVorigJaar === false && gronden.has('urencriterium2jaar')) reden = 'urencriterium2jaar'

  const grondTekst: Record<ForGrond, string> = {
    staking: ctx.gedeeltelijkeStaking ? 'je hebt een deel van de onderneming gestaakt' : 'je hebt de onderneming gestaakt',
    aow: 'je had op 1 januari de AOW-leeftijd',
    urencriterium2jaar: 'je haalde het urencriterium dit jaar en vorig jaar niet',
  }

  // 1. Vrijwillige afname eerst (lid 1 onder a), begrensd op de stand en op de afgetrokken lijfrentepremies.
  const gewenst = Math.max(0, f.vrijwilligeAfname ?? 0)
  const premieMax = ctx.vrijwilligeAfnameMax !== undefined ? Math.max(0, ctx.vrijwilligeAfnameMax) : Infinity
  const vrijwilligeAfname = Math.min(gewenst, stand, premieMax)
  if (gewenst > 0 && stand > 0 && premieMax < Math.min(gewenst, stand)) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.for.vrijwilligBegrensd`,
        'let-op',
        `Je wilt ${euro(Math.min(gewenst, stand))} van de oudedagsreserve vrijwillig laten afnemen. Dat kan alleen tot het bedrag aan lijfrentepremies dat je dit jaar aftrekt${premieMax > 0 ? ` (${euro(premieMax)})` : ', en dat is nu niets'}. We rekenen met een vrijwillige afname van ${euro(vrijwilligeAfname)}. Koop je een lijfrente met de oudedagsreserve, vul dan de premie in bij je lijfrente (omzetting van de oudedagsreserve).`,
      ),
    )
  }
  const naVrijwillig = stand - vrijwilligeAfname
  const vrijwilligTekst = vrijwilligeAfname > 0 ? ` − vrijwillige afname ${eur(vrijwilligeAfname)}` : ''

  // 2. Verplichte afname over de FOR na de vrijwillige afname (lid 1 onder b: de FOR aan het einde van het jaar).
  let verplichteAfname = 0
  let afnameFormule = ''
  if (reden === 'staking' && !ctx.gedeeltelijkeStaking) {
    verplichteAfname = naVrijwillig
    afnameFormule = `de hele onderneming is gestaakt: het ondernemingsvermogen is daarna nihil, dus de hele oudedagsreserve valt vrij${vrijwilligeAfname > 0 ? ` (${eur(stand)}${vrijwilligTekst})` : ''}`
  } else if (reden && ov !== undefined) {
    verplichteAfname = Math.max(0, naVrijwillig - Math.max(0, ov))
    afnameFormule = `${grondTekst[reden]}: oudedagsreserve ${eur(stand)}${vrijwilligTekst} − ondernemingsvermogen ${eur(Math.max(0, ov))}${ovBron === 'balans' ? ' (uit de eindbalans)' : ''}`
  } else if (reden && naVrijwillig > 0) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.for.ondernemingsvermogenOnbekend`,
        'actie',
        `${grondTekst[reden].charAt(0).toUpperCase()}${grondTekst[reden].slice(1)}. Dan neemt de oudedagsreserve verplicht af met het deel dat hoger is dan het ondernemingsvermogen aan het einde van het jaar. Vul het ondernemingsvermogen of de eindbalans in; tot die tijd rekenen we zonder verplichte afname.`,
      ),
    )
  }

  if (!reden && stand > 0 && ov !== undefined && stand > ov) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.for.bovenOndernemingsvermogen`,
        'info',
        `De oudedagsreserve (${euro(stand)}) is hoger dan ${ovTekst(ov)}. Dat geeft nu geen verplichte afname. Die volgt pas bij staking, vanaf het jaar waarin je op 1 januari de AOW-leeftijd hebt, of als je twee jaar achter elkaar het urencriterium niet haalt. Dan valt het deel boven het ondernemingsvermogen vrij.`,
      ),
    )
  }
  if (!reden && stand > 0 && !ctx.urencriteriumGehaald && ctx.urencriteriumVorigJaar === undefined && gronden.has('urencriterium2jaar')) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.for.urencriteriumVorigJaar`,
        'let-op',
        'Je haalt dit jaar het urencriterium niet. Haalde je het vorig jaar ook niet, dan neemt de oudedagsreserve verplicht af met het deel boven het ondernemingsvermogen. Vul in of je het urencriterium vorig jaar haalde.',
      ),
    )
  }

  let dotatie = 0
  if (fp.dotatie && (f.dotatie ?? 0) > 0) {
    const ruimteVermogen = ov !== undefined ? Math.max(0, ov - stand) : Infinity
    const max = Math.min(
      fp.dotatiePct !== undefined ? AFRONDING.investeringsaftrek(fp.dotatiePct * Math.max(0, ctx.winstVoorFor)) : Infinity,
      fp.dotatieMax ?? Infinity,
      ruimteVermogen,
    )
    if (!ctx.urencriteriumGehaald || ctx.aowBereikt) {
      waarschuwingen.push(waarschuwing(`${prefix}.for.dotatieGeenRecht`, 'let-op', 'Dotatie aan de FOR kan alleen met het urencriterium en vóór de AOW-leeftijd.'))
    } else {
      dotatie = Math.min(f.dotatie ?? 0, max)
      uitleg.push(
        regel(`${prefix}.for.dotatie`, 'Toevoeging aan de oudedagsreserve', dotatie, 'min', {
          formule: `gewenst ${eur(f.dotatie ?? 0)}, maximaal ${fp.dotatiePct !== undefined ? `${pct(fp.dotatiePct)} van de winst` : 'het maximum'}${fp.dotatieMax !== undefined ? ` en ${eur(fp.dotatieMax)}` : ''}`,
          parameter: 'ondernemer.for.dotatiePct',
        }),
      )
    }
  } else if (!fp.dotatie && (f.dotatie ?? 0) > 0) {
    waarschuwingen.push(waarschuwing(`${prefix}.for.geenDotatie`, 'info', 'Toevoegen aan de oudedagsreserve kan sinds 2023 niet meer.'))
  }

  if (verplichteAfname > 0) {
    uitleg.push(
      regel(`${prefix}.for.verplicht`, 'Verplichte afname oudedagsreserve', verplichteAfname, 'plus', {
        formule: afnameFormule,
        parameter: 'ondernemer.for.verplichteAfnameBij',
      }),
    )
  }
  if (vrijwilligeAfname > 0) {
    uitleg.push(
      regel(`${prefix}.for.vrijwillig`, 'Vrijwillige afname oudedagsreserve', vrijwilligeAfname, 'plus', {
        formule: `${eur(vrijwilligeAfname)} van ${eur(stand)}`,
      }),
    )
  }

  const standEind = stand - verplichteAfname - vrijwilligeAfname + dotatie
  // Art. 3.128 (tekst 2022, via art. 10a.29): de premie voor omzetting is aftrekbaar tot ten hoogste de vrijwillige
  // afname onder a. De verplichte afname onder b valt daar niet onder; bij staking loopt dat via de stakingslijfrente.
  if (vrijwilligeAfname > 0 && fp.omzettingLijfrenteExtraRuimte) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.for.omzetting`,
        'info',
        `De vrijwillige afname van de oudedagsreserve (${euro(vrijwilligeAfname)}) telt als winst. De premie voor een lijfrente van hetzelfde bedrag is aftrekbaar bovenop je jaar- en reserveringsruimte, als je die betaalt binnen ${fp.betaalTermijnMaanden} maanden na het einde van het jaar.`,
      ),
    )
  }
  if (verplichteAfname > 0 && reden === 'staking') {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.for.stakingslijfrente`,
        'info',
        `Bij staking valt de oudedagsreserve (${euro(verplichteAfname)}) vrij in de winst. Je kunt die als deel van de stakingswinst omzetten in een stakingslijfrente; deze berekening neemt die aftrek niet mee.`,
      ),
    )
  } else if (verplichteAfname > 0 && fp.omzettingLijfrenteExtraRuimte) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.for.omzettingVoorVerplicht`,
        'info',
        'Wil je de oudedagsreserve omzetten in een lijfrente, dan gaat dat via een vrijwillige afname. Die gaat vóór de verplichte afname: wat je vrijwillig laat afnemen, neemt niet nog eens verplicht af.',
      ),
    )
  }
  if (stand > 0 && !fp.dotatie && verplichteAfname === 0) {
    const formule = reden
      ? ov !== undefined
        ? `${grondTekst[reden]}, maar de oudedagsreserve${vrijwilligeAfname > 0 ? ' na de vrijwillige afname' : ''} is niet hoger dan het ondernemingsvermogen (${eur(ov)}): geen verplichte afname`
        : `${grondTekst[reden]}, maar het ondernemingsvermogen is onbekend: geen verplichte afname berekend`
      : 'geen verplichte afname: geen staking, geen AOW-leeftijd en niet twee jaar zonder urencriterium'
    uitleg.push(regel(`${prefix}.for.stand`, 'Oudedagsreserve eind van het jaar', standEind, 'info', { niveau: 2, formule, parameter: 'ondernemer.for.verplichteAfnameBij' }))
  }
  return {
    verplichteAfname,
    vrijwilligeAfname,
    dotatie,
    standEind,
    reden,
    ...(ov !== undefined ? { ondernemingsvermogen: ov, ondernemingsvermogenBron: ovBron } : {}),
    uitleg,
    waarschuwingen,
  }
}
