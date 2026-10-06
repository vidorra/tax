/**
 * Verliesverrekening box 1 (art. 3.150 e.v. Wet IB 2001).
 *
 *  - Een nieuw verlies wordt verplicht eerst met de `terug` voorgaande jaren verrekend (verliesbeschikking en
 *    teruggaaf tegen het tarief van dat jaar); dat valt buiten deze berekening en volgt als waarschuwing.
 *  - Openstaande verliezen uit eerdere jaren gaan vooruit, oudste eerst, tot het box 1-inkomen van dit jaar.
 *  - Een verlies vervalt na `vooruit` jaren (vervaltNa = verliesjaar + vooruit).
 *  - Verliezen box 1 zijn niet verrekenbaar met box 2 of box 3.
 */
import type { TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { eur, euro, regel, waarschuwing } from '../uitleg'

export function verrekenVerliezen(
  box1Inkomen: number,
  verliezen: Array<{ jaar: number; bedrag: number }>,
  ctx: { params: TaxYearParams; jaar: number },
): { verrekend: number; resterend: Array<{ jaar: number; bedrag: number; vervaltNa: number }>; nieuwVerlies: number; uitleg: Uitlegregel[]; waarschuwingen: Waarschuwing[] } {
  const { terug, vooruit } = ctx.params.box1.waarde.verliesverrekening
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []

  const open = verliezen
    .filter((v) => v.bedrag > 0 && v.jaar < ctx.jaar)
    .map((v) => ({ jaar: v.jaar, bedrag: v.bedrag, vervaltNa: v.jaar + vooruit }))
    .sort((a, b) => a.jaar - b.jaar)

  const resterend: Array<{ jaar: number; bedrag: number; vervaltNa: number }> = []
  let ruimte = Math.max(0, box1Inkomen)
  let verrekend = 0
  for (const v of open) {
    if (ctx.jaar > v.vervaltNa) {
      waarschuwingen.push(
        waarschuwing('verlies.vervallen', 'info', `Het verlies uit ${v.jaar} (${euro(v.bedrag)}) is vervallen: verliezen gaan maximaal ${vooruit} jaar vooruit.`),
      )
      continue
    }
    const neem = Math.min(ruimte, v.bedrag)
    if (neem > 0) {
      verrekend += neem
      ruimte -= neem
      uitleg.push(
        regel('verlies.verrekend', `Verlies uit ${v.jaar}`, neem, 'min', {
          formule: neem < v.bedrag ? `${eur(neem)} van ${eur(v.bedrag)}` : `volledig verrekend`,
          parameter: 'box1.verliesverrekening.vooruit',
        }),
      )
    }
    const rest = v.bedrag - neem
    if (rest > 0) {
      resterend.push({ jaar: v.jaar, bedrag: rest, vervaltNa: v.vervaltNa })
      if (v.vervaltNa === ctx.jaar) {
        waarschuwingen.push(
          waarschuwing('verlies.vervaltDitJaar', 'let-op', `Van het verlies uit ${v.jaar} blijft ${euro(rest)} over; dat vervalt na dit jaar.`),
        )
      }
    }
  }
  if (verrekend > 0) {
    uitleg.push(regel('verlies.totaal', 'Verrekende verliezen uit eerdere jaren', verrekend, 'subtotaal', { niveau: 0 }))
  }

  const nieuwVerlies = box1Inkomen < 0 ? -box1Inkomen : 0
  if (nieuwVerlies > 0) {
    uitleg.push(
      regel('verlies.nieuw', 'Verlies van dit jaar', nieuwVerlies, 'info', {
        formule: `eerst terug naar ${ctx.jaar - terug} tot en met ${ctx.jaar - 1}, de rest vooruit tot en met ${ctx.jaar + vooruit}`,
        parameter: 'box1.verliesverrekening',
      }),
    )
    waarschuwingen.push(
      waarschuwing(
        'verlies.terug',
        'actie',
        `Je hebt in box 1 een verlies van ${euro(nieuwVerlies)}. Dat wordt eerst verrekend met het inkomen van de ${terug} voorgaande jaren (${ctx.jaar - terug} tot en met ${ctx.jaar - 1}). De Belastingdienst geeft daarvoor een verliesbeschikking; je krijgt belasting terug tegen het tarief van die jaren. Wat overblijft gaat vooruit.`,
      ),
    )
  }

  return { verrekend, resterend, nieuwVerlies, uitleg, waarschuwingen }
}
