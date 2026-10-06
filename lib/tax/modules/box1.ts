/**
 * Box 1: belasting per schijf, premie volksverzekeringen en tariefmaatregel.
 *
 * - belasting per schijf = AFRONDING.schijf(belastingDeel × deel); schijf 1 rekent alleen het
 *   belastingdeel, de premies staan apart.
 * - premie = AFRONDING.premie((AOW + Anw + Wlz) × min(inkomen, premie-inkomen max)); wie de
 *   AOW-leeftijd heeft bereikt betaalt geen AOW-premie, het belastingdeel van schijf 1 blijft.
 *   Het maximale premie-inkomen is de grens van schijf 1, of `schijf1TotGeborenVoor1946`.
 * - tariefmaatregel = AFRONDING.tariefmaatregel((toptarief − aftrekTariefMax) × deel van de
 *   aftrekposten dat in het toptarief valt).
 *
 * Voorbeeldhuishouden (lib/voorbeeld), persoon A: 2024 108.257 met 29.811 aftrek → schijf 1 en 2 vol, schijf 3
 * 16.205, tariefmaatregel 3.735, samen 37.324; 2021 59.099 met 19.593 aftrek → schijf 1 vol, schijf 2 8.892,
 * tariefmaatregel 1.273. In beide jaren premie over het maximum premie-inkomen.
 */
import type { Box1Resultaat, Schijf, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { AFRONDING } from '../rounding'
import { eur, euro, pct, regel, waarschuwing } from '../uitleg'

export interface Box1Context {
  params: TaxYearParams
  /** AOW-leeftijd bereikt (heel jaar AOW-tarief): geen AOW-premie. */
  aowBereikt: boolean
  /** Geboren vóór 1946: afwijkende grens schijf 1 als de AOW-leeftijd is bereikt. */
  geborenVoor1946: boolean
}

/** Schijven met de grens van schijf 1 aangepast voor AOW-gerechtigden geboren vóór 1946. */
function effectieveSchijven(params: TaxYearParams, aowBereikt: boolean, geborenVoor1946: boolean): Schijf[] {
  const p = params.box1.waarde
  if (!(aowBereikt && geborenVoor1946) || p.schijven.length === 0) return p.schijven
  return p.schijven.map((s, i) => (i === 0 ? { ...s, tot: p.schijf1TotGeborenVoor1946 } : s))
}

export function berekenBox1(inkomen: number, tariefmaatregelAftrek: number, ctx: Box1Context): Box1Resultaat {
  const p = ctx.params.box1.waarde
  const schijven = effectieveSchijven(ctx.params, ctx.aowBereikt, ctx.geborenVoor1946)
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const basis = Math.max(0, inkomen)

  uitleg.push(regel('box1-inkomen', 'Belastbaar inkomen uit werk en woning', inkomen, 'subtotaal', { niveau: 0 }))
  if (inkomen < 0) {
    waarschuwingen.push(
      waarschuwing(
        'box1-negatief',
        'let-op',
        `Het inkomen in box 1 is negatief (${euro(inkomen)}). Er is geen belasting verschuldigd; het verlies kun je verrekenen met eerdere of latere jaren.`,
      ),
    )
  }

  // Belasting per schijf (alleen het belastingdeel).
  const resultaatSchijven: Box1Resultaat['schijven'] = []
  let van = 0
  let belastingSchijven = 0
  schijven.forEach((s, i) => {
    const bovengrens = s.tot ?? Infinity
    const over = Math.max(0, Math.min(basis, bovengrens) - van)
    const belasting = AFRONDING.schijf(s.belastingDeel * over)
    resultaatSchijven.push({ van, tot: s.tot, over, tarief: s.belastingDeel, belasting })
    belastingSchijven += belasting
    if (over > 0) {
      uitleg.push(
        regel(`box1-schijf-${i + 1}`, `Belasting schijf ${i + 1}`, belasting, 'plus', {
          formule: `${pct(s.belastingDeel)} × ${eur(over)}`,
          parameter: `box1.schijven[${i}].belastingDeel`,
        }),
      )
    }
    van = bovengrens
  })

  // Premie volksverzekeringen.
  const premiePct = (ctx.aowBereikt ? 0 : p.premies.aow) + p.premies.anw + p.premies.wlz
  const premieGrens = schijven[0]?.tot ?? 0
  const premieInkomen = Math.min(basis, premieGrens)
  const premie = AFRONDING.premie(premiePct * premieInkomen)

  // Tariefmaatregel: aftrekposten die in het toptarief vallen, tegen maximaal aftrekTariefMax.
  const top = schijven[schijven.length - 1]
  const startTop = schijven.length >= 2 ? (schijven[schijven.length - 2].tot ?? 0) : 0
  const toptarief = top?.belastingDeel ?? 0
  const correctiePct = Math.max(0, toptarief - p.aftrekTariefMax)
  const aftrek = Math.max(0, tariefmaatregelAftrek)
  const aftrekInTop = Math.max(0, Math.min(aftrek, inkomen + aftrek - startTop))
  const tariefmaatregel = schijven.length >= 2 ? AFRONDING.tariefmaatregel(correctiePct * aftrekInTop) : 0

  if (tariefmaatregel > 0) {
    uitleg.push(
      regel('box1-tariefmaatregel', 'Beperking tarief aftrekposten (tariefmaatregel)', tariefmaatregel, 'plus', {
        formule: `(${pct(toptarief)} − ${pct(p.aftrekTariefMax)}) × ${eur(aftrekInTop)}`,
        parameter: 'box1.aftrekTariefMax',
      }),
    )
  } else if (aftrek > 0) {
    uitleg.push(
      regel('box1-tariefmaatregel', 'Beperking tarief aftrekposten (tariefmaatregel)', 0, 'info', {
        formule: `Inkomen plus aftrekposten (${eur(inkomen + aftrek)}) komt niet boven ${eur(startTop)}`,
        parameter: 'box1.aftrekTariefMax',
      }),
    )
  }

  const belasting = belastingSchijven + tariefmaatregel
  uitleg.push(regel('box1-belasting', 'Belasting box 1', belasting, 'subtotaal', { niveau: 0 }))

  uitleg.push(
    regel('box1-premie', 'Premie volksverzekeringen', premie, 'plus', {
      formule: `${pct(premiePct)} × ${eur(premieInkomen)}${ctx.aowBereikt ? ' (zonder AOW-premie)' : ''}`,
      parameter: ctx.aowBereikt ? 'box1.premies.anw + box1.premies.wlz' : 'box1.premies',
    }),
  )

  const totaal = belasting + premie
  uitleg.push(regel('box1-totaal', 'Belasting en premies box 1', totaal, 'totaal', { niveau: 0 }))

  // Premie per volksverzekering, elk apart afgerond (zo staan ze in het fiscaal rapport; het totaal blijft `premie`).
  const premieRegels: NonNullable<Box1Resultaat['premieRegels']> = []
  if (!ctx.aowBereikt) premieRegels.push({ soort: 'aow', pct: p.premies.aow, bedrag: AFRONDING.premie(p.premies.aow * premieInkomen) })
  premieRegels.push({ soort: 'anw', pct: p.premies.anw, bedrag: AFRONDING.premie(p.premies.anw * premieInkomen) })
  premieRegels.push({ soort: 'wlz', pct: p.premies.wlz, bedrag: AFRONDING.premie(p.premies.wlz * premieInkomen) })

  return {
    inkomen,
    schijven: resultaatSchijven,
    belasting,
    premie,
    tariefmaatregel,
    totaal,
    premieInkomen,
    premieRegels,
    tariefmaatregelGrondslag: schijven.length >= 2 ? aftrekInTop : 0,
    tariefmaatregelPct: correctiePct,
    uitleg,
    waarschuwingen,
  }
}
