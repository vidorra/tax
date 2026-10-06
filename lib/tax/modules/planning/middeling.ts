/**
 * Middeling (art. 3.154 Wet IB 2001, laatste tijdvak 2022-2024).
 *
 * Over drie aaneengesloten jaren wordt de box 1-belasting en -premie opnieuw berekend
 * op het gemiddelde inkomen. teruggaaf = max(0, werkelijk − herberekend − drempel).
 * Alleen mogelijk als `overig.middeling.mogelijk` en het tijdvak niet na het laatste
 * toegestane tijdvak eindigt. Het verzoek moet binnen `termijnMaanden` na de laatste
 * definitieve aanslag van de drie jaren worden gedaan.
 *
 * `box1Belasting(jaar, inkomen)` wordt geïnjecteerd: belasting plus premie box 1
 * zonder heffingskortingen, met de tarieven van dat jaar.
 */
import type { TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { regel, waarschuwing, eur, euro } from '../../uitleg'

const AANTAL_JAREN = 3

export function berekenMiddeling(
  jaren: Array<{ jaar: number; box1Inkomen: number; box1BelastingEnPremie: number }>,
  box1Belasting: (jaar: number, inkomen: number) => number,
  ctx: { params: TaxYearParams },
): { teruggaaf: number; gemiddeld: number; uitleg: Uitlegregel[]; waarschuwingen: Waarschuwing[] } {
  const m = ctx.params.overig.waarde.middeling
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const gesorteerd = [...jaren].sort((a, b) => a.jaar - b.jaar)

  const aaneengesloten = gesorteerd.length === AANTAL_JAREN && gesorteerd.every((j, i) => i === 0 || j.jaar === gesorteerd[i - 1].jaar + 1)
  if (!aaneengesloten) {
    waarschuwingen.push(waarschuwing('middeling-jaren', 'actie', `Middeling gaat over precies ${AANTAL_JAREN} aaneengesloten kalenderjaren.`))
    return { teruggaaf: 0, gemiddeld: 0, uitleg, waarschuwingen }
  }
  const laatste = m.laatsteTijdvak[AANTAL_JAREN - 1]
  if (!m.mogelijk || gesorteerd[AANTAL_JAREN - 1].jaar > laatste) {
    waarschuwingen.push(
      waarschuwing('middeling-niet-mogelijk', 'info', `Middeling is afgeschaft; het laatste tijdvak is ${m.laatsteTijdvak.join(', ')}. Voor ${gesorteerd.map((j) => j.jaar).join(', ')} kan het niet meer.`),
    )
    return { teruggaaf: 0, gemiddeld: 0, uitleg, waarschuwingen }
  }

  const som = gesorteerd.reduce((s, j) => s + j.box1Inkomen, 0)
  const gemiddeld = som / AANTAL_JAREN
  let werkelijk = 0
  let herberekend = 0
  for (const j of gesorteerd) {
    const her = box1Belasting(j.jaar, gemiddeld)
    werkelijk += j.box1BelastingEnPremie
    herberekend += her
    uitleg.push(
      regel(`middeling.${j.jaar}`, `${j.jaar}: belasting en premie box 1`, j.box1BelastingEnPremie, 'info', {
        niveau: 2,
        formule: `inkomen ${eur(j.box1Inkomen)}; op het gemiddelde ${eur(gemiddeld)} wordt dat ${eur(her)}`,
      }),
    )
  }
  const verschil = werkelijk - herberekend
  const teruggaaf = Math.max(0, verschil - m.drempel)
  uitleg.unshift(
    regel('middeling.gemiddeld', `Gemiddeld box 1-inkomen ${gesorteerd[0].jaar} tot en met ${gesorteerd[AANTAL_JAREN - 1].jaar}`, gemiddeld, 'info', {
      niveau: 1,
      formule: `${eur(som)} / ${AANTAL_JAREN}`,
    }),
  )
  uitleg.push(
    regel('middeling.werkelijk', 'Werkelijk betaald (belasting en premie box 1, zonder heffingskortingen)', werkelijk, 'plus', { niveau: 1 }),
    regel('middeling.herberekend', 'Herberekend op het gemiddelde inkomen', herberekend, 'min', { niveau: 1 }),
    regel('middeling.drempel', 'Drempel', m.drempel, 'min', { niveau: 1, parameter: 'overig.middeling.drempel' }),
    regel('middeling', 'Teruggaaf door middeling', teruggaaf, 'totaal', {
      niveau: 0,
      formule: `max(0, ${eur(werkelijk)} − ${eur(herberekend)} − ${eur(m.drempel)})`,
      parameter: 'overig.middeling',
      status: ctx.params.overig.status,
    }),
  )
  if (teruggaaf > 0) {
    waarschuwingen.push(
      waarschuwing(
        'middeling-termijn',
        'actie',
        `Middeling levert naar verwachting ${euro(teruggaaf)} op. Dien het verzoek in binnen ${m.termijnMaanden} maanden na de datum van de laatste definitieve aanslag van ${gesorteerd.map((j) => j.jaar).join(', ')}; een jaar kan maar in één middelingstijdvak zitten.`,
      ),
    )
  } else {
    waarschuwingen.push(waarschuwing('middeling-geen', 'info', `Middeling levert hier niets op: het verschil van ${euro(Math.max(0, verschil))} valt binnen de drempel van ${euro(m.drempel)}.`))
  }
  return { teruggaaf, gemiddeld, uitleg, waarschuwingen }
}
