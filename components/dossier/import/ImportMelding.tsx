'use client'

/**
 * Ronde 2 (A4): de melding na een import, met Ongedaan maken en sluiten. Op mobiel staat de tekst over de volle breedte
 * met de knoppen eronder, op desktop op één regel.
 *
 * Zonder `onSluit` is het een vaste regel (het herstelpunt op het overzicht, dat blijft staan zolang het geldig is).
 * Tijdens het ongedaan maken blijft de knop focusbaar (`aria-disabled` in plaats van `disabled`), zodat de focus niet
 * naar de body valt.
 */
import { Undo2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui'

export interface ImportMeldingProps {
  tekst: ReactNode
  onOngedaan?: () => void
  onSluit?: () => void
  bezig?: boolean
  id?: string
  /** Id van de knop Ongedaan maken, om de focus erheen te zetten. */
  ongedaanId?: string
  /** 'status' (standaard) meldt de tekst aan een schermlezer; null voor een vaste regel die er bij het laden al staat. */
  rol?: 'status' | null
  className?: string
}

export function ImportMelding({ tekst, onOngedaan, onSluit, bezig, id, ongedaanId, rol = 'status', className }: ImportMeldingProps) {
  return (
    <div
      id={id}
      tabIndex={id ? -1 : undefined}
      role={rol ?? undefined}
      className={cn('flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none sm:flex-row sm:items-center sm:gap-3', className)}
    >
      <p className="min-w-0 sm:flex-1">{tekst}</p>
      <div className="flex items-center gap-2">
        {onOngedaan && (
          <button
            id={ongedaanId}
            type="button"
            onClick={() => {
              if (!bezig) onOngedaan()
            }}
            aria-disabled={bezig || undefined}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg font-medium text-primary transition-colors hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-disabled:opacity-50"
          >
            <Undo2 aria-hidden="true" className="h-4 w-4" />
            {bezig ? 'Bezig met ongedaan maken' : 'Ongedaan maken'}
          </button>
        )}
        {onSluit && (
          <button
            type="button"
            onClick={onSluit}
            aria-label="Melding sluiten"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
