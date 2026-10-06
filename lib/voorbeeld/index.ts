/**
 * Verzonnen voorbeeldhuishouden (zie README.md in deze map): de voorbeeldaangifte in het dossier, de voorbeeldknop
 * van de jaarruimte-calculator, scripts/rapport-voorbeeld.ts en de publieke tests. Geen echte aangifte.
 */
import type { HuishoudenInvoer } from '@/lib/tax/types'
import huishouden2021 from './huishouden-2021.json'
import huishouden2024 from './huishouden-2024.json'

/** Jaar van de voorbeeldaangifte in het dossier. */
export const VOORBEELD_JAAR = 2024

/** Een losse kopie van de voorbeeldinvoer; wie hem aanpast, raakt het voorbeeld zelf niet. */
export function voorbeeldInvoer(jaar: 2021 | 2024 = VOORBEELD_JAAR): HuishoudenInvoer {
  const bron = jaar === 2021 ? huishouden2021 : huishouden2024
  return JSON.parse(JSON.stringify(bron.invoer)) as HuishoudenInvoer
}
