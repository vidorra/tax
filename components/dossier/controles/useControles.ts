'use client'

/**
 * Ronde 2 (A3): de controles op een jaarpagina. Een dunne laag over `controleerEditor` (lib/controles/editor.ts):
 * params uit het jaar en de variant, de uitkomst van vorig jaar (één keer gerekend), de aangiftestaat van de pagina
 * (negeringen en `controles.streng`) en `maakStreng(door)`, dat het moment vastlegt waarop de controles nadrukkelijk
 * worden (status, paneel, export; de invulhulp doet dat zelf).
 */
import { useCallback, useDeferredValue, useMemo } from 'react'
import { berekenDossier } from '@/lib/dossier/bereken'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer, HuishoudenResultaat, TaxYearParams } from '@/lib/tax/types'
import type { ControlesStreng } from '@/lib/dossier/aangiftestaat'
import type { DossierStatus } from '@/lib/dossier/status'
import { controleerEditor, type EditorControles } from '@/lib/controles/editor'
import { useAangifteStaatOptioneel, type UseAangifteStaat } from '../useAangifteStaat'

export interface UseControlesInvoer {
  jaar: number
  invoer: HuishoudenInvoer
  resultaat: HuishoudenResultaat | null
  variant: string | null
  status: DossierStatus
  ingediend: { op: string; gewijzigdNa: boolean } | null
  gewijzigd: boolean
  /** Invoer van vorig jaar (van de server); de uitkomst rekent de hook zelf. */
  vorigInvoer: HuishoudenInvoer | null
  vandaag: string
}

export interface UseControles extends EditorControles {
  /** null als de params van het jaar niet te laden zijn; dan zijn er geen controles. */
  params: TaxYearParams | null
  /** Legt vast dat de controles nadrukkelijk worden (een tweede keer verandert niets). */
  maakStreng: (door: ControlesStreng['door']) => void
  /** De aangiftestaat van de pagina (negeren, terugzetten, opslagstatus); null zonder provider. */
  staat: UseAangifteStaat | null
}

function rekenVeilig(invoer: HuishoudenInvoer): HuishoudenResultaat | null {
  try {
    return berekenDossier(invoer, { variant: invoer.variant, zonderMarginaleDruk: true })
  } catch {
    return null
  }
}

export function useControles(x: UseControlesInvoer): UseControles {
  const staat = useAangifteStaatOptioneel()
  const invoer = useDeferredValue(x.invoer)
  const params = useMemo(() => {
    try {
      return getJaar(x.jaar, x.variant ?? undefined)
    } catch {
      return null
    }
  }, [x.jaar, x.variant])
  const vorig = useMemo(() => (x.vorigInvoer ? { invoer: x.vorigInvoer, resultaat: rekenVeilig(x.vorigInvoer) } : null), [x.vorigInvoer])
  const aangifteStaat = staat?.staat ?? null

  const controles = useMemo<EditorControles>(() => {
    if (!params) {
      return {
        uitkomst: { alle: [], open: [], genegeerd: [], weerOpen: [], telling: { fouten: 0, letOp: 0, info: 0, genegeerd: 0 }, blokkeertGecontroleerd: false, exportConcept: false, exportIngediendOpen: 0, zonderBerekening: true },
        streng: x.status !== 'concept',
      }
    }
    return controleerEditor({
      jaar: x.jaar,
      invoer,
      resultaat: x.resultaat,
      params,
      status: x.status,
      staat: aangifteStaat,
      ingediend: x.ingediend,
      gewijzigd: x.gewijzigd,
      vorig,
      vandaag: x.vandaag,
    })
  }, [params, x.jaar, invoer, x.resultaat, x.status, aangifteStaat, x.ingediend, x.gewijzigd, vorig, x.vandaag])

  const wijzig = staat?.wijzig
  const alStreng = Boolean(aangifteStaat?.controles?.streng)
  const maakStreng = useCallback(
    (door: ControlesStreng['door']) => {
      if (!wijzig || alStreng) return
      wijzig([{ soort: 'controles-streng', waarde: { op: new Date().toISOString(), door } }], { direct: true })
    },
    [wijzig, alStreng],
  )

  return { ...controles, params, maakStreng, staat }
}
