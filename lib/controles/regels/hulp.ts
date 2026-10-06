/**
 * Ronde 2 (A3): kleine hulpfuncties voor de controleregels van A3 (namen, plaatsen, sectie-id's). Puur.
 */
import type { HuishoudenInvoer, OndernemingInvoer, PersoonId, PersoonInvoer } from '@/lib/tax/types'
import { itemSleutel } from '@/lib/dossier/ids'

/** Naam van een persoon zoals de editor die toont: de ingevulde naam, anders "Persoon A". */
export function persoonNaam(p: Pick<PersoonInvoer, 'id' | 'naam'>): string {
  return p.naam?.trim() ? p.naam.trim() : `Persoon ${p.id}`
}

/** Naam van een onderneming, met een terugval als die leeg is. */
export function ondernemingNaam(o: Pick<OndernemingInvoer, 'naam'>): string {
  return o.naam?.trim() ? o.naam.trim() : 'Onderneming zonder naam'
}

/** "Ontwerpstudio · Persoon A" (de persoon alleen als er twee zijn). */
export function waarOnderneming(invoer: HuishoudenInvoer, p: PersoonInvoer, o: OndernemingInvoer): string {
  return invoer.personen.length > 1 ? `${ondernemingNaam(o)} · ${persoonNaam(p)}` : ondernemingNaam(o)
}

/** "Persoon A" of de naam, of niets bij één persoon. */
export function waarPersoon(invoer: HuishoudenInvoer, p: PersoonInvoer): string | undefined {
  return invoer.personen.length > 1 ? persoonNaam(p) : undefined
}

/** Sectie-id's op de jaarpagina (anker voor springen als er geen veld is). */
export const SECTIE = {
  huishouden: 'huishouden',
  ondernemingen: (p: PersoonId) => `ondernemingen-${p}`,
  loon: (p: PersoonId) => `loon-${p}`,
  pensioen: (p: PersoonId) => `pensioen-${p}`,
  aanslag: (p: PersoonId) => `aanslag-${p}`,
  woning: 'woning',
  vermogen: 'vermogen',
  pga: 'pga',
  box2: 'box2',
  verdeling: 'verdeling',
} as const

/** Ondernemingen van alle personen met hun vaste sleutel. */
export function alleOndernemingen(invoer: HuishoudenInvoer): Array<{ p: PersoonInvoer; o: OndernemingInvoer; index: number; sleutel: string }> {
  return invoer.personen.flatMap((p) => (p.ondernemingen ?? []).map((o, index) => ({ p, o, index, sleutel: itemSleutel(o, index) })))
}

/** Meervoud: "1 fout", "2 fouten". */
export function aantal(n: number, enkel: string, meer: string): string {
  return `${n} ${n === 1 ? enkel : meer}`
}
