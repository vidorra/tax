/**
 * Jaarkeuze voor de deelcalculators. Geen fiscale getallen: alleen welke jaren we tonen
 * en hun status uit lib/tax/years.
 */
import type { Status, TaxYearParams } from '@/lib/tax/types'
import { BESCHIKBARE_JAREN, CONCEPT_JAREN, getJaar } from '@/lib/tax/years'
import type { JaarOptie } from '@/components/ui/YearPicker'

/** Eerste jaar in de jaarkiezer van de deelcalculators (oudere jaren alleen in het dossier). */
export const EERSTE_DEELJAAR = 2024

/** Jaren van de deelcalculators: vanaf EERSTE_DEELJAAR, zonder conceptjaren. */
export const DEEL_JAREN: number[] = BESCHIKBARE_JAREN().filter((j) => j >= EERSTE_DEELJAAR && !CONCEPT_JAREN.includes(j))

const cache = new Map<string, TaxYearParams>()

/** getJaar met een kleine cache: de parameters zijn onveranderlijk, getJaar maakt elke keer een kopie. */
export function params(jaar: number, variant?: string): TaxYearParams {
  const sleutel = `${jaar}|${variant ?? ''}`
  let p = cache.get(sleutel)
  if (!p) {
    p = getJaar(jaar, variant || undefined)
    cache.set(sleutel, p)
  }
  return p
}

/** Status van een jaar (met variant): de laagste status van alle blokken. */
export function jaarStatus(jaar: number, variant?: string): Status {
  return params(jaar, variant).status
}

export function jaarOpties(jaren: readonly number[]): JaarOptie[] {
  return jaren.map((jaar) => ({ jaar, status: jaarStatus(jaar) }))
}

/** Heeft dit jaar varianten (twee voorstellen naast elkaar)? */
export function heeftVarianten(jaar: number): boolean {
  return params(jaar).varianten.length > 0
}

/** Leesbaar label van een jaar met variant. */
export function jaarLabel(jaar: number, variant?: string): string {
  if (!variant) return String(jaar)
  const v = params(jaar).varianten.find((x) => x.id === variant)
  return v ? `${jaar} (${v.label.toLowerCase()})` : String(jaar)
}
