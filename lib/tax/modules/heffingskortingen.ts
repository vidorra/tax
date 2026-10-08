/**
 * Heffingskortingen: algemene heffingskorting (AHK), arbeidskorting (AK), inkomensafhankelijke
 * combinatiekorting (IACK), ouderenkorting, jonggehandicaptenkorting en de korting groen beleggen.
 *
 * - AHK bouwt af op het box 1-inkomen of het verzamelinkomen, volgens `algemeen.grondslag`.
 * - AK: opbouwtrajecten (basis + pct × (arbeidsinkomen − grens vorig traject)), maximum, afbouw.
 * - IACK: alleen als de regeling actief is, het arbeidsinkomen boven de drempel ligt, er geen
 *   fiscale partner is of deze persoon de minstverdienende partner is, en er een kind is dat op
 *   1 januari jonger is dan `maxLeeftijdKind` en ten minste `minMaandenHuishouden` maanden van het
 *   jaar tot het huishouden hoort (co-ouderschap: ten minste `coOuderMinDagen` dagen). Er is géén
 *   geboortedatumgrens (amendement Grinwis, Kamerstuk 36418 nr. 61).
 * - Ouderenkorting alleen bij AOW-leeftijd; jonggehandicaptenkorting nooit automatisch.
 * - Afronding per korting (Kennisgroep Belastingdienst KG:202:2022:14): de korting wordt ongerond berekend en gesplitst
 *   in een belastingdeel en een premiedeel (AOW, Anw en Wlz samen) naar de tarieven van schijf 1. Beide delen worden
 *   afgerond in het voordeel van de belastingplichtige (AFRONDING.heffingskortingDeel, naar boven); de korting is de
 *   som, nooit hoger dan het maximum in de wet. Verzilverd = min(bruto, maxVerzilverbaar).
 *
 * Controle 2026 (alleenstaand, arbeidsinkomen 76.000, box 1-inkomen 64.000): AHK 210 + 714 = 924, AK 840 + 2.866 = 3.706.
 */
import type { ArbeidskortingParams, HeffingskortingSoort, HeffingskortingenResultaat, KindInvoer, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { AFRONDING } from '../rounding'
import { eur, pct, regel, waarschuwing } from '../uitleg'
import { heleMaandenInJaar, leeftijdOp } from '../datum'

export interface HeffingskortingenContext {
  params: TaxYearParams
  jaar: number
  /** Winst vóór ondernemersaftrek en MKB-vrijstelling + loon (incl. ZEZ/WAZO) + resultaat overig werk. */
  arbeidsinkomen: number
  box1Inkomen: number
  verzamelinkomen: number
  geboortedatum: string
  aowBereikt: boolean
  heeftFiscaalPartner: boolean
  /** Deze persoon heeft het laagste arbeidsinkomen van de twee partners (voor de IACK). */
  isMinstverdienende: boolean
  kinderen: KindInvoer[]
  /** Vrijgestelde groene beleggingen van deze persoon (grondslag korting groen beleggen). */
  groenVrijstelling: number
  /** Belasting + premies box 1 (en box 2/3) waartegen de kortingen verzilverd kunnen worden. */
  maxVerzilverbaar: number
  /** Optioneel: recht op jonggehandicaptenkorting (Wajong). Standaard false. */
  jonggehandicapt?: boolean
}

/** Arbeidskorting vóór afronding, met de gebruikte stap voor de uitleg. */
export function arbeidskortingBruto(arbeidsinkomen: number, p: ArbeidskortingParams): { bedrag: number; formule: string } {
  if (arbeidsinkomen <= 0) return { bedrag: 0, formule: 'geen arbeidsinkomen' }
  if (arbeidsinkomen > p.afbouwVanaf) {
    const bedrag = Math.max(0, p.max - p.afbouwPct * (arbeidsinkomen - p.afbouwVanaf))
    return { bedrag: Math.min(bedrag, p.max), formule: `${eur(p.max)} − ${pct(p.afbouwPct)} × (${eur(arbeidsinkomen)} − ${eur(p.afbouwVanaf)})` }
  }
  let vorigeTot = 0
  for (const t of p.opbouw) {
    if (arbeidsinkomen <= t.tot) {
      const bedrag = Math.min(p.max, t.basis + t.pct * (arbeidsinkomen - vorigeTot))
      const formule = t.basis > 0 ? `${eur(t.basis)} + ${pct(t.pct, 3)} × (${eur(arbeidsinkomen)} − ${eur(vorigeTot)})` : `${pct(t.pct, 3)} × ${eur(arbeidsinkomen)}`
      return { bedrag, formule }
    }
    vorigeTot = t.tot
  }
  return { bedrag: p.max, formule: `maximum ${eur(p.max)}` }
}

interface KindToets {
  kind: KindInvoer
  leeftijd: number
  maanden: number
  voldoet: boolean
  reden: string
}

function toetsKind(kind: KindInvoer, ctx: HeffingskortingenContext): KindToets {
  const p = ctx.params.heffingskortingen.waarde.iack
  const peildatum = `${ctx.jaar}-01-01`
  const leeftijd = leeftijdOp(kind.geboortedatum, peildatum)
  const maanden = heleMaandenInJaar(kind.inHuishoudenVanaf ?? kind.geboortedatum, ctx.jaar)
  const naam = kind.naam ?? 'het kind'
  if (leeftijd >= p.maxLeeftijdKind) {
    return { kind, leeftijd, maanden, voldoet: false, reden: `${naam} is op 1 januari ${leeftijd} jaar of ouder dan de grens van ${p.maxLeeftijdKind}` }
  }
  if (kind.coOuderschap) {
    if (p.coOuderMinDagen === null) {
      return { kind, leeftijd, maanden, voldoet: true, reden: `${naam}: co-ouderschap, getoetst op inschrijving` }
    }
    const ok = kind.coOuderschap.dagenInHuishouden >= p.coOuderMinDagen
    return {
      kind,
      leeftijd,
      maanden,
      voldoet: ok,
      reden: `${naam}: co-ouderschap, ${kind.coOuderschap.dagenInHuishouden} dagen in dit huishouden (minimaal ${p.coOuderMinDagen})`,
    }
  }
  const ok = maanden >= p.minMaandenHuishouden
  return {
    kind,
    leeftijd,
    maanden,
    voldoet: ok,
    reden: ok
      ? `${naam} hoort ${maanden} hele maanden van ${ctx.jaar} tot het huishouden`
      : `${naam} hoort in ${ctx.jaar} ${maanden} hele maanden tot het huishouden, minder dan ${p.minMaandenHuishouden}`,
  }
}

type KortingDeel = NonNullable<HeffingskortingenResultaat['delen']>[number]

/** Volgorde van de kortingen in `delen` (zo staan ze in het rapport). */
const SOORTEN: HeffingskortingSoort[] = ['algemeen', 'arbeid', 'iack', 'ouderen', 'jonggehandicapt', 'groenBeleggen']

/** Aandeel van het belastingdeel in het tarief van schijf 1 (zonder AOW-premie als de AOW-leeftijd is bereikt). */
export function belastingdeelFractie(ctx: Pick<HeffingskortingenContext, 'params' | 'aowBereikt'>): number {
  const b1 = ctx.params.box1.waarde
  const belastingDeel = b1.schijven[0]?.belastingDeel ?? 0
  const premiePct = (ctx.aowBereikt ? 0 : b1.premies.aow) + b1.premies.anw + b1.premies.wlz
  const totaalPct = belastingDeel + premiePct
  return totaalPct > 0 ? belastingDeel / totaalPct : 1
}

/**
 * Rondt een ongeronde korting af zoals de Belastingdienst (KG:202:2022:14): belastingdeel en premiedeel elk naar boven,
 * de korting is de som en nooit hoger dan `maximum` (het bedrag in de wet). Valt de som erboven, dan is het premiedeel
 * de rest. Voorbeeld met verzonnen getallen: 1.000,30 met een belastingaandeel van 25% geeft 250,08 en 750,22, dus
 * 251 + 751 = 1.002.
 */
export function rondKorting(soort: HeffingskortingSoort, ruw: number, maximum: number, fractie: number): KortingDeel {
  if (!(ruw > 0)) return { soort, totaal: 0, belastingdeel: 0, premiedeel: 0 }
  const belastingdeel = AFRONDING.heffingskortingDeel(ruw * fractie)
  const premiedeel = AFRONDING.heffingskortingDeel(ruw * (1 - fractie))
  const totaal = Math.min(belastingdeel + premiedeel, Math.max(0, maximum))
  const belasting = Math.min(belastingdeel, totaal)
  return { soort, totaal, belastingdeel: belasting, premiedeel: totaal - belasting }
}

export function berekenHeffingskortingen(ctx: HeffingskortingenContext): HeffingskortingenResultaat {
  const hk = ctx.params.heffingskortingen.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const fractie = belastingdeelFractie(ctx)
  const delen: Partial<Record<HeffingskortingSoort, KortingDeel>> = {}
  const rond = (soort: HeffingskortingSoort, ruw: number, maximum: number): number => {
    const d = rondKorting(soort, ruw, maximum, fractie)
    delen[soort] = d
    return d.totaal
  }

  // Algemene heffingskorting.
  const a = hk.algemeen
  const ahkGrondslag = a.grondslag === 'box1' ? ctx.box1Inkomen : ctx.verzamelinkomen
  const ahkMax = ctx.aowBereikt ? a.aowMax : a.max
  const ahkPct = ctx.aowBereikt ? a.aowAfbouwPct : a.afbouwPct
  const ahkAfbouw = ahkPct * Math.max(0, ahkGrondslag - a.afbouwVanaf)
  const algemeen = rond('algemeen', Math.max(0, ahkMax - ahkAfbouw), ahkMax)
  uitleg.push(
    regel('hk-algemeen', 'Algemene heffingskorting', algemeen, 'min', {
      formule:
        ahkGrondslag > a.afbouwVanaf
          ? `${eur(ahkMax)} − ${pct(ahkPct, 3)} × (${eur(ahkGrondslag)} − ${eur(a.afbouwVanaf)})`
          : `maximum ${eur(ahkMax)}`,
      parameter: ctx.aowBereikt ? 'heffingskortingen.algemeen.aowMax' : 'heffingskortingen.algemeen.max',
    }),
  )
  if (a.grondslag === 'verzamelinkomen') {
    uitleg.push(
      regel('hk-algemeen-grondslag', 'Afbouw algemene heffingskorting over het verzamelinkomen (box 1, 2 en 3)', ahkGrondslag, 'info', {
        niveau: 2,
        parameter: 'heffingskortingen.algemeen.grondslag',
      }),
    )
  }

  // Arbeidskorting.
  const akParams = ctx.aowBereikt ? hk.arbeidAow : hk.arbeid
  const ak = arbeidskortingBruto(ctx.arbeidsinkomen, akParams)
  const arbeid = rond('arbeid', ak.bedrag, akParams.max)
  uitleg.push(
    regel('hk-arbeid', 'Arbeidskorting', arbeid, 'min', {
      formule: ak.formule,
      parameter: ctx.aowBereikt ? 'heffingskortingen.arbeidAow' : 'heffingskortingen.arbeid',
    }),
  )

  // Inkomensafhankelijke combinatiekorting.
  const ip = hk.iack
  let iack = 0
  if (!ip.actief) {
    if (ctx.kinderen.length > 0) uitleg.push(regel('hk-iack', 'Combinatiekorting (IACK): bestaat niet in dit jaar', 0, 'info', { parameter: 'heffingskortingen.iack.actief' }))
  } else if (ctx.kinderen.length > 0) {
    const toetsen = ctx.kinderen.map((k) => toetsKind(k, ctx))
    const kwalificerend = toetsen.find((t) => t.voldoet)
    const partnerOk = !ctx.heeftFiscaalPartner || ctx.isMinstverdienende
    if (!kwalificerend) {
      uitleg.push(regel('hk-iack', 'Combinatiekorting (IACK): geen kind dat voldoet', 0, 'info', { formule: toetsen.map((t) => t.reden).join('; '), parameter: 'heffingskortingen.iack' }))
      const bijna = toetsen.find((t) => !t.kind.coOuderschap && t.leeftijd < ip.maxLeeftijdKind && t.maanden > 0 && t.maanden < ip.minMaandenHuishouden)
      if (bijna) {
        waarschuwingen.push(
          waarschuwing(
            'hk-iack-volgend-jaar',
            'info',
            `Geen combinatiekorting in ${ctx.jaar}: het kind hoort minder dan ${ip.minMaandenHuishouden} maanden tot het huishouden. Vanaf ${ctx.jaar + 1} is er wel recht als de andere voorwaarden kloppen.`,
          ),
        )
      }
    } else if (!partnerOk) {
      uitleg.push(
        regel('hk-iack', 'Combinatiekorting (IACK): alleen voor de partner met het laagste arbeidsinkomen', 0, 'info', { parameter: 'heffingskortingen.iack' }),
      )
    } else if (ctx.arbeidsinkomen <= ip.drempel) {
      uitleg.push(
        regel('hk-iack', 'Combinatiekorting (IACK): arbeidsinkomen niet boven de drempel', 0, 'info', {
          formule: `${eur(ctx.arbeidsinkomen)} ≤ ${eur(ip.drempel)}`,
          parameter: 'heffingskortingen.iack.drempel',
        }),
      )
    } else {
      iack = rond('iack', Math.min(ip.max, ip.pct * (ctx.arbeidsinkomen - ip.drempel)), ip.max)
      uitleg.push(
        regel('hk-iack', 'Inkomensafhankelijke combinatiekorting', iack, 'min', {
          formule: `min(${eur(ip.max)}, ${pct(ip.pct)} × (${eur(ctx.arbeidsinkomen)} − ${eur(ip.drempel)}))`,
          parameter: 'heffingskortingen.iack',
        }),
      )
      uitleg.push(regel('hk-iack-kind', kwalificerend.reden, 0, 'info', { niveau: 2 }))
    }
  }

  // Ouderenkorting.
  let ouderen = 0
  if (ctx.aowBereikt) {
    const o = hk.ouderen
    const basis = Math.max(0, o.max - o.afbouwPct * Math.max(0, ctx.verzamelinkomen - o.grens))
    const alleenstaand = ctx.heeftFiscaalPartner ? 0 : o.alleenstaand
    ouderen = rond('ouderen', basis + alleenstaand, o.max + alleenstaand)
    uitleg.push(
      regel('hk-ouderen', 'Ouderenkorting', ouderen, 'min', {
        formule:
          (ctx.verzamelinkomen > o.grens ? `${eur(o.max)} − ${pct(o.afbouwPct)} × (${eur(ctx.verzamelinkomen)} − ${eur(o.grens)})` : `maximum ${eur(o.max)}`) +
          (alleenstaand > 0 ? ` + alleenstaande ouderenkorting ${eur(alleenstaand)}` : ''),
        parameter: 'heffingskortingen.ouderen',
      }),
    )
  }

  // Jonggehandicaptenkorting: alleen op uitdrukkelijke invoer.
  const jonggehandicapt = ctx.jonggehandicapt ? rond('jonggehandicapt', hk.jonggehandicapt, hk.jonggehandicapt) : 0
  if (jonggehandicapt > 0) {
    uitleg.push(regel('hk-jonggehandicapt', 'Jonggehandicaptenkorting', jonggehandicapt, 'min', { parameter: 'heffingskortingen.jonggehandicapt' }))
  }

  // Korting groen beleggen.
  let groenBeleggen = 0
  if (ctx.groenVrijstelling > 0) {
    const g = hk.groenBeleggen
    const ruw = g.pct * ctx.groenVrijstelling
    groenBeleggen = rond('groenBeleggen', g.max === null ? ruw : Math.min(g.max, ruw), g.max ?? Number.POSITIVE_INFINITY)
    uitleg.push(
      regel('hk-groen', 'Heffingskorting groen beleggen', groenBeleggen, 'min', {
        formule: `${pct(g.pct, 2)} × ${eur(ctx.groenVrijstelling)}${g.max !== null ? `, maximaal ${eur(g.max)}` : ''}`,
        parameter: 'heffingskortingen.groenBeleggen',
      }),
    )
  }

  const bruto = algemeen + arbeid + iack + ouderen + jonggehandicapt + groenBeleggen
  const maxVerzilverbaar = Math.max(0, ctx.maxVerzilverbaar)
  const verzilverd = Math.min(bruto, maxVerzilverbaar)
  const nietVerzilverd = bruto - verzilverd

  uitleg.push(regel('hk-bruto', 'Heffingskortingen samen', bruto, 'subtotaal', { niveau: 0 }))
  if (nietVerzilverd > 0) {
    uitleg.push(
      regel('hk-niet-verzilverd', 'Niet te verrekenen deel (kortingen hoger dan belasting en premies)', nietVerzilverd, 'info', {
        formule: `${eur(bruto)} − ${eur(maxVerzilverbaar)}`,
      }),
    )
    const u = hk.uitbetalingMinstverdienende
    if (ctx.heeftFiscaalPartner && u.pct > 0 && ctx.geboortedatum < u.geborenVoor) {
      waarschuwingen.push(
        waarschuwing(
          'hk-uitbetaling',
          'info',
          `Je bent geboren vóór ${u.geborenVoor.slice(0, 4)}: een deel van de niet-verrekende kortingen kan worden uitbetaald aan de minstverdienende partner.`,
        ),
      )
    }
  }
  uitleg.push(regel('hk-verzilverd', 'Verrekende heffingskortingen', verzilverd, 'totaal', { niveau: 0 }))

  return {
    algemeen,
    arbeid,
    iack,
    ouderen,
    jonggehandicapt,
    groenBeleggen,
    bruto,
    verzilverd,
    nietVerzilverd,
    delen: SOORTEN.map((soort) => delen[soort] ?? { soort, totaal: 0, belastingdeel: 0, premiedeel: 0 }),
    uitleg,
    waarschuwingen,
  }
}
