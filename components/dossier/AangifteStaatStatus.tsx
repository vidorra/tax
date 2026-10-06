'use client'

/**
 * Ronde 2 (contract, na de toets): zichtbare opslagstatus van de aangiftestaat, gedeeld door de invulhulp (A1), de
 * planningsdatums (A2), negeren in de controles (A3) en de terugvraagstatus (A5). Leest de gedeelde staat van de
 * pagina (AangifteStaatProvider) of de staat die wordt meegegeven.
 *
 * - Laden mislukt: "Je vinkjes en bedragen konden niet worden geladen." met Opnieuw laden.
 * - Opslaan mislukt (netwerk of server): rood "Niet opgeslagen" met de melding en Opnieuw proberen; de wachtrij
 *   probeert het zelf ook opnieuw.
 * - Een geweigerde wijziging (4xx): amber de melding; de staat is al opnieuw geladen.
 * - Anders grijs "Bezig met opslaan" of "Opgeslagen" (alleen als er al een opgeslagen staat is, of met `altijd`).
 * Fouten gaan ook naar het gedeelde live-gebied (kondigAan), één keer per melding.
 */
import { useEffect, useRef } from 'react'
import { Check, CircleX, TriangleAlert } from 'lucide-react'
import { Button, cn, kondigAan } from '@/components/ui'
import { opslagTekst, useAangifteStaatOptioneel, type UseAangifteStaat } from './useAangifteStaat'

export interface AangifteStaatStatusProps {
  /** Zonder: de staat van de AangifteStaatProvider op de pagina. */
  staat?: UseAangifteStaat | null
  /** Ook "Opgeslagen" tonen als er nog nooit iets is opgeslagen. */
  altijd?: boolean
  className?: string
}

export function AangifteStaatStatus({ staat, altijd, className }: AangifteStaatStatusProps) {
  const context = useAangifteStaatOptioneel()
  const s = staat ?? context
  const gemeld = useRef<string | null>(null)

  const fout = s?.fout ?? null
  useEffect(() => {
    if (fout && fout !== gemeld.current) kondigAan(fout)
    gemeld.current = fout
  }, [fout])

  if (!s) return null

  if (s.laden === 'fout') {
    return (
      <div className={cn('flex flex-wrap items-center gap-2 text-sm text-amber-900', className)}>
        <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
        <span>Je vinkjes en bedragen konden niet worden geladen.</span>
        <Button variant="kaal" grootte="sm" onClick={s.opnieuwLaden}>
          Opnieuw laden
        </Button>
      </div>
    )
  }

  if (s.opslag === 'mislukt') {
    return (
      <div className={cn('flex flex-wrap items-center gap-2 text-sm text-red-700', className)}>
        <CircleX aria-hidden className="h-4 w-4 shrink-0" />
        <span>{s.fout ?? 'Niet opgeslagen.'}</span>
        <Button variant="kaal" grootte="sm" onClick={s.opnieuwProberen}>
          Opnieuw proberen
        </Button>
      </div>
    )
  }

  if (s.fout) {
    return (
      <div className={cn('flex flex-wrap items-center gap-2 text-sm text-amber-900', className)}>
        <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
        <span>{s.fout}</span>
      </div>
    )
  }

  if (s.opslag === 'opgeslagen' && !s.bijgewerkt && !altijd) return null
  return (
    <p className={cn('flex items-center gap-1.5 text-sm text-gray-600', className)}>
      {s.opslag === 'opgeslagen' && <Check aria-hidden className="h-4 w-4 shrink-0" />}
      <span>{opslagTekst(s.opslag)}</span>
    </p>
  )
}
