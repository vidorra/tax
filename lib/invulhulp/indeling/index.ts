/**
 * Ronde 2 (A1): de indeling per aangiftejaar. Dossierjaren zonder eigen indeling vallen terug op het dichtstbijzijnde
 * jaar, met een melding: 2021 tot en met 2023 gebruiken 2024, 2027 en 2028 gebruiken 2026.
 */
import type { InvulhulpIndeling } from '../types'
import i2024 from './2024'
import i2025 from './2025'
import i2026 from './2026'

export const INDELINGEN: Record<number, InvulhulpIndeling> = { 2024: i2024, 2025: i2025, 2026: i2026 }

const JAREN = Object.keys(INDELINGEN)
  .map(Number)
  .sort((a, b) => a - b)

export function indelingVoor(jaar: number): { indeling: InvulhulpIndeling; meldingen: string[] } {
  const eigen = INDELINGEN[jaar]
  if (eigen) return { indeling: eigen, meldingen: [] }
  const eerste = JAREN[0]
  const laatste = JAREN[JAREN.length - 1]
  if (jaar < eerste) {
    return {
      indeling: INDELINGEN[eerste],
      meldingen: [`Voor ${jaar} gebruikt de tool de volgorde van de aangifte over ${eerste}. Het programma van ${jaar} kan op details afwijken.`],
    }
  }
  return {
    indeling: INDELINGEN[laatste],
    meldingen: [`De aangifte over ${jaar} bestaat nog niet. Dit is de verwachte volgorde van de aangifte over ${laatste}; die kan nog veranderen.`],
  }
}
