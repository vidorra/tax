/** Ronde 2 (A1): hulpjes voor de tests van de invulhulp. */
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import { vulIds } from '@/lib/dossier/ids'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { bouwInvulhulp } from '../opbouw'
import type { InvulhulpOpbouw, Scherm, Veld } from '../types'

export const kloon = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** De voorbeeldaangifte 2024 met jaarrekening, met vaste id's zoals de server ze zet. */
export function voorbeeld2024(): HuishoudenInvoer {
  return vulIds(voorbeeldInvoer(2024))
}

export function bouw(invoer: HuishoudenInvoer, jaar = invoer.jaar): InvulhulpOpbouw {
  const resultaat = berekenHuishouden({ ...invoer, jaar })
  return bouwInvulhulp({ jaar, invoer: { ...invoer, jaar }, resultaat, params: getJaar(jaar) })
}

export function scherm(o: InvulhulpOpbouw, sleutel: string): Scherm {
  const s = o.schermen.find((x) => x.sleutel === sleutel)
  if (!s) throw new Error(`scherm ${sleutel} ontbreekt; wel: ${o.schermen.map((x) => x.sleutel).join(', ')}`)
  return s
}

export function velden(o: InvulhulpOpbouw): Veld[] {
  return o.schermen.flatMap((s) => s.rubrieken.flatMap((r) => r.velden))
}

export function veld(o: InvulhulpOpbouw, sleutel: string): Veld {
  const v = velden(o).find((x) => x.sleutel === sleutel)
  if (!v) throw new Error(`veld ${sleutel} ontbreekt`)
  return v
}
