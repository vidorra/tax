/**
 * Ronde 2 (A4): een broker-import ongedaan maken in de editor (`BrokerOngedaan`). Alleen de bezittingen die de import
 * veranderde of toevoegde gaan terug; wat de gebruiker daarna bij andere bezittingen typte, blijft staan. Is een van die
 * bezittingen na de import nog aangepast, dan vraagt de UI eerst: "Je latere wijzigingen bij {naam} gaan ook verloren.
 * Doorgaan?". Puur.
 */
import type { HuishoudenInvoer, VermogensPositie } from '@/lib/tax/types'
import type { BrokerOngedaan } from './types'

const stabiel = (x: unknown): string =>
  JSON.stringify(x, (_k, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, w]) => w !== undefined).sort(([a], [b]) => a.localeCompare(b))) : v))

/** Vergelijkt twee posities los van de volgorde van de velden. */
export function zelfdePositie(a: VermogensPositie | undefined | null, b: VermogensPositie | undefined | null): boolean {
  return stabiel(a ?? null) === stabiel(b ?? null)
}

export function maakOngedaan(posities: BrokerOngedaan['posities']): BrokerOngedaan {
  return { posities: posities.map((p) => ({ id: p.id, voor: p.voor ? structuredClone(p.voor) : null, naImport: structuredClone(p.naImport) })) }
}

const naam = (p: VermogensPositie) => p.omschrijving.trim() || 'een bezitting'

/**
 * Kan het zonder verlies? `gewijzigd` noemt de bezittingen die na de import nog zijn aangepast of weggehaald (hun
 * omschrijving); leeg betekent: terugzetten raakt geen latere wijziging.
 */
export function kanOngedaan(invoer: HuishoudenInvoer, ongedaan: BrokerOngedaan): { kan: boolean; gewijzigd: string[] } {
  const gewijzigd: string[] = []
  for (const p of ongedaan.posities) {
    const nu = invoer.box3.posities.find((x) => x.id === p.id)
    if (!zelfdePositie(nu, p.naImport)) gewijzigd.push(naam(nu ?? p.naImport))
  }
  return { kan: ongedaan.posities.length > 0, gewijzigd }
}

/** Zet de bezittingen van de import terug (nieuw toegevoegd: weg); de rest van de invoer blijft zoals hij is. */
export function zetTerug(invoer: HuishoudenInvoer, ongedaan: BrokerOngedaan): HuishoudenInvoer {
  const uit = structuredClone(invoer)
  for (const p of ongedaan.posities) {
    const i = uit.box3.posities.findIndex((x) => x.id === p.id)
    if (p.voor === null) {
      if (i >= 0) uit.box3.posities.splice(i, 1)
    } else if (i >= 0) uit.box3.posities[i] = structuredClone(p.voor)
    else uit.box3.posities.push(structuredClone(p.voor))
  }
  return uit
}

/** "a", "a en b", "a, b en c". */
export function opsomming(namen: string[]): string {
  if (namen.length <= 1) return namen.join('')
  return `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`
}
