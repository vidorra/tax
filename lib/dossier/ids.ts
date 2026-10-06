/**
 * Ronde 2 (contract): vaste id's voor lijstitems zonder eigen id in oudere invoer, zodat veld-id's, invulhulpsleutels,
 * VIA-bedragen en controle-id's niet aan een index hangen. Haalt de gebruiker de eerste werkgever weg, dan blijft het
 * VIA-bedrag van de tweede bij de tweede.
 *
 * Twee manieren:
 * - deterministisch (`vulIds(invoer)`): items zonder id krijgen `${prefix}-${n}` met de laagste vrije n vanaf hun
 *   positie + 1. Zelfde invoer, zelfde id's. De server zet ze in `laadJaar` en `laadAlleInvoer`, zodat editor,
 *   invulhulp, planning en controles dezelfde id's zien; bij de eerste opslag staan ze in de invoer.
 * - willekeurig (`vulIds(invoer, nieuwId)`): voor items die de gebruiker in de editor toevoegt. Een willekeurige id
 *   wordt nooit hergebruikt, ook niet na weghalen en opnieuw toevoegen.
 *
 * Puur (de generator komt van buiten). Id's voldoen aan ID_PATROON: geschikt als segment in een veld-id en als sleutel
 * in de aangiftestaat.
 */
import type { HuishoudenInvoer } from '@/lib/tax/types'

export const ID_PATROON = /^[A-Za-z0-9_-]{1,40}$/

/** Voorvoegsel per soort item. */
export const ID_PREFIX = { loon: 'loon', onderneming: 'ond', investering: 'inv', leningdeel: 'ld', box2: 'ab' } as const

type MetId = { id?: string }

function vulLijst(lijst: MetId[] | undefined, prefix: string, nieuwId?: (prefix: string) => string): void {
  if (!lijst || lijst.length === 0) return
  const bezet = new Set(lijst.map((x) => x.id).filter((x): x is string => typeof x === 'string' && ID_PATROON.test(x)))
  lijst.forEach((item, i) => {
    if (typeof item.id === 'string' && ID_PATROON.test(item.id)) return
    let id: string
    if (nieuwId) {
      do id = nieuwId(prefix)
      while (bezet.has(id) || !ID_PATROON.test(id))
    } else {
      let n = i + 1
      while (bezet.has(`${prefix}-${n}`)) n++
      id = `${prefix}-${n}`
    }
    bezet.add(id)
    item.id = id
  })
}

/**
 * Zet ontbrekende of ongeldige id's op loon, ondernemingen, investeringen, leningdelen en box 2-belangen. Wijzigt
 * `invoer` ter plekke en geeft hem terug. Zonder `nieuwId` deterministisch, met `nieuwId` willekeurig.
 */
export function vulIds(invoer: HuishoudenInvoer, nieuwId?: (prefix: string) => string): HuishoudenInvoer {
  for (const p of invoer.personen ?? []) {
    vulLijst(p.loon, ID_PREFIX.loon, nieuwId)
    vulLijst(p.ondernemingen, ID_PREFIX.onderneming, nieuwId)
    for (const o of p.ondernemingen ?? []) vulLijst(o.investeringen, ID_PREFIX.investering, nieuwId)
  }
  vulLijst(invoer.eigenWoning?.leningdelen, ID_PREFIX.leningdeel, nieuwId)
  vulLijst(invoer.box2, ID_PREFIX.box2, nieuwId)
  return invoer
}

/** Willekeurige id voor een nieuw item in de browser: `${prefix}-` plus acht tekens. */
export function willekeurigeId(prefix: string): string {
  const c = globalThis.crypto
  const r = c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${r}`
}

/** Sleutel van een item in een veld-id of controle-id: de id, of de index als terugval voor oude invoer. */
export function itemSleutel(item: MetId | undefined, index: number): string {
  return item && typeof item.id === 'string' && ID_PATROON.test(item.id) ? item.id : String(index)
}
