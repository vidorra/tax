/**
 * Prognose van de jaarwinst (of jaaromzet) uit wat er tot nu toe is gerealiseerd.
 *
 *  - lineair:   jaarequivalent = gerealiseerd × 12 / maandenGewerkt
 *  - seizoen:   jaarequivalent = gerealiseerd / aandeel van de verstreken maanden in het
 *               seizoensprofiel (12 gewichten, schaal vrij; delen van maanden tellen naar rato)
 *  - handmatig: jaarequivalent = gerealiseerd + verwachtRest
 */
import type { Uitlegregel } from '../../types'
import { AFRONDING } from '../../rounding'
import { regel, eur, pct } from '../../uitleg'

/** Afronding voor planningsbedragen: rekenkundig op hele euro's (zelfde regel als heffingskortingen en toeslagen). */
export const rondPlanning = AFRONDING.korting

export function prognoseJaarwinst(input: {
  gerealiseerd: number
  maandenGewerkt: number
  methode: 'lineair' | 'seizoen' | 'handmatig'
  seizoensprofiel?: number[]
  verwachtRest?: number
}): { jaarequivalent: number; uitleg: Uitlegregel[] } {
  const n = Math.min(12, Math.max(0, input.maandenGewerkt))
  const uitleg: Uitlegregel[] = [regel('prognose.gerealiseerd', `Gerealiseerd in ${n.toLocaleString('nl-NL')} maanden`, input.gerealiseerd, 'plus', { niveau: 1 })]

  if (input.methode === 'handmatig') {
    const rest = input.verwachtRest ?? 0
    const jaarequivalent = rondPlanning(input.gerealiseerd + rest)
    uitleg.push(regel('prognose.rest', 'Zelf verwacht voor de rest van het jaar', rest, 'plus', { niveau: 1 }))
    uitleg.push(regel('prognose', 'Verwacht voor het hele jaar', jaarequivalent, 'totaal', { niveau: 0, formule: `${eur(input.gerealiseerd)} + ${eur(rest)}` }))
    return { jaarequivalent, uitleg }
  }

  if (n >= 12) {
    uitleg.push(regel('prognose', 'Verwacht voor het hele jaar (jaar is compleet)', rondPlanning(input.gerealiseerd), 'totaal', { niveau: 0 }))
    return { jaarequivalent: rondPlanning(input.gerealiseerd), uitleg }
  }
  if (n <= 0) {
    const rest = input.verwachtRest ?? 0
    uitleg.push(
      regel('prognose', 'Verwacht voor het hele jaar (nog geen maanden gewerkt)', rondPlanning(input.gerealiseerd + rest), 'totaal', {
        niveau: 0,
        formule: 'zonder gewerkte maanden is doortrekken niet mogelijk; alleen de eigen verwachting telt',
      }),
    )
    return { jaarequivalent: rondPlanning(input.gerealiseerd + rest), uitleg }
  }

  const profiel = input.seizoensprofiel
  const geldigProfiel = profiel !== undefined && profiel.length === 12 && profiel.every((x) => x >= 0) && profiel.reduce((s, x) => s + x, 0) > 0
  if (input.methode === 'seizoen' && geldigProfiel) {
    const som = profiel!.reduce((s, x) => s + x, 0)
    const hele = Math.floor(n)
    let deel = profiel!.slice(0, hele).reduce((s, x) => s + x, 0)
    if (hele < 12) deel += (n - hele) * profiel![hele]
    const aandeel = deel / som
    if (aandeel > 0) {
      const jaarequivalent = rondPlanning(input.gerealiseerd / aandeel)
      uitleg.push(
        regel('prognose', 'Verwacht voor het hele jaar (seizoensprofiel)', jaarequivalent, 'totaal', {
          niveau: 0,
          formule: `${eur(input.gerealiseerd)} / ${pct(aandeel, 1)} (deel van het jaar volgens het profiel)`,
        }),
      )
      return { jaarequivalent, uitleg }
    }
  }

  const jaarequivalent = rondPlanning((input.gerealiseerd * 12) / n)
  uitleg.push(
    regel('prognose', input.methode === 'seizoen' ? 'Verwacht voor het hele jaar (lineair, het seizoensprofiel is onvolledig)' : 'Verwacht voor het hele jaar (lineair)', jaarequivalent, 'totaal', {
      niveau: 0,
      formule: `${eur(input.gerealiseerd)} × 12 / ${n.toLocaleString('nl-NL')}`,
    }),
  )
  return { jaarequivalent, uitleg }
}
