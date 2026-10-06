/**
 * Werkelijk rendement in box 3 voor de tegenbewijsregeling (Wet tegenbewijsregeling box 3).
 *
 * Per huishouden: Σ (directe opbrengsten + waarde einde − waarde begin − stortingen + onttrekkingen)
 * over alle posities in de pot, plus voor vastgoed in eigen gebruik eigenGebruikPct × WOZ × dagen/365,
 * minus betaalde rente op schulden. Geen heffingsvrij vermogen, geen schuldendrempel, geen kostenaftrek,
 * niet lager dan nul. Ongerealiseerde waardeveranderingen tellen mee; voor vastgoed met WOZ-gegevens
 * geldt WOZ einde min WOZ begin.
 *
 * Art. 5.26 lid 3: bij het werkelijk rendement gelden de schuldendrempel (art. 5.3 lid 3 onder f), de vrijstellingen
 * van art. 5.10 onder a en d (onder meer contant geld) en de vrijstelling voor groene beleggingen (art. 5.13) niet.
 * Groene beleggingen en contant geld tellen dus volledig mee. Alleen een vrijgestelde nettolijfrente telt niet mee
 * (die vrijstelling staat niet in lid 3).
 */
import type { Box3Invoer, Uitlegregel, VermogensPositie, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { eur, pct, regel, waarschuwing } from '../../uitleg'
import { inPot, type Box3Context } from './forfaitair'

export interface WerkelijkRendementUitkomst {
  /** Werkelijk rendement van het huishouden (niet negatief). */
  rendement: number
  /** Rendement vóór de ondergrens van nul. */
  rendementOnbegrensd: number
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
  /** Aantal posities zonder waarde aan het einde van het jaar (als ongewijzigd gerekend). */
  zonderEindwaarde: number
}

const DAGEN_PER_JAAR = 365

/** Werkelijk rendement van één positie (zonder vrijstellingsfactor). */
export function rendementPositie(x: VermogensPositie, eigenGebruikPct: number): { bedrag: number; formule: string; eindOntbreekt: boolean } {
  const opbrengst = x.directeOpbrengsten ?? 0
  const stortingen = x.stortingen ?? 0
  const onttrekkingen = x.onttrekkingen ?? 0
  if (x.categorie === 'onroerend' && x.woz) {
    const mutatie = x.woz.eind - x.woz.begin
    const eigenGebruik = eigenGebruikPct > 0 && x.woz.dagenEigenGebruik ? (eigenGebruikPct * x.woz.begin * x.woz.dagenEigenGebruik) / DAGEN_PER_JAAR : 0
    const bedrag = opbrengst + mutatie - stortingen + onttrekkingen + eigenGebruik
    const delen = [`opbrengst ${eur(opbrengst)}`, `WOZ ${eur(x.woz.eind)} − ${eur(x.woz.begin)}`]
    if (eigenGebruik > 0) delen.push(`eigen gebruik ${pct(eigenGebruikPct)} × ${eur(x.woz.begin)} × ${x.woz.dagenEigenGebruik}/${DAGEN_PER_JAAR}`)
    if (stortingen || onttrekkingen) delen.push(`− stortingen ${eur(stortingen)} + onttrekkingen ${eur(onttrekkingen)}`)
    return { bedrag, formule: delen.join(', '), eindOntbreekt: false }
  }
  const eindOntbreekt = x.waardeEind === undefined
  const eind = x.waardeEind ?? x.waardeBegin
  const bedrag = opbrengst + eind - x.waardeBegin - stortingen + onttrekkingen
  const formule = `${eur(opbrengst)} + ${eur(eind)} − ${eur(x.waardeBegin)} − ${eur(stortingen)} + ${eur(onttrekkingen)}`
  return { bedrag, formule, eindOntbreekt }
}

export function berekenWerkelijkRendement(invoer: Box3Invoer, ctx: Box3Context): WerkelijkRendementUitkomst {
  const b = ctx.params.box3.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const posities = invoer.posities.filter((x) => inPot(x.eigenaar, ctx))
  const schulden = invoer.schulden.filter((x) => inPot(x.eigenaar, ctx))

  let totaal = 0
  let zonderEindwaarde = 0
  for (const x of posities) {
    if (x.categorie === 'nettolijfrente' && b.vrijstellingen.nettolijfrente) continue
    const r = rendementPositie(x, b.tegenbewijs.eigenGebruikPct)
    if (r.eindOntbreekt) zonderEindwaarde += 1
    totaal += r.bedrag
    uitleg.push(
      regel(`box3-werkelijk-${x.id}`, `Werkelijk rendement ${x.omschrijving}`, AFRONDING.box3Voordeel(r.bedrag), r.bedrag < 0 ? 'min' : 'plus', {
        niveau: 2,
        formule: x.categorie === 'groen' ? `${r.formule} (groene vrijstelling geldt niet bij het werkelijk rendement)` : r.formule,
      }),
    )
  }
  const rente = schulden.reduce((s, x) => s + Math.max(0, x.betaaldeRente ?? 0), 0)
  if (rente > 0) {
    totaal -= rente
    uitleg.push(regel('box3-werkelijk-rente', 'Betaalde rente op schulden', rente, 'min', { niveau: 2 }))
  }

  const rendementOnbegrensd = AFRONDING.box3Voordeel(totaal)
  const rendement = Math.max(0, rendementOnbegrensd)
  const kanaal =
    b.tegenbewijs.kanaal === 'owr-formulier'
      ? 'Je geeft het werkelijk rendement op met het formulier Opgaaf werkelijk rendement, na ontvangst van de brief van de Belastingdienst.'
      : b.tegenbewijs.kanaal === 'aangifte'
        ? 'Je geeft het werkelijk rendement op in de aangifte zelf; de Belastingdienst past het laagste bedrag toe.'
        : 'Tegenbewijs is in dit jaar niet mogelijk.'
  uitleg.push(
    regel('box3-werkelijk', 'Werkelijk rendement van het huishouden', rendement, 'subtotaal', {
      niveau: 1,
      formule: rendementOnbegrensd < 0 ? `${eur(rendementOnbegrensd)}, niet lager dan 0` : `zonder heffingsvrij vermogen en zonder schuldendrempel. ${kanaal}`,
      parameter: 'box3.tegenbewijs.kanaal',
    }),
  )
  if (zonderEindwaarde > 0) {
    waarschuwingen.push(
      waarschuwing(
        'box3-werkelijk-eindwaarde',
        'let-op',
        `Bij ${zonderEindwaarde} ${zonderEindwaarde === 1 ? 'positie' : 'posities'} ontbreekt de waarde aan het einde van het jaar; die is als ongewijzigd gerekend. Vul de eindwaarde in voor een juist werkelijk rendement.`,
      ),
    )
  }
  if (posities.some((x) => x.bronbelasting && x.bronbelasting.bedrag > 0)) {
    waarschuwingen.push(
      waarschuwing('box3-werkelijk-bruto', 'info', 'Neem dividend en rente bruto op (inclusief ingehouden bronbelasting); de bronbelasting zelf is geen aftrekpost.'),
    )
  }
  return { rendement, rendementOnbegrensd, uitleg, waarschuwingen, zonderEindwaarde }
}
