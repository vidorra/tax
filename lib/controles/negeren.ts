/**
 * Ronde 2 (contract): regels voor negeren en voor rustig invullen, gedeeld door controleer() (A3), de server en de UI.
 * Puur: geen React, geen I/O.
 */
import type { AangifteStaat } from '@/lib/dossier/aangiftestaat'
import type { DossierStatus } from '@/lib/dossier/status'
import { KAPITAALSVERGELIJKING, type Controle, type GenegeerdeControle } from './types'

/**
 * Telt een bewaarde negering voor deze controle?
 * - 'ongeldig': de regel mag niet worden genegeerd ('nee'), het is info, de ernst past niet (de client stuurt de ernst
 *   mee; een fout die als let op binnenkomt, omzeilt zo niet de verplichte reden), of de reden ontbreekt waar die
 *   verplicht is. De controle staat open alsof er niets was genegeerd.
 * - 'weer-open': geldig, maar de vingerafdruk is veranderd ("Kijk opnieuw").
 * - 'geldig': genegeerd.
 */
export function beoordeelNegering(controle: Pick<Controle, 'ernst' | 'negeren' | 'vingerafdruk'>, negering: GenegeerdeControle | undefined): 'geldig' | 'weer-open' | 'ongeldig' {
  if (!negering) return 'ongeldig'
  if (controle.negeren === 'nee' || controle.ernst === 'info') return 'ongeldig'
  if (negering.ernst !== controle.ernst) return 'ongeldig'
  const metReden = typeof negering.reden === 'string' && negering.reden.trim().length > 0
  if ((controle.negeren === 'met-reden' || controle.ernst === 'fout') && !metReden) return 'ongeldig'
  return negering.vingerafdruk === controle.vingerafdruk ? 'geldig' : 'weer-open'
}

/** Kort: is de controle geldig genegeerd met dezelfde vingerafdruk? */
export function geldigeNegering(controle: Pick<Controle, 'ernst' | 'negeren' | 'vingerafdruk'>, negering: GenegeerdeControle | undefined): boolean {
  return beoordeelNegering(controle, negering) === 'geldig'
}

/**
 * Moeten de controles nadrukkelijk (rood, uitgeklapt, markeringen bij velden, fouten in de mobiele balk) getoond worden?
 * Ja bij Gecontroleerd en Ingediend, en in een concept zodra `staat.controles.streng` is gezet (de gebruiker wilde de
 * status op Gecontroleerd zetten, opende de invulhulp of de export, of klapte het controlepaneel open). Anders rustig:
 * ingeklapt met een grijs aantal. Uitzondering (besluit na de nacontrole): een veld dat de gebruiker net verliet, toont
 * ook in een rustig jaar zijn eigen fout (gewone veldvalidatie); het blok, de teller en de mobiele foutknop niet.
 */
export function controlesStreng(status: DossierStatus, staat: AangifteStaat | null | undefined): boolean {
  return status !== 'concept' || Boolean(staat?.controles?.streng)
}

/** Tolerantie van de kapitaalsvergelijking bij dit aantal ingevulde balansposten (begin en eind samen). */
export function kapitaalsvergelijkingTolerantie(ingevuldePosten: number): number {
  return Math.max(KAPITAALSVERGELIJKING.tolerantieMin, KAPITAALSVERGELIJKING.tolerantiePerPost * Math.max(0, ingevuldePosten))
}

/** Ernst van een verschil in de kapitaalsvergelijking: null binnen € 1, let op binnen de tolerantie, anders fout. */
export function kapitaalsvergelijkingErnst(verschil: number, ingevuldePosten: number): 'let-op' | 'fout' | null {
  const v = Math.abs(verschil)
  if (v <= KAPITAALSVERGELIJKING.ondergrens) return null
  return v <= kapitaalsvergelijkingTolerantie(ingevuldePosten) ? 'let-op' : 'fout'
}
