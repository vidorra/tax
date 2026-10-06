/**
 * Ronde 2 (A3): de controles van een opgeslagen jaar, voor het overzicht (jaarkaart), de badge bij de tab Invoer
 * (`jaarBadges`, via `laadJaar`) en de statusregel op de server. Rekent met de laatste snapshot (de uitkomst zoals
 * opgeslagen), de aangiftestaat (negeringen, `controles.streng`) en het vorige jaar. Puur: geen I/O; de aanroeper laadt.
 */
import { controleContext, controleerAlles } from '@/lib/controles'
import { controlesStreng } from '@/lib/controles/negeren'
import type { ControleTelling, ControleUitkomst } from '@/lib/controles/types'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer, HuishoudenResultaat } from '@/lib/tax/types'
import type { AangifteStaat } from './aangiftestaat'
import type { DossierStatus } from './status'

export interface ControleBasis {
  jaar: number
  variant: string | null
  status: DossierStatus
  invoer: HuishoudenInvoer
  /** Uitkomst van de laatste opslag (snapshot); null als die er niet is of niet te lezen was. */
  resultaat: HuishoudenResultaat | null
  staat: AangifteStaat | null
  /** Vorig jaar met de uitkomst van de laatste opslag. */
  vorig?: { invoer: HuishoudenInvoer; resultaat: HuishoudenResultaat | null } | null
  ingediend?: { op: string; gewijzigdNa: boolean } | null
  /** ISO-datum van vandaag. */
  vandaag: string
}

/** Alle controles van een opgeslagen jaar; null als ze niet uitgerekend konden worden (onbekend jaar, kapotte invoer). */
export function controlesVanJaar(b: ControleBasis): ControleUitkomst | null {
  try {
    const params = getJaar(b.jaar, b.variant ?? undefined)
    return controleerAlles(
      controleContext({
        jaar: b.jaar,
        invoer: b.invoer,
        resultaat: b.resultaat,
        params,
        status: b.status,
        vandaag: b.vandaag,
        staat: b.staat,
        ingediend: b.ingediend ?? null,
        vorig: b.vorig ?? null,
      }),
    )
  } catch {
    return null
  }
}

/** Telling en strengheid voor JaarOverzicht; zonder uitkomst alleen de strengheid. */
export function telControles(b: ControleBasis): { controles?: ControleTelling; controlesStreng: boolean } {
  const u = controlesVanJaar(b)
  return { ...(u ? { controles: u.telling } : {}), controlesStreng: controlesStreng(b.status, b.staat) }
}
