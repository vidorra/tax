/**
 * Ronde 2 (A3): de controles zoals de editor en de exportpagina ze rekenen, als pure functie onder de hook
 * `useControles` (components/dossier/controles/useControles.ts). Puur: geen React, geen I/O, geen Date.now().
 *
 * Verschil met de server (lib/dossier/controle-telling.ts): de editor rekent met de invoer zoals die nu op het scherm
 * staat en de gekozen (nog niet opgeslagen) status. Bij status Ingediend telt een niet-opgeslagen wijziging als
 * "gewijzigd na het indienen" (ontwerp 6.2, ingediend-gewijzigd), en `controleerAlles` voegt bij open fouten de let op
 * ingediend-met-fouten toe.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, TaxYearParams } from '@/lib/tax/types'
import type { AangifteStaat } from '@/lib/dossier/aangiftestaat'
import type { DossierStatus } from '@/lib/dossier/status'
import { controleContext, controleerAlles } from './index'
import { controlesStreng } from './negeren'
import type { ControleContext, ControleUitkomst } from './types'

export interface EditorControleInvoer {
  jaar: number
  invoer: HuishoudenInvoer
  /** Live uitkomst; null als de berekening niet lukt. */
  resultaat: HuishoudenResultaat | null
  params: TaxYearParams
  /** De status die nu gekozen is (in de editor nog niet opgeslagen mag). */
  status: DossierStatus
  staat: AangifteStaat | null
  /** Indienmoment van de laatste opslag (`JaarOverzicht.ingediend`); null als het opgeslagen jaar niet ingediend is. */
  ingediend: { op: string; gewijzigdNa: boolean } | null
  /** Er zijn niet-opgeslagen wijzigingen in de invoer. */
  gewijzigd: boolean
  vorig: { invoer: HuishoudenInvoer; resultaat?: HuishoudenResultaat | null } | null
  rekenVorig?: (invoer: HuishoudenInvoer) => HuishoudenResultaat | null
  /** ISO-datum van vandaag (van de server). */
  vandaag: string
}

/** De context voor `controleer`, met niet-opgeslagen wijzigingen bij Ingediend als "gewijzigd na het indienen". */
export function editorControleContext(x: EditorControleInvoer): ControleContext {
  const ingediend = x.status === 'ingediend' && x.ingediend ? { op: x.ingediend.op, gewijzigdNa: x.ingediend.gewijzigdNa || x.gewijzigd } : null
  return controleContext({
    jaar: x.jaar,
    invoer: x.invoer,
    resultaat: x.resultaat,
    params: x.params,
    status: x.status,
    vandaag: x.vandaag,
    staat: x.staat,
    ingediend,
    vorig: x.vorig,
    rekenVorig: x.rekenVorig,
  })
}

export interface EditorControles {
  uitkomst: ControleUitkomst
  /** Nadrukkelijk tonen (rood, uitgeklapt, markeringen bij velden)? Zie `controlesStreng`. */
  streng: boolean
}

/** Alle controles van de editor, met ingediend-met-fouten in de tweede doorgang. */
export function controleerEditor(x: EditorControleInvoer): EditorControles {
  return { uitkomst: controleerAlles(editorControleContext(x)), streng: controlesStreng(x.status, x.staat) }
}
