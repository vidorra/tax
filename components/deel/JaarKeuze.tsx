'use client'

import type { ReactNode } from 'react'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { YearPicker } from '@/components/ui/YearPicker'
import { DEEL_JAREN, jaarOpties, params } from './jaren'

export interface JaarKeuzeProps {
  jaar: number
  onJaar: (jaar: number) => void
  /** Zonder onVariant geen variantkeuze (de variant doet er voor deze berekening niet toe). */
  variant?: string
  onVariant?: (variant: string) => void
  jaren?: readonly number[]
  hint?: ReactNode
}

/** Jaarkiezer met status per jaar en, voor jaren met twee voorstellen, een variantkeuze. */
export function JaarKeuze({ jaar, onJaar, variant = '', onVariant, jaren = DEEL_JAREN, hint }: JaarKeuzeProps) {
  const varianten = onVariant ? params(jaar).varianten : []
  const gekozen = varianten.find((v) => v.id === variant)
  return (
    <div className="space-y-4">
      <YearPicker jaren={jaarOpties(jaren)} value={jaar} onChange={onJaar} hint={hint} />
      {varianten.length > 0 && onVariant && (
        <div>
          <ChipGroup<string>
            label={`Welk voorstel voor ${jaar}?`}
            value={variant}
            onChange={onVariant}
            kolommen={2}
            options={[
              { value: '', label: 'Belastingplan', beschrijving: 'Prinsjesdag' },
              ...varianten.map((v) => ({ value: v.id, label: v.label })),
            ]}
          />
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-gray-500">
            <StatusBadge status={gekozen?.status ?? params(jaar).status} klein />
            {gekozen
              ? `Rekent met de variant ${gekozen.label.toLowerCase()}. Die staat nog niet in de wet.`
              : 'Rekent met het Belastingplan zoals het op Prinsjesdag is ingediend.'}
          </p>
        </div>
      )}
    </div>
  )
}
