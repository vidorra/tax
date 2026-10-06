import type { HuishoudenInvoer, HuishoudenResultaat, PersoonInvoer } from '@/lib/tax/types'

export type Wijzig = (fn: (d: HuishoudenInvoer) => void) => void
export type WijzigPersoon = (fn: (p: PersoonInvoer) => void) => void

export interface SectieProps {
  invoer: HuishoudenInvoer
  wijzig: Wijzig
  /**
   * Ronde 2 (contract, na de nacontrole): de live uitkomst van het huishouden; null als de berekening niet lukt.
   * HuishoudenEditor geeft hem aan WoningSectie (A2: reserve, maximum, box 3-schuld), VermogenSectie (A5: verrekend en
   * doorgeschoven bronbelasting; A2: het deel van de hypotheek in box 3) en Box2Sectie (A2: teruggaaf, verliezen).
   * Lees defensief: velden van andere onderdelen ontbreken in je eigen worktree.
   */
  resultaat?: HuishoudenResultaat | null
}

export interface PersoonSectieProps {
  persoon: PersoonInvoer
  wijzigPersoon: WijzigPersoon
  jaar: number
  /**
   * Ronde 2: het hele huishouden, voor regelingen die over de grens van één persoon gaan (beloning aan en
   * terbeschikkingstelling door de partner, afgeleide regels bij de ander) en de live uitkomst.
   */
  huishouden?: { invoer: HuishoudenInvoer; wijzig: Wijzig; resultaat: HuishoudenResultaat | null }
}

/** Naam van een persoon voor in kopjes. */
export const persoonNaam = (p: { id: string; naam?: string }) => (p.naam?.trim() ? p.naam.trim() : `Persoon ${p.id}`)
