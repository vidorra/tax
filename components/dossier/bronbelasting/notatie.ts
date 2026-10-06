/** Ronde 2 (A5): kleine notatiehulpjes voor de bronbelasting in de UI. */
import { formatEuro, formatPct } from '@/components/ui'

/** Hele euro's, of met centen als het bedrag centen heeft (113,75 terugvragen). */
export const euroCent = (n: number): string => formatEuro(n, { decimalen: Math.abs(n - Math.round(n)) > 0.004 ? 2 : 0 })

/** Percentage zonder overbodige decimalen: 15%, 26,375%. */
export const tarief = (f: number): string => formatPct(f, 3)

/** "in Zwitserland", "in de Verenigde Staten", "in het Verenigd Koninkrijk". */
export function inLand(naam: string): string {
  if (naam === 'Verenigde Staten') return 'in de Verenigde Staten'
  if (naam === 'Verenigd Koninkrijk') return 'in het Verenigd Koninkrijk'
  return `in ${naam}`
}

export const SOORT_LABEL = { dividend: 'Dividend', rente: 'Rente' } as const
