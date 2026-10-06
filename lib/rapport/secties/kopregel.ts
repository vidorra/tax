/**
 * Kopregel op elke rapportpagina (spec 1.3). Links de titel met de naam, rechts de datum van de berekening in
 * plaats van de indieningsdatum van de accountant. Geen BSN. 'pagina: n' zet de renderer.
 */
import type { RapportDocument } from '../model'
import { datumLang } from '../notatie'

export function titelVan(jaar: number): string {
  return `Fiscaal rapport aangifte inkomstenbelasting ${jaar}`
}

export function kopregel(jaar: number, naam: string, vandaag: string): RapportDocument['kopregel'] {
  return { links: `${titelVan(jaar)} van ${naam}`, rechts: [`Berekend op: ${datumLang(vandaag)}`] }
}
