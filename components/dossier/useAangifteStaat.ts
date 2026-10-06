'use client'

/**
 * Ronde 2 (contract, na de toets): aangiftestaat van een jaar laden en zelf opslaan (zie lib/dossier/aangiftestaat.ts).
 *
 * Eén gedeelde instantie per pagina: de pagina die de staat bezit, zet <AangifteStaatProvider jaar={…}> om haar inhoud
 * (Invoer: A3, Planning: A2, Aangifte invullen: A1, Export: A3); alles daarbinnen gebruikt `useAangifteStaatContext()`.
 * Zo zien tellers en lijsten op één pagina altijd dezelfde staat. `useAangifteStaat(jaar)` zonder provider blijft
 * bestaan voor een losse component, maar gebruik het niet twee keer op één pagina.
 *
 * Opslaan (de wachtrij staat in aangiftestaat-wachtrij.ts):
 * - `wijzig(w)` werkt direct in de browser en verstuurt na 800 ms rust; `{ direct: true }` meteen (negeren,
 *   terugvraagstatus, Klopt in de invulhulp).
 * - `flush()` verstuurt wat wacht en wacht op het antwoord. Roep het aan vóór een navigatie die je zelf start
 *   (Aanpassen, Naar het veld) en vóór een PUT van het jaar met een andere status.
 * - Bij unmount (ook navigeren binnen Next, waar `beforeunload` niet vuurt), bij `pagehide` en bij
 *   `visibilitychange` naar verborgen gaat de wachtrij direct de deur uit met `keepalive`.
 * - Een geweigerd pakket (4xx) valt weg met een melding en de staat wordt opnieuw geladen; netwerkfouten en 5xx worden
 *   automatisch opnieuw geprobeerd met een zichtbare status (`opslag` 'mislukt', `fout`, `opnieuwProberen()`).
 * - Zolang er iets wacht of onderweg is, waarschuwt de browser bij het sluiten van het tabblad.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LEGE_STAAT, pasStaatToe, type AangifteStaat, type StaatWijziging } from '@/lib/dossier/aangiftestaat'
import { aangifteStaatApi } from './api'
import { StaatWachtrij, type StaatOpslag, type WachtrijStand } from './aangiftestaat-wachtrij'

export type { StaatOpslag } from './aangiftestaat-wachtrij'
export type StaatLaden = 'laden' | 'klaar' | 'fout'

export interface UseAangifteStaat {
  staat: AangifteStaat
  laden: StaatLaden
  /** 'opgeslagen' · 'wacht' (wijziging in de wachtrij) · 'bezig' · 'mislukt' (wordt opnieuw geprobeerd). */
  opslag: StaatOpslag
  /** Melding bij laden of opslaan, in gewoon Nederlands. */
  fout: string | null
  bijgewerkt: string | null
  wijzig: (wijzigingen: StaatWijziging[], opties?: { direct?: boolean }) => void
  /** Verstuurt wat wacht en wacht op het antwoord; true als alles is opgeslagen. */
  flush: () => Promise<boolean>
  opnieuwLaden: () => void
  opnieuwProberen: () => void
}

/** Korte statustekst voor naast een autosave: "Opgeslagen", "Bezig met opslaan", "Niet opgeslagen". */
export function opslagTekst(opslag: StaatOpslag): string {
  return opslag === 'opgeslagen' ? 'Opgeslagen' : opslag === 'mislukt' ? 'Niet opgeslagen' : 'Bezig met opslaan'
}

export function useAangifteStaat(jaar: number, opties: { vertraging?: number; beginStaat?: AangifteStaat | null } = {}): UseAangifteStaat {
  const [staat, setStaat] = useState<AangifteStaat>(opties.beginStaat ?? LEGE_STAAT)
  const [laden, setLaden] = useState<StaatLaden>(opties.beginStaat ? 'klaar' : 'laden')
  const [stand, setStand] = useState<WachtrijStand>({ opslag: 'opgeslagen', fout: null, geweigerd: false, volgendePoging: null })
  const [laadFout, setLaadFout] = useState<string | null>(null)
  const [bijgewerkt, setBijgewerkt] = useState<string | null>(null)
  const gemount = useRef(true)
  const laadRef = useRef<() => void>(() => undefined)

  const wachtrij = useMemo(
    () =>
      new StaatWachtrij({
        vertraging: opties.vertraging ?? 800,
        verstuur: (w, o) => aangifteStaatApi.wijzig(jaar, w, o),
        onStaat: (s, b) => {
          if (!gemount.current) return
          setStaat(s)
          setBijgewerkt(b)
        },
        onStand: (s) => {
          if (gemount.current) setStand(s)
        },
        herlaad: () => laadRef.current(),
      }),
    // Eén wachtrij per jaar; de vertraging verandert niet tijdens het leven van de pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jaar],
  )

  const laad = useCallback(async () => {
    setLaden('laden')
    const r = await aangifteStaatApi.laad(jaar)
    if (!gemount.current) return
    if (!r.ok || !r.data) {
      setLaden('fout')
      setLaadFout(r.fout ?? 'De gegevens konden niet worden geladen.')
      return
    }
    setLaadFout(null)
    setBijgewerkt(r.data.bijgewerkt)
    setStaat(wachtrij.legOver(r.data.staat))
    setLaden('klaar')
  }, [jaar, wachtrij])
  laadRef.current = () => void laad()

  useEffect(() => {
    gemount.current = true
    if (!opties.beginStaat) void laad()
    const weg = () => wachtrij.bijWeggaan()
    const zichtbaarheid = () => {
      if (document.visibilityState === 'hidden') wachtrij.bijWeggaan()
    }
    window.addEventListener('pagehide', weg)
    document.addEventListener('visibilitychange', zichtbaarheid)
    return () => {
      window.removeEventListener('pagehide', weg)
      document.removeEventListener('visibilitychange', zichtbaarheid)
      // Navigeren binnen Next: de component verdwijnt, de pagina niet. Wat wacht, gaat nu meteen weg.
      wachtrij.bijWeggaan()
      wachtrij.stop()
      gemount.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wachtrij])

  useEffect(() => {
    if (stand.opslag === 'opgeslagen') return
    const waarschuw = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', waarschuw)
    return () => window.removeEventListener('beforeunload', waarschuw)
  }, [stand.opslag])

  const wijzig = useCallback(
    (wijzigingen: StaatWijziging[], o: { direct?: boolean } = {}) => {
      if (wijzigingen.length === 0) return
      setStaat((vorig) => {
        const r = pasStaatToe(vorig, wijzigingen)
        return 'fout' in r ? vorig : r.staat
      })
      wachtrij.voegToe(wijzigingen, o)
    },
    [wachtrij],
  )

  return {
    staat,
    laden,
    opslag: stand.opslag,
    fout: stand.fout ?? laadFout,
    bijgewerkt,
    wijzig,
    flush: useCallback(() => wachtrij.flush(), [wachtrij]),
    opnieuwLaden: () => void laad(),
    opnieuwProberen: () => wachtrij.opnieuw(),
  }
}

const AangifteStaatContext = createContext<UseAangifteStaat | null>(null)

/** Eén aangiftestaat voor de hele pagina; zet hem zo hoog mogelijk in de pagina die de staat bezit. */
export function AangifteStaatProvider({ jaar, beginStaat, children }: { jaar: number; beginStaat?: AangifteStaat | null; children: ReactNode }) {
  const waarde = useAangifteStaat(jaar, { beginStaat })
  return createElement(AangifteStaatContext.Provider, { value: waarde }, children)
}

/** De gedeelde aangiftestaat van de pagina. Gooit een fout zonder AangifteStaatProvider erboven. */
export function useAangifteStaatContext(): UseAangifteStaat {
  const w = useContext(AangifteStaatContext)
  if (!w) throw new Error('useAangifteStaatContext zonder AangifteStaatProvider erboven')
  return w
}

/** Als er een provider is, die; anders null (voor componenten die zowel met als zonder staat werken). */
export function useAangifteStaatOptioneel(): UseAangifteStaat | null {
  return useContext(AangifteStaatContext)
}
