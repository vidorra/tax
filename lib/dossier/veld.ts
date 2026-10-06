/**
 * Ronde 2, contract. Vaste id's voor velden in de invoer, zodat controles, de invulhulp, de import en het zoekveld
 * naar één veld kunnen springen. Puur: geen React, geen I/O.
 *
 * Opbouw: segmenten gescheiden door '/'. Een segment is een naam, of naam ':' sleutel. De sleutel is een persoon-id,
 * de `id` van een item, of (alleen voor oude invoer of lijsten zonder id, zoals activa) een index. Ronde 2 na de toets:
 * loon, ondernemingen, investeringen, leningdelen en box 2-belangen hebben een vaste id (lib/dossier/ids.ts); gebruik
 * `itemSleutel(item, index)` zodat de index alleen een terugval is. Een sleutel bevat geen '/' (de eerste ':' scheidt
 * naam en sleutel). Het laatste segment is het veld, met punten voor geneste velden. Voorbeelden:
 *
 *   huishouden/fiscaalPartner
 *   persoon:A/geboortedatum
 *   persoon:A/voorlopigeAanslagIB
 *   persoon:A/onderneming:ond-1/winstberekening.saldo
 *   persoon:A/onderneming:ond-1/jaarrekening.eind.liquideMiddelen
 *   persoon:A/onderneming:ond-1/activa:3/verkocht.verkoopprijs
 *   persoon:A/onderneming:ond-1/herinvesteringsreserve:hir-2025-1/voornemen
 *   persoon:A/loon:loon-2/ingehoudenLoonheffing
 *   eigenWoning/woz
 *   eigenWoning/leningdeel:ld-1/rente
 *   box3/positie:positie-ab12cd/waardeBegin
 *   box3/positie:positie-ab12cd/bronbelasting:bb-x9/land
 *   box3/schuld:schuld-k3/waardeBegin
 *   box2:0/vervreemdingsvoordeel
 *   pga/giftenGewoon
 *   verdeling/box3
 *
 * Elk invoerelement in de editor draagt zijn id als `data-veld` op de wrapper (prop `veld` op de velden in
 * components/dossier/velden.tsx). Springen gebruikt de pagina zelf: Disclosure rendert dichte inhoud met `hidden`, dus
 * `[data-veld]` staat al in de DOM; vanaf het veld omhoog krijgt elke dichte uitklap OPEN_VERZOEK, de persoon komt
 * uit `leesVeldId` (onderdeel controles, A3). Labels en synoniemen staan per onderdeel in lib/dossier/veldregister/.
 */
import type { PersoonId } from '@/lib/tax/types'

/** Veld-id volgens de opbouw hierboven. */
export type VeldId = string

/** Tabblad van een dossierjaar, voor de knop terug na springen. */
export type TerugTab = 'invoer' | 'planning' | 'accountant' | 'aangifte' | 'export'

export interface VeldSegment {
  naam: string
  sleutel?: string
}

const SEGMENT = /^[A-Za-z][A-Za-z0-9.]*(:[^/]+)?$/

/** Bouwt een veld-id uit segmenten; `veld('persoon:A', 'onderneming:0', 'winstberekening.saldo')`. */
export function veld(...segmenten: string[]): VeldId {
  return segmenten.filter((s) => s !== '').join('/')
}

/** Veelgebruikte voorvoegsels. */
export const veldVan = {
  persoon: (id: PersoonId, ...rest: string[]): VeldId => veld(`persoon:${id}`, ...rest),
  /** `sleutel`: `itemSleutel(onderneming, index)` (de vaste id; de index alleen voor oude invoer). */
  onderneming: (id: PersoonId, sleutel: string | number, ...rest: string[]): VeldId => veld(`persoon:${id}`, `onderneming:${sleutel}`, ...rest),
  positie: (positieId: string, ...rest: string[]): VeldId => veld('box3', `positie:${positieId}`, ...rest),
  schuld: (schuldId: string, ...rest: string[]): VeldId => veld('box3', `schuld:${schuldId}`, ...rest),
  eigenWoning: (...rest: string[]): VeldId => veld('eigenWoning', ...rest),
}

/** Leest een veld-id; null als de opbouw niet klopt. */
export function leesVeldId(id: string): { segmenten: VeldSegment[]; persoon?: PersoonId } | null {
  if (typeof id !== 'string' || id.length === 0 || id.length > 300) return null
  const delen = id.split('/')
  const segmenten: VeldSegment[] = []
  for (const d of delen) {
    if (!SEGMENT.test(d)) return null
    const i = d.indexOf(':')
    segmenten.push(i < 0 ? { naam: d } : { naam: d.slice(0, i), sleutel: d.slice(i + 1) })
  }
  const p = segmenten.find((s) => s.naam === 'persoon')?.sleutel
  return { segmenten, ...(p === 'A' || p === 'B' ? { persoon: p } : {}) }
}

/** Is dit een geldig veld-id? */
export const isVeldId = (x: unknown): x is VeldId => typeof x === 'string' && leesVeldId(x) !== null

/**
 * Link naar een veld op de jaarpagina, met een knop terug naar het tabblad waar je vandaan kwam. Paden eindigen op
 * een slash (trailingSlash in next.config).
 */
export function veldHref(jaar: number, id: VeldId, terug?: TerugTab): string {
  const q = new URLSearchParams({ veld: id })
  if (terug && terug !== 'invoer') q.set('terug', terug)
  return `/dossier/${jaar}/?${q.toString()}`
}
