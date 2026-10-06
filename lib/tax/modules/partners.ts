import type { Verdeling } from '../types'

/**
 * Zoekt de verdeling van gemeenschappelijke inkomensbestanddelen tussen fiscale
 * partners met de laagste kosten (som van IB, Zvw en verlies aan toeslagen).
 *
 * Eerst het beste hoekpunt van het raster {0, ½, 1} over alle dimensies samen, daarna een
 * coördinaatsgewijze zoektocht over een raster per dimensie. De kostenfunctie is
 * stuksgewijs lineair (schijven, tariefmaatregel, afbouw van kortingen), dus het
 * optimum ligt op een knik; een raster van 21 punten plus de uitersten vindt dat
 * in de praktijk binnen enkele euro's. Dimensies zonder effect worden overgeslagen.
 */

export const VERDEEL_DIMENSIES: Array<keyof Verdeling> = ['eigenWoning', 'box3', 'pga', 'box2', 'dividendbelasting']

export interface OptimaliseerOpties {
  /** Alleen deze dimensies optimaliseren (de rest blijft op de startwaarde). */
  dimensies?: Array<keyof Verdeling>
  stappen?: number
  maxRondes?: number
}

export function optimaliseerVerdeling(
  kosten: (v: Verdeling) => number,
  start: Verdeling,
  opties: OptimaliseerOpties = {},
): { verdeling: Verdeling; kosten: number; evaluaties: number } {
  const dims = opties.dimensies ?? VERDEEL_DIMENSIES
  const stappen = opties.stappen ?? 20
  const maxRondes = opties.maxRondes ?? 4
  const raster = Array.from({ length: stappen + 1 }, (_, i) => i / stappen)

  let beste: Verdeling = { ...start }
  let besteKosten = kosten(beste)
  let evaluaties = 1

  // Startpunt: het beste hoekpunt van het grove raster {0, ½, 1} over alle dimensies samen. De kostenfunctie is
  // niet scheidbaar (de dimensies verschuiven allemaal box 1 en het verzamelinkomen), dus alleen per dimensie
  // zoeken kan blijven hangen op een punt dat duurder is dan een eenvoudige vaste verdeling.
  const grof = [0, 0.5, 1]
  let hoekpunten: Verdeling[] = [{ ...start }]
  for (const dim of dims) hoekpunten = hoekpunten.flatMap((v) => grof.map((w) => ({ ...v, [dim]: w })))
  for (const kandidaat of hoekpunten) {
    const k = kosten(kandidaat)
    evaluaties++
    if (k < besteKosten - 0.5) {
      besteKosten = k
      beste = kandidaat
    }
  }

  for (let ronde = 0; ronde < maxRondes; ronde++) {
    let verbeterd = false
    for (const dim of dims) {
      let dimBeste = beste[dim]
      for (const waarde of raster) {
        if (waarde === beste[dim]) continue
        const kandidaat = { ...beste, [dim]: waarde }
        const k = kosten(kandidaat)
        evaluaties++
        // Strikt lager met marge van een halve euro; bij gelijke kosten de eenvoudigste verdeling (0 of 1) houden.
        if (k < besteKosten - 0.5) {
          besteKosten = k
          dimBeste = waarde
          verbeterd = true
        }
      }
      beste = { ...beste, [dim]: dimBeste }
    }
    if (!verbeterd) break
  }

  return { verdeling: beste, kosten: besteKosten, evaluaties }
}
