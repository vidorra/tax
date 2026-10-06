/**
 * Zorgtoeslag, lineaire benadering van de normpremie:
 *   toeslag = maximum − afbouwPct × max(0, toetsingsinkomen − drempelinkomen)
 * Nul boven de inkomensgrens of boven de vermogensgrens van het huishouden.
 * (2026 getoetst: 1.550 − 13,73% × (40.857 − 29.736) ≈ 23.)
 */
import type { TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { regel, waarschuwing, eur, pct } from '../../uitleg'

export function berekenZorgtoeslag(
  toetsingsinkomen: number,
  vermogen: number,
  ctx: { params: TaxYearParams; partner: boolean },
): { bedrag: number; uitleg: Uitlegregel[]; waarschuwingen: Waarschuwing[] } {
  const z = ctx.params.toeslagen.waarde.zorgtoeslag
  const status = ctx.params.toeslagen.status
  const vermogensgrens = ctx.partner ? ctx.params.toeslagen.waarde.vermogensgrens.metPartner : ctx.params.toeslagen.waarde.vermogensgrens.alleen
  const max = ctx.partner ? z.maxPaar : z.maxAlleen
  const grens = ctx.partner ? z.grensPaar : z.grensAlleen
  const sleutel = ctx.partner ? 'Paar' : 'Alleen'
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []

  if (vermogen > vermogensgrens) {
    uitleg.push(
      regel('zorgtoeslag', 'Zorgtoeslag: geen recht door vermogen', 0, 'info', {
        niveau: 0,
        formule: `vermogen ${eur(vermogen)} boven de grens van ${eur(vermogensgrens)}`,
        parameter: `toeslagen.vermogensgrens.${ctx.partner ? 'metPartner' : 'alleen'}`,
        status,
      }),
    )
    return { bedrag: 0, uitleg, waarschuwingen }
  }
  if (toetsingsinkomen > grens) {
    uitleg.push(
      regel('zorgtoeslag', 'Zorgtoeslag: geen recht door inkomen', 0, 'info', {
        niveau: 0,
        formule: `toetsingsinkomen ${eur(toetsingsinkomen)} boven de grens van ${eur(grens)}`,
        parameter: `toeslagen.zorgtoeslag.grens${sleutel}`,
        status,
      }),
    )
    return { bedrag: 0, uitleg, waarschuwingen }
  }

  const boven = Math.max(0, toetsingsinkomen - z.drempelinkomen)
  const bedrag = Math.max(0, AFRONDING.toeslag(max - z.afbouwPct * boven))
  uitleg.push(
    regel('zorgtoeslag', 'Zorgtoeslag', bedrag, 'subtotaal', {
      niveau: 0,
      formule: `${eur(max)} − ${pct(z.afbouwPct)} × ${eur(boven)} (inkomen boven ${eur(z.drempelinkomen)})`,
      parameter: `toeslagen.zorgtoeslag.max${sleutel}`,
      status,
    }),
  )
  if (bedrag > 0) {
    waarschuwingen.push(
      waarschuwing('zorgtoeslag-benadering', 'info', 'De zorgtoeslag is berekend met een rechte lijn tussen het maximum en de inkomensgrens. De Belastingdienst rekent met de normpremie; het verschil is meestal enkele euro\'s.'),
    )
  }
  return { bedrag, uitleg, waarschuwingen }
}
