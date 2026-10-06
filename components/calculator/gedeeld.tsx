'use client'

import type { ReactNode } from 'react'
import { ChipGroup } from '@/components/ui/ChipGroup'
import type { PersoonId } from '@/lib/tax/types'
import type { CalculatorState, PersoonState } from '@/lib/calculator/formulier'

/** Functionele update van de calculatorstate. */
export type Wijzig = (f: (s: CalculatorState) => CalculatorState) => void

export const PERSOON_NAAM: Record<PersoonId, string> = { A: 'Jij', B: 'Je partner' }

export function zetPersoon(wijzig: Wijzig, id: PersoonId, patch: Partial<PersoonState>) {
  wijzig((s) => ({ ...s, personen: { ...s.personen, [id]: { ...s.personen[id], ...patch } } }))
}

/** Keuze tussen jou en je partner binnen een sectie (alleen zichtbaar met partner). */
export function PersoonKeuze({ partner, actief, onChange, label = 'Voor wie vul je dit in?' }: { partner: boolean; actief: PersoonId; onChange: (id: PersoonId) => void; label?: string }) {
  if (!partner) return null
  return (
    <ChipGroup<PersoonId>
      label={label}
      labelVerborgen
      kolommen={2}
      value={actief}
      onChange={onChange}
      options={[
        { value: 'A', label: PERSOON_NAAM.A },
        { value: 'B', label: PERSOON_NAAM.B },
      ]}
      className="mb-4"
    />
  )
}

/** Twee velden naast elkaar vanaf sm, onder elkaar op mobiel. */
export function VeldRij({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}
