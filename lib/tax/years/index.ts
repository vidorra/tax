/**
 * Register van alle belastingjaren. Nieuw jaar = één import + één regel in JAREN.
 */
import type { Status, TaxYearParams } from '../types'
import { STATUS_RANG, BLOK_NAMEN } from '../types'
import p2021 from './2021'
import p2022 from './2022'
import p2023 from './2023'
import p2024 from './2024'
import p2025 from './2025'
import p2026 from './2026'
import p2027 from './2027'
import p2028 from './2028.draft'

export const JAREN: Record<number, TaxYearParams> = {
  2021: p2021,
  2022: p2022,
  2023: p2023,
  2024: p2024,
  2025: p2025,
  2026: p2026,
  2027: p2027,
  2028: p2028,
}

/** Jaren die alleen als concept (draft) bestaan; de UI toont ze met een waarschuwing. */
export const CONCEPT_JAREN: readonly number[] = [2028]

export const BESCHIKBARE_JAREN = (): number[] => Object.keys(JAREN).map(Number).sort((a, b) => a - b)

/** Standaardjaar van de publieke calculator. */
export const STANDAARD_JAAR = 2026

/** Laatste jaar waarvan alle blokken definitief zijn. */
export const laatsteDefinitieveJaar = (): number =>
  Math.max(...Object.values(JAREN).filter((p) => p.status === 'definitief').map((p) => p.jaar))

/** Diepe kopie die functies (varianten) behoudt. */
export function kloon<T>(x: T): T {
  if (Array.isArray(x)) return x.map(kloon) as unknown as T
  if (x && typeof x === 'object') {
    const uit: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) uit[k] = kloon(v)
    return uit as T
  }
  return x
}

/** Laagste status over alle blokken en veldstatussen. */
export function laagsteStatus(p: TaxYearParams): Status {
  let laagste: Status = 'definitief'
  const kandidaat = (s: Status) => {
    if (STATUS_RANG[s] < STATUS_RANG[laagste]) laagste = s
  }
  for (const naam of BLOK_NAMEN) {
    const blok = p[naam]
    kandidaat(blok.status)
    for (const s of Object.values(blok.veldStatus ?? {})) if (s) kandidaat(s as Status)
  }
  return laagste
}

/**
 * Parameters van een jaar, eventueel met een variant toegepast.
 * Gooit een fout bij een onbekend jaar of een onbekende variant.
 */
export function getJaar(jaar: number, variant?: string): TaxYearParams {
  const basis = JAREN[jaar]
  if (!basis) throw new Error(`Geen parameters voor belastingjaar ${jaar}. Beschikbaar: ${BESCHIKBARE_JAREN().join(', ')}`)
  const kopie = kloon(basis)
  if (!variant) return kopie
  const v = basis.varianten.find((x) => x.id === variant)
  if (!v) throw new Error(`Onbekende variant '${variant}' voor ${jaar}. Beschikbaar: ${basis.varianten.map((x) => x.id).join(', ') || 'geen'}`)
  const aangepast = v.pas(kopie)
  return { ...aangepast, status: STATUS_RANG[v.status] < STATUS_RANG[aangepast.status] ? v.status : aangepast.status }
}

/** Status van een veld: veldStatus wint van de blokstatus. */
export function veldStatus<K extends (typeof BLOK_NAMEN)[number]>(p: TaxYearParams, blok: K, veld: string): Status {
  const b = p[blok] as { status: Status; veldStatus?: Record<string, Status | undefined> }
  return b.veldStatus?.[veld] ?? b.status
}
