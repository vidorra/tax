/**
 * Inkomensafhankelijke bijdrage Zorgverzekeringswet voor IB-ondernemers (en ander inkomen
 * zonder ingehouden bijdrage).
 *
 * bijdrage = AFRONDING.zvw(pctOndernemer × max(0, min(bijdrageInkomen, maxBijdrageInkomen − loonMetIngehoudenBijdrage)))
 *
 * Voorbeeldhuishouden, persoon B: 2024 36.869 → 5,32% × 36.869 = 1.961; 2021 19.786 → 5,75% × 19.786 = 1.137.
 */
import type { TaxYearParams, Uitlegregel, Waarschuwing, ZvwResultaat } from '../types'
import { AFRONDING } from '../rounding'
import { eur, pct, regel } from '../uitleg'

export interface ZvwContext {
  params: TaxYearParams
  /** Belastbare winst + resultaat overig werk + uitkeringen zonder ingehouden bijdrage. */
  bijdrageInkomen: number
  /** Loon of uitkering waarover al een Zvw-bijdrage is ingehouden (telt mee voor het maximum). */
  loonMetIngehoudenBijdrage: number
  /** Voorlopige aanslag Zvw die al is opgelegd of betaald. */
  voorlopig: number
}

/**
 * `bijdrageInkomen` in het resultaat is het inkomen waarover de bijdrage werkelijk wordt
 * berekend (na het maximum), zoals de regel "Bijdrage-inkomen Zvw (min. 0)" in het fiscaal rapport.
 */
export function berekenZvw(ctx: ZvwContext): ZvwResultaat {
  const z = ctx.params.zvw.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []

  const ruimte = Math.max(0, z.maxBijdrageInkomen - Math.max(0, ctx.loonMetIngehoudenBijdrage))
  const grondslag = Math.max(0, Math.min(ctx.bijdrageInkomen, ruimte))
  const bijdrage = AFRONDING.zvw(z.pctOndernemer * grondslag)
  const voorlopig = ctx.voorlopig
  const teBetalen = bijdrage - voorlopig

  uitleg.push(regel('zvw-inkomen', 'Inkomen voor de Zvw-bijdrage', ctx.bijdrageInkomen, 'info', { niveau: 0 }))
  if (ctx.loonMetIngehoudenBijdrage > 0) {
    uitleg.push(
      regel('zvw-loon', 'Loon waarover al bijdrage is ingehouden', ctx.loonMetIngehoudenBijdrage, 'min', {
        formule: `ruimte tot het maximum: ${eur(z.maxBijdrageInkomen)} − ${eur(ctx.loonMetIngehoudenBijdrage)} = ${eur(ruimte)}`,
        parameter: 'zvw.maxBijdrageInkomen',
      }),
    )
  }
  uitleg.push(
    regel('zvw-grondslag', 'Bijdrage-inkomen Zvw', grondslag, 'subtotaal', {
      formule: `min(${eur(ctx.bijdrageInkomen)}, ${eur(ruimte)})`,
      parameter: 'zvw.maxBijdrageInkomen',
    }),
  )
  uitleg.push(
    regel('zvw-bijdrage', 'Inkomensafhankelijke bijdrage Zvw', bijdrage, 'plus', {
      formule: `${pct(z.pctOndernemer)} × ${eur(grondslag)}`,
      parameter: 'zvw.pctOndernemer',
    }),
  )
  if (voorlopig !== 0) uitleg.push(regel('zvw-voorlopig', 'Voorlopige aanslag Zvw', voorlopig, 'min'))
  uitleg.push(regel('zvw-te-betalen', teBetalen >= 0 ? 'Zvw nog te betalen' : 'Zvw terug te ontvangen', teBetalen, 'totaal', { niveau: 0 }))

  return {
    bijdrageInkomen: grondslag,
    bijdrage,
    voorlopig,
    teBetalen,
    inkomenVoorMaximum: ctx.bijdrageInkomen,
    loonMetIngehoudenBijdrage: Math.max(0, ctx.loonMetIngehoudenBijdrage),
    uitleg,
    waarschuwingen,
  }
}
