/**
 * Ronde 2 (A5): terugvragen in het buitenland over alle jaren, voor de kaart op het overzicht (server-only).
 *
 * Per jaar de bronbelastingregels en de status uit de aangiftestaat. De regels rekenen we uit de opgeslagen invoer met
 * dezelfde functie als de engine (`bronbelastingRegelsVan`, zonder de hele berekening): zo telt een oude snapshot zonder
 * bronbelastingregels ook mee en geldt de landentabel van nu. Een jaar dat niet te lezen is, slaan we over: het overzicht
 * moet altijd laden.
 */
import { getJaar } from '@/lib/tax/years'
import { laadAlleInvoer } from './opslag'
import { laadAangifteStaat } from './aangiftestaat-opslag'
import { bronbelastingRegelsVan, openTerugvragen, terugvraagLijst, type OpenTerugvragen, type TerugvraagItem } from './terugvragen'

export async function laadTerugvragen(householdId: number, vandaag: string): Promise<OpenTerugvragen | null> {
  const jaren = await laadAlleInvoer(householdId)
  const lijsten: TerugvraagItem[][] = []
  for (const j of jaren) {
    let params = null
    try {
      params = getJaar(j.jaar, j.variant ?? undefined)
    } catch {
      continue
    }
    const regels = bronbelastingRegelsVan(j.invoer, null, params).filter((r) => r.terugTeVragen > 0)
    if (regels.length === 0) continue
    let staat = null
    try {
      staat = (await laadAangifteStaat(householdId, j.jaar))?.staat ?? null
    } catch {
      staat = null
    }
    lijsten.push(terugvraagLijst(j.invoer, regels, staat, vandaag))
  }
  const open = openTerugvragen(lijsten)
  return open.aantal > 0 ? open : null
}
