'use client'

/**
 * Ronde 2 (contract, na de toets): niet-opgeslagen wijzigingen in de editor, gedeeld met de navigatie.
 *
 * De editor (HuishoudenEditor, A3) meldt zich met `meldOnopgeslagen({ gewijzigd, bewaar })` en bij unmount met null.
 * JaarNav (A1) leest het met `useOnopgeslagen()`: bij niet-opgeslagen wijzigingen heet de knop terug "Opslaan en terug
 * naar {tab}" (eerst `bewaar()`, dan navigeren) en waarschuwen de tabs in de pagina zelf ("Je hebt wijzigingen die nog
 * niet zijn opgeslagen. Opslaan · Toch weggaan"), want binnen Next vuurt `beforeunload` niet.
 */
import { useSyncExternalStore } from 'react'

export interface Onopgeslagen {
  gewijzigd: boolean
  /** Slaat op; true als het lukte (bij een fout blijft de gebruiker op de pagina met de melding van de editor). */
  bewaar: () => Promise<boolean>
  /** Id van de melding van de editor als opslaan niet lukt, zodat de tabrij erheen kan springen. */
  foutId?: string
}

let huidig: Onopgeslagen | null = null
const luisteraars = new Set<() => void>()

export function meldOnopgeslagen(x: Onopgeslagen | null): void {
  huidig = x
  for (const l of luisteraars) l()
}

function abonneer(l: () => void): () => void {
  luisteraars.add(l)
  return () => luisteraars.delete(l)
}

export function useOnopgeslagen(): Onopgeslagen | null {
  return useSyncExternalStore(
    abonneer,
    () => huidig,
    () => null,
  )
}
