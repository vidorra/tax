'use client'

/**
 * Ronde 2 (A3): wat een veld in de editor over de controles weet, zonder dat elke sectie props hoeft door te geven.
 *
 * - `VeldControlesProvider` (HuishoudenEditor) zet per veld-id de open controles klaar en of het jaar streng is.
 *   Een invoerelement met `veld` (components/dossier/velden.tsx) leest dat met `useVeldMelding` en toont:
 *     - een fout (rood, via de bestaande `error`): als het jaar streng is, of (besluit na de nacontrole) zodra de
 *       gebruiker het veld heeft verlaten, ook in een rustig jaar;
 *     - een let op (amber, onder het veld): alleen als het jaar streng is.
 *   Het blok Controles, de teller en de mobiele foutknop staan hier los van.
 * - `PersoonVeldProvider`: de persoon van de secties eronder, voor onderdelen die hun veld-id zelf niet kunnen maken
 *   (JaarrekeningInvoer krijgt alleen de onderneming).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { PersoonId } from '@/lib/tax/types'
import type { Controle } from '@/lib/controles/types'
import type { VeldId } from '@/lib/dossier/veld'

export interface VeldControles {
  /** Open controles per veld-id (`veld` en de velden van `velden`). */
  perVeld: ReadonlyMap<VeldId, Controle[]>
  streng: boolean
}

const VeldControlesContext = createContext<VeldControles | null>(null)

/** Open controles per veld-id. Een controle met meer velden (verplicht-leeg) staat bij elk van die velden. */
export function controlesPerVeld(open: readonly Controle[]): Map<VeldId, Controle[]> {
  const uit = new Map<VeldId, Controle[]>()
  const zet = (veld: VeldId, c: Controle) => {
    const lijst = uit.get(veld) ?? []
    if (!lijst.includes(c)) lijst.push(c)
    uit.set(veld, lijst)
  }
  for (const c of open) {
    if (c.ernst === 'info') continue
    if (c.velden && c.velden.length > 0) for (const v of c.velden) zet(v.veld, c)
    else if (c.veld) zet(c.veld, c)
  }
  return uit
}

export function VeldControlesProvider({ open, streng, children }: { open: readonly Controle[]; streng: boolean; children: ReactNode }) {
  const waarde = useMemo<VeldControles>(() => ({ perVeld: controlesPerVeld(open), streng }), [open, streng])
  return <VeldControlesContext.Provider value={waarde}>{children}</VeldControlesContext.Provider>
}

/** Tekst bij een veld: bij verplicht-leeg "Dit moet je invullen.", anders de titel van de controle. */
function veldTekst(c: Controle): string {
  return c.regel === 'verplicht-leeg' ? 'Dit moet je invullen.' : c.titel
}

export interface VeldMelding {
  /** Rode fout bij het veld, of undefined. */
  fout?: string
  /** Amber let op onder het veld, of undefined. */
  melding?: string
  /** Aan de wrapper: het veld is verlaten (vanaf nu toont het zijn eigen fout). */
  opVerlaten: () => void
}

/**
 * Fout en let op van één veld. `fout` en `melding` van de aanroeper gaan voor die uit de controles; voor allebei geldt
 * dezelfde zichtbaarheid (fout: streng of verlaten; let op: alleen streng).
 */
export function useVeldMelding(veld: VeldId | undefined, eigen: { fout?: string; melding?: string } = {}): VeldMelding {
  const ctx = useContext(VeldControlesContext)
  const [verlaten, setVerlaten] = useState(false)
  const controles = veld && ctx ? ctx.perVeld.get(veld) : undefined
  const streng = ctx?.streng ?? false
  const fout = eigen.fout ?? (veld ? controles?.find((c) => c.ernst === 'fout') : undefined)
  const letOp = eigen.melding ?? (veld ? controles?.find((c) => c.ernst === 'let-op') : undefined)
  const tekst = (x: string | Controle | undefined) => (x === undefined ? undefined : typeof x === 'string' ? x : veldTekst(x))
  return {
    fout: fout !== undefined && (streng || verlaten) ? tekst(fout) : undefined,
    melding: letOp !== undefined && streng ? tekst(letOp) : undefined,
    opVerlaten: () => {
      if (!verlaten) setVerlaten(true)
    },
  }
}

const PersoonVeldContext = createContext<PersoonId | null>(null)

export function PersoonVeldProvider({ persoon, children }: { persoon: PersoonId; children: ReactNode }) {
  return <PersoonVeldContext.Provider value={persoon}>{children}</PersoonVeldContext.Provider>
}

/** De persoon van de secties eronder; null buiten de editor. */
export function usePersoonVeld(): PersoonId | null {
  return useContext(PersoonVeldContext)
}
