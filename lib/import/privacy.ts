/**
 * Ronde 2 (A4): wat niet in een rapport of export voor anderen hoort. `herkomst` van een bezitting (rekeningsleutel,
 * hashes van ingelezen bestanden) is voor de import zelf; het tabblad Invoer van het Excel-rapport laat het weg.
 * Puur: geeft een kopie, de invoer zelf blijft zoals hij is.
 */
import type { HuishoudenInvoer } from '@/lib/tax/types'

export function zonderHerkomst<T extends Pick<HuishoudenInvoer, 'box3'>>(invoer: T): T {
  if (!invoer.box3?.posities?.some((p) => p.herkomst !== undefined)) return invoer
  return { ...invoer, box3: { ...invoer.box3, posities: invoer.box3.posities.map(({ herkomst: _weg, ...p }) => p) } }
}
