/**
 * Toeslagen van het huishouden: kinderopvangtoeslag, kindgebonden budget,
 * zorgtoeslag en kinderbijslag.
 *
 * - toetsingsinkomen = som van de verzamelinkomens van beide partners (box 3 na tegenbewijs);
 * - vermogenToets = rendementsgrondslag op 1 januari vóór heffingsvrij vermogen, inclusief
 *   vermogen van de kinderen (geldt voor KGB en zorgtoeslag, niet voor KOT);
 * - opgegevenToetsingsinkomen (optioneel) = het inkomen dat bij Toeslagen is opgegeven;
 *   wijkt het meer dan AFWIJKING_SIGNAAL af, dan volgt een waarschuwing voor
 *   terugvordering of nabetaling met het verschil in toeslagen.
 */
import type { KindInvoer, TaxYearParams, ToeslagenResultaat, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { regel, waarschuwing, eur, euro, pct } from '../../uitleg'
import { berekenKot } from './kot'
import { berekenKgb } from './kgb'
import { berekenZorgtoeslag } from './zorgtoeslag'
import { berekenKinderbijslag } from './kinderbijslag'

export { berekenKot } from './kot'
export { berekenKgb } from './kgb'
export { berekenZorgtoeslag } from './zorgtoeslag'
export { berekenKinderbijslag } from './kinderbijslag'

/** Eigen signaalgrens (geen wettelijke regel): afwijking opgegeven ten opzichte van berekend toetsingsinkomen. */
export const AFWIJKING_SIGNAAL = 0.05

export interface ToeslagenCtx {
  params: TaxYearParams
  jaar: number
  toetsingsinkomen: number
  vermogenToets: number
  partner: boolean
  /** Inkomen dat bij Toeslagen is opgegeven voor het voorschot. */
  opgegevenToetsingsinkomen?: number
}

const inkomensafhankelijk = (kinderen: KindInvoer[], inkomen: number, ctx: ToeslagenCtx): number => {
  const kot = berekenKot(kinderen, inkomen, { params: ctx.params, jaar: ctx.jaar }).totaal
  const kgb = berekenKgb(kinderen, inkomen, ctx.vermogenToets, { params: ctx.params, jaar: ctx.jaar, partner: ctx.partner }).bedrag
  const zorg = berekenZorgtoeslag(inkomen, ctx.vermogenToets, { params: ctx.params, partner: ctx.partner }).bedrag
  return kot + kgb + zorg
}

export function berekenToeslagen(kinderen: KindInvoer[], ctx: ToeslagenCtx): ToeslagenResultaat {
  const inkomen = Math.max(0, ctx.toetsingsinkomen)
  const kot = berekenKot(kinderen, inkomen, { params: ctx.params, jaar: ctx.jaar })
  const kgb = berekenKgb(kinderen, inkomen, ctx.vermogenToets, { params: ctx.params, jaar: ctx.jaar, partner: ctx.partner })
  const zorg = berekenZorgtoeslag(inkomen, ctx.vermogenToets, { params: ctx.params, partner: ctx.partner })
  const kb = berekenKinderbijslag(kinderen, { params: ctx.params, jaar: ctx.jaar })

  const totaal = AFRONDING.toeslag((kot.totaal + kgb.bedrag + zorg.bedrag + kb.totaal) * 100) / 100

  const uitleg: Uitlegregel[] = [
    regel('toeslagen', 'Toeslagen en kinderbijslag', totaal, 'totaal', {
      niveau: 0,
      formule: `toetsingsinkomen ${eur(inkomen)} (verzamelinkomen${ctx.partner ? ' van jou en je partner samen' : ''}), vermogen voor de toets ${eur(ctx.vermogenToets)}`,
      parameter: 'toeslagen',
      status: ctx.params.toeslagen.status,
    }),
    ...kot.uitleg,
    ...kgb.uitleg,
    ...zorg.uitleg,
    ...kb.uitleg,
  ]
  const waarschuwingen: Waarschuwing[] = [...kot.waarschuwingen, ...kgb.waarschuwingen, ...zorg.waarschuwingen]

  const opgegeven = ctx.opgegevenToetsingsinkomen
  if (opgegeven !== undefined && opgegeven >= 0) {
    const basis = Math.max(1, inkomen)
    const afwijking = (inkomen - opgegeven) / basis
    if (Math.abs(afwijking) > AFWIJKING_SIGNAAL) {
      const voorschot = inkomensafhankelijk(kinderen, opgegeven, ctx)
      const definitief = kot.totaal + kgb.bedrag + zorg.bedrag
      const verschil = definitief - voorschot
      const hoger = inkomen > opgegeven
      const tekstBedrag =
        verschil === 0
          ? 'Voor de hoogte van de toeslagen maakt het hier niets uit.'
          : verschil < 0
            ? `Je moet dan naar verwachting ongeveer ${euro(-verschil)} terugbetalen.`
            : `Je krijgt dan naar verwachting ongeveer ${euro(verschil)} nabetaald.`
      waarschuwingen.push(
        waarschuwing(
          'toeslagen-toetsingsinkomen',
          verschil < 0 ? 'actie' : 'let-op',
          `Het berekende toetsingsinkomen (${euro(inkomen)}) is ${pct(Math.abs(afwijking), 0)} ${hoger ? 'hoger' : 'lager'} dan het inkomen dat bij Toeslagen is opgegeven (${euro(opgegeven)}). ${tekstBedrag} Pas het inkomen aan via Mijn toeslagen om dat te voorkomen. De grens van ${pct(AFWIJKING_SIGNAAL, 0)} is een eigen vuistregel van deze tool.`,
        ),
      )
      uitleg.push(
        regel('toeslagen.verschil-voorschot', 'Verschil met het voorschot op basis van het opgegeven inkomen', verschil, verschil < 0 ? 'min' : 'plus', {
          niveau: 1,
          formule: `definitief ${eur(definitief)} − voorschot ${eur(voorschot)} (kinderopvangtoeslag, kindgebonden budget en zorgtoeslag)`,
        }),
      )
    }
  }

  return {
    toetsingsinkomen: inkomen,
    vermogenToets: ctx.vermogenToets,
    kot,
    kgb: kgb.bedrag,
    zorgtoeslag: zorg.bedrag,
    kinderbijslag: kb.totaal,
    kinderbijslagPerKwartaal: kb.perKwartaal,
    totaal,
    uitleg,
    waarschuwingen,
  }
}
