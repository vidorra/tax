'use client'

/**
 * Ronde 2 (A2): label per leningdeel, Eigen woning of Box 3 (of Deels box 3), met de reden in tekst. Uit de splitsing
 * van de engine (`EigenWoningResultaat.leningsplitsing`); zonder uitkomst geen label.
 */
import type { EigenWoningResultaat, TaxYearParams } from '@/lib/tax/types'
import { cn, formatDatum, formatEuro } from '@/components/ui'

export type Splitsing = NonNullable<EigenWoningResultaat['leningsplitsing']>[number]

export function redenTekst(reden: Splitsing['reden'], params: TaxYearParams | null): string | null {
  if (reden === 'bijleenregeling') return 'bijleenregeling'
  if (reden === 'aflossingseis') return params ? `aflossingsvrij sinds ${formatDatum(params.eigenWoning.waarde.aflossingseisVanaf)}` : 'voldoet niet aan de aflossingseis'
  if (reden === 'termijn') return params ? `renteaftrek na ${params.eigenWoning.waarde.maxAftrekJaren} jaar voorbij` : 'renteaftrek voorbij'
  return null
}

export function leningdeelSoort(s: Splitsing): 'eigen' | 'box3' | 'deels' {
  const ander = s.anderBegin + s.anderEind
  const eigen = s.eigenwoningBegin + s.eigenwoningEind
  if (ander <= 0) return 'eigen'
  if (eigen <= 0) return 'box3'
  return 'deels'
}

export function LeningdeelLabel({ splitsing, params, className }: { splitsing: Splitsing | undefined; params: TaxYearParams | null; className?: string }) {
  if (!splitsing) return null
  const soort = leningdeelSoort(splitsing)
  const reden = redenTekst(splitsing.reden, params)
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600', className)}>
      <span
        className={cn(
          'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-1 font-medium leading-none',
          soort === 'eigen' ? 'border-gray-200 bg-white text-gray-700' : 'border-amber-300 bg-amber-50 text-amber-900',
        )}
      >
        {soort === 'eigen' ? 'Eigen woning' : soort === 'box3' ? 'Box 3' : 'Deels box 3'}
      </span>
      {soort === 'deels' && (
        <span>
          eigen woning {formatEuro(splitsing.eigenwoningEind)} · box 3 {formatEuro(splitsing.anderEind)} op 31 december
        </span>
      )}
      {soort !== 'eigen' && reden && <span>{soort === 'deels' ? `(${reden})` : reden}</span>}
    </p>
  )
}
