/**
 * Kinderbijslag (AKW, uitbetaald door de SVB), inkomensonafhankelijk.
 *
 * Regels:
 *  - Recht per kwartaal; peildatum is de eerste dag van het kwartaal. Het eerste recht
 *    ontstaat in het kwartaal na de geboorte (of na de datum waarop het kind tot het
 *    huishouden gaat horen). Een kind dat op de eerste dag van een kwartaal is geboren,
 *    telt in dat kwartaal al mee.
 *  - De leeftijd op de eerste dag van het kwartaal bepaalt de leeftijdsgroep.
 *  - Het bedrag komt uit de params-regel die op die kwartaalstart geldt (laatste `vanaf` ≤ start).
 *
 * De leeftijdsgrenzen volgen uit de veldnamen van `toeslagen.kinderbijslag` (tot5, tot11, tot17).
 */
import type { KindInvoer, TaxYearParams, Uitlegregel } from '../../types'
import { AFRONDING } from '../../rounding'
import { regel, datumNL } from '../../uitleg'
import { isoDatum, kwartaalStarts, leeftijdOp, parseDatum } from '../../datum'
import { eurCent } from './kot'

/** Eerste leeftijd die niet meer in de groep valt (afgeleid van de veldnamen tot5, tot11, tot17). */
export const KINDERBIJSLAG_GROEPEN = [
  { veld: 'tot5', totLeeftijd: 6, label: '0 tot en met 5 jaar' },
  { veld: 'tot11', totLeeftijd: 12, label: '6 tot en met 11 jaar' },
  { veld: 'tot17', totLeeftijd: 18, label: '12 tot en met 17 jaar' },
] as const

/** Leeftijd waarop kinderbijslag en kindgebonden budget stoppen. */
export const LEEFTIJD_VOLWASSEN = KINDERBIJSLAG_GROEPEN[KINDERBIJSLAG_GROEPEN.length - 1].totLeeftijd

const MAANDEN_PER_KWARTAAL = 3

/** Eerste kwartaalstart op of na `datum`: daar begint het recht op kinderbijslag. */
export function eersteRechtKwartaal(datum: string): string {
  const d = parseDatum(datum)
  const m = d.getUTCMonth()
  if (d.getUTCDate() === 1 && m % MAANDEN_PER_KWARTAAL === 0) return datum
  const volgende = (Math.floor(m / MAANDEN_PER_KWARTAAL) + 1) * MAANDEN_PER_KWARTAAL
  return isoDatum(new Date(Date.UTC(d.getUTCFullYear(), volgende, 1)))
}

/** Datum vanaf wanneer het kind voor kinderbijslag (en kindgebonden budget) meetelt. */
export function startRechtKind(kind: KindInvoer): string {
  const vanaf = kind.inHuishoudenVanaf && kind.inHuishoudenVanaf > kind.geboortedatum ? kind.inHuishoudenVanaf : kind.geboortedatum
  return eersteRechtKwartaal(vanaf)
}

/** Centen-nauwkeurig optellen: rekenkundig afronden op centen. */
const opCenten = (x: number): number => AFRONDING.toeslag(x * 100) / 100

export function berekenKinderbijslag(
  kinderen: KindInvoer[],
  ctx: { params: TaxYearParams; jaar: number },
): { totaal: number; perKwartaal: Array<{ kwartaal: string; kindId: string; bedrag: number }>; uitleg: Uitlegregel[] } {
  const tabel = [...ctx.params.toeslagen.waarde.kinderbijslag].sort((a, b) => a.vanaf.localeCompare(b.vanaf))
  const status = ctx.params.toeslagen.status
  const perKwartaal: Array<{ kwartaal: string; kindId: string; bedrag: number }> = []
  const uitleg: Uitlegregel[] = []
  let totaalCenten = 0

  kinderen.forEach((kind, i) => {
    const naam = kind.naam ?? `kind ${i + 1}`
    const start = startRechtKind(kind)
    let kindCenten = 0
    const delen: string[] = []
    kwartaalStarts(ctx.jaar).forEach((q, qi) => {
      if (q < start) return
      const leeftijd = leeftijdOp(kind.geboortedatum, q)
      const groep = KINDERBIJSLAG_GROEPEN.find((g) => leeftijd < g.totLeeftijd)
      if (!groep) return
      const geldig = tabel.filter((r) => r.vanaf <= q).pop()
      if (!geldig) return
      const bedrag = opCenten(geldig[groep.veld])
      const kwartaal = `${ctx.jaar}-K${qi + 1}`
      perKwartaal.push({ kwartaal, kindId: kind.id, bedrag })
      kindCenten += AFRONDING.toeslag(bedrag * 100)
      delen.push(`K${qi + 1} ${eurCent(bedrag)}`)
      uitleg.push(
        regel(`kinderbijslag.${kind.id}.k${qi + 1}`, `${naam}: kwartaal ${qi + 1} (${groep.label})`, bedrag, 'plus', {
          niveau: 2,
          formule: `leeftijd ${leeftijd} op ${datumNL(q)}, bedrag geldig vanaf ${datumNL(geldig.vanaf)}`,
          parameter: `toeslagen.kinderbijslag.${groep.veld}`,
          status,
        }),
      )
    })
    if (delen.length > 0) {
      uitleg.push(
        regel(`kinderbijslag.${kind.id}`, `Kinderbijslag ${naam}`, kindCenten / 100, 'subtotaal', {
          niveau: 1,
          formule: delen.join(' + '),
          parameter: 'toeslagen.kinderbijslag',
          status,
        }),
      )
    } else if (start > `${ctx.jaar}-12-31`) {
      uitleg.push(
        regel(`kinderbijslag.${kind.id}`, `Kinderbijslag ${naam}: nog geen recht dit jaar`, 0, 'info', {
          niveau: 1,
          formule: `eerste kwartaal met recht begint op ${start}`,
        }),
      )
    }
    totaalCenten += kindCenten
  })

  const totaal = totaalCenten / 100
  if (perKwartaal.length > 0) {
    uitleg.unshift(
      regel('kinderbijslag', 'Kinderbijslag (SVB, los van het inkomen)', totaal, 'subtotaal', {
        niveau: 0,
        formule: 'per kwartaal, leeftijd op de eerste dag van het kwartaal; recht vanaf het kwartaal na de geboorte',
        parameter: 'toeslagen.kinderbijslag',
        status,
      }),
    )
  }
  return { totaal, perKwartaal, uitleg }
}
