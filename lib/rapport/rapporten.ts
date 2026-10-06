/**
 * Bouwt de rapporten voor een exportkeuze: één per persoon (bouwRapport), met dezelfde opties. Apart van
 * export.ts zodat de exportpagina de rapportbouw pas laadt als je op een knop drukt.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, TaxYearParams } from '@/lib/tax/types'
import { bouwRapport } from './bouw'
import { rapportPersonen, type RapportKeuze } from './export'
import type { RapportDocument, RapportOpties } from './model'

export function bouwRapporten(
  invoer: HuishoudenInvoer,
  resultaat: HuishoudenResultaat,
  params: TaxYearParams,
  keuze: RapportKeuze,
  opties: Omit<RapportOpties, 'persoon'>,
): RapportDocument[] {
  return rapportPersonen(invoer, keuze).map((persoon) => bouwRapport(invoer, resultaat, params, { ...opties, persoon }))
}
