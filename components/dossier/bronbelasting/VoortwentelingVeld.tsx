'use client'

/**
 * Ronde 2 (A5): "Bronbelasting uit eerdere jaren" in AanslagSectie, alleen als de doorrol een saldo heeft of er in dit
 * jaar bronbelasting is (rommelbudget). Het bedrag staat in de beschikking bij de aanslag van vorig jaar.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonInvoer } from '@/lib/tax/types'
import { bronbelastingRegels } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { veldVan } from '@/lib/dossier/veld'
import { Bedrag, Rij } from '../velden'
import { euroCent } from './notatie'

export function toonVoortwenteling(persoon: PersoonInvoer, invoer: HuishoudenInvoer | undefined): boolean {
  if ((persoon.voortgewenteldeBronbelasting ?? 0) > 0) return true
  return (invoer?.box3.posities ?? []).some((x) => bronbelastingRegels(x).some((r) => r.bedrag > 0))
}

export function VoortwentelingVeld({
  persoon,
  invoer,
  resultaat,
  jaar,
  onChange,
}: {
  persoon: PersoonInvoer
  invoer: HuishoudenInvoer | undefined
  resultaat: HuishoudenResultaat | null | undefined
  jaar: number
  onChange: (v: number | undefined) => void
}) {
  if (!toonVoortwenteling(persoon, invoer)) return null
  const door = resultaat?.personen.find((p) => p.id === persoon.id)?.bronbelasting?.naarVolgendJaar ?? 0
  return (
    <div>
      <Rij>
        <Bedrag
          label="Bronbelasting uit eerdere jaren"
          veld={veldVan.persoon(persoon.id, 'voortgewenteldeBronbelasting')}
          hint="Dit bedrag staat in de beschikking bij de aanslag van vorig jaar. Pas het aan als die afwijkt."
          value={persoon.voortgewenteldeBronbelasting}
          onChange={(v) => onChange(v && v > 0 ? v : undefined)}
        />
      </Rij>
      {door > 0 && <p className="mt-2 text-sm text-gray-700">Schuift door naar {jaar + 1}: {euroCent(door)}</p>}
    </div>
  )
}
