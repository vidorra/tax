'use client'

import { useDeferredValue, useMemo } from 'react'
import { berekenDossier } from '@/lib/dossier/bereken'
import type { HuishoudenInvoer, HuishoudenResultaat } from '@/lib/tax/types'

/** Live berekening in de browser; een fout in halve invoer geeft een melding in plaats van een crash. */
export function useBerekening(invoer: HuishoudenInvoer, variant: string | null, opties: { zonderMarginaleDruk?: boolean } = {}): { resultaat: HuishoudenResultaat | null; fout: string | null } {
  const uitgesteld = useDeferredValue(invoer)
  const zonder = Boolean(opties.zonderMarginaleDruk)
  return useMemo(() => {
    try {
      const v = variant ?? undefined
      return { resultaat: berekenDossier({ ...uitgesteld, variant: v }, { variant: v, zonderMarginaleDruk: zonder }), fout: null }
    } catch {
      return { resultaat: null, fout: 'De berekening lukt niet met deze invoer. Controleer de datums en bedragen die je net hebt ingevuld.' }
    }
  }, [uitgesteld, variant, zonder])
}
