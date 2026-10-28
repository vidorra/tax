/** Fetch-hulp voor de dossierpagina's. Paden met slash aan het eind (trailingSlash in next.config). */

import type { BackupResultaat, BackupStatusPubliek } from '@/lib/backup/types'
import type { StaatWijziging } from '@/lib/dossier/aangiftestaat'
import type { AangifteStaatAntwoord } from '@/lib/dossier/aangiftestaat-opslag'
import type { GegevensAntwoord } from '@/lib/dossier/gegevens'
import type { MbAdministratie, MbIndeling, MbIndelingWijziging, MbJaarImport, MbKoppelingPubliek } from '@/lib/moneybird/types'
import type { HuishoudenGegevens } from '@/lib/rapport/model'
import type { HerstelResultaat, HerstelVoorstel, JsonImportResultaat, JsonImportVerzoek } from '@/lib/import/types'

export interface ApiUitkomst<T> {
  ok: boolean
  status: number
  data: T | null
  fout: string | null
  fouten?: string[]
}

/** Browsers staan bij `keepalive` hooguit 64 KB per verzoek toe; daarboven sturen we gewoon. */
const KEEPALIVE_MAX = 60_000

export async function api<T>(pad: string, init: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<ApiUitkomst<T>> {
  const url = pad.endsWith('/') ? pad : `${pad}/`
  try {
    const body = init.body !== undefined ? JSON.stringify(init.body) : undefined
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body,
      credentials: 'same-origin',
      cache: 'no-store',
      // Ronde 2: een verzoek dat het verlaten van de pagina moet overleven (aangiftestaat bij weggaan).
      ...(init.keepalive && (body?.length ?? 0) <= KEEPALIVE_MAX ? { keepalive: true } : {}),
    })
    const data = (await res.json().catch(() => null)) as (T & { fout?: string; fouten?: string[] }) | null
    if (!res.ok) {
      if (res.status === 401 && typeof window !== 'undefined' && !pad.startsWith('/api/auth/')) {
        window.location.href = '/dossier/login/'
      }
      return { ok: false, status: res.status, data: null, fout: data?.fout ?? `Er ging iets mis (${res.status}).`, fouten: data?.fouten }
    }
    return { ok: true, status: res.status, data, fout: null }
  } catch {
    return { ok: false, status: 0, data: null, fout: 'Geen verbinding met de server. Controleer je internet en probeer het opnieuw.' }
  }
}

// ---------------------------------------------------------------------------
// Moneybird-koppelingen (contract: lib/moneybird/types.ts)
// ---------------------------------------------------------------------------

const koppelingPad = (id: string) => `/api/dossier/koppelingen/${encodeURIComponent(id)}`

export const koppelingenApi = {
  lijst: () => api<{ koppelingen: MbKoppelingPubliek[] }>('/api/dossier/koppelingen'),
  /** Het token gaat alleen in de body van dit verzoek mee en komt nooit terug. */
  voegToe: (token: string, label: string, persoon: 'A' | 'B' | null = null) =>
    api<{ koppeling: MbKoppelingPubliek; administraties: MbAdministratie[] }>('/api/dossier/koppelingen', { method: 'POST', body: { token, label, persoon } }),
  /** Van wie de administratie is (A, B of null), zonder Moneybird te vragen. */
  zetPersoon: (id: string, persoon: 'A' | 'B' | null) => api<{ koppeling: MbKoppelingPubliek }>(koppelingPad(id), { method: 'PATCH', body: { persoon } }),
  kiesAdministratie: (id: string, administratieId: string, label?: string) =>
    api<{ koppeling: MbKoppelingPubliek }>(koppelingPad(id), { method: 'PATCH', body: label === undefined ? { administratieId } : { administratieId, label } }),
  verwijder: (id: string) => api<{ ok: true }>(koppelingPad(id), { method: 'DELETE' }),
  administraties: (id: string) => api<{ administraties: MbAdministratie[] }>(`${koppelingPad(id)}/administraties`),
  importeer: (id: string, jaar: number) => api<{ import: MbJaarImport }>(`${koppelingPad(id)}/import`, { method: 'POST', body: { jaar } }),
  bewaarIndeling: (id: string, indeling: MbIndelingWijziging) => api<{ indeling: MbIndeling }>(`${koppelingPad(id)}/indeling`, { method: 'PUT', body: { indeling } }),
}

// ---------------------------------------------------------------------------
// Back-up van de database (contract: lib/backup/types.ts)
// ---------------------------------------------------------------------------

export interface BackupMailAntwoord {
  resultaat: Pick<BackupResultaat, 'status' | 'reden' | 'bestandsnaam' | 'bytes'>
  backup: BackupStatusPubliek
}

export const backupApi = {
  status: () => api<BackupStatusPubliek>('/api/dossier/backup'),
  mailNu: () => api<BackupMailAntwoord>('/api/dossier/backup', { method: 'POST' }),
}

// ---------------------------------------------------------------------------
// Persoonlijke gegevens van het huishouden (contract: lib/rapport/model.ts HuishoudenGegevens)
// ---------------------------------------------------------------------------

export type { GegevensAntwoord }

export const gegevensApi = {
  laad: () => api<GegevensAntwoord>('/api/dossier/gegevens'),
  /** Vervangt het geheel; bij 422 staan de fouten per veld in `fouten` ('adres.postcode: ...'). */
  bewaar: (gegevens: HuishoudenGegevens) => api<GegevensAntwoord>('/api/dossier/gegevens', { method: 'PUT', body: { gegevens } }),
}

// ---------------------------------------------------------------------------
// Aangiftestaat per jaar (ronde 2, contract: lib/dossier/aangiftestaat.ts). Gebruik bij voorkeur useAangifteStaat.
// ---------------------------------------------------------------------------

export const aangifteStaatApi = {
  laad: (jaar: number) => api<AangifteStaatAntwoord>(`/api/dossier/jaren/${jaar}/aangiftestaat`),
  wijzig: (jaar: number, wijzigingen: StaatWijziging[], opties: { keepalive?: boolean } = {}) =>
    api<AangifteStaatAntwoord>(`/api/dossier/jaren/${jaar}/aangiftestaat`, { method: 'PATCH', body: { wijzigingen }, keepalive: opties.keepalive }),
}

export const importApi = {
  /** Geheim voor de rekeningsleutel van de broker-import (lib/import/sleutel.ts); alleen in het geheugen houden. */
  geheim: () => api<{ geheim: string }>('/api/dossier/import/sleutel'),
  /** JSON-import: alleen de gekozen jaren en onderdelen (lib/import/json.ts bouwVerzoek). */
  importeer: (verzoek: JsonImportVerzoek) => api<JsonImportResultaat>('/api/dossier/import', { method: 'POST', body: verzoek }),
  /** Wat ongedaan maken zou doen, zonder iets te veranderen. */
  herstelVoorstel: (herstelpuntId: number) => api<{ voorstel: HerstelVoorstel }>('/api/dossier/import/herstel', { method: 'POST', body: { herstelpuntId } }),
  /** Ongedaan maken uitvoeren. */
  herstel: (herstelpuntId: number) => api<{ resultaat: HerstelResultaat }>('/api/dossier/import/herstel', { method: 'POST', body: { herstelpuntId, bevestigd: true } }),
}
