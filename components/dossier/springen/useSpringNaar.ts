'use client'

/**
 * Ronde 2 (A3): springen naar een veld op de jaarpagina (ontwerp-ronde2.md 6.4, ux-ronde2.md 2.4).
 *
 * 1. De persoon uit het veld-id (`leesVeldId`) wordt gekozen in "Gegevens invullen voor".
 * 2. Het element met `data-veld` staat al in de DOM (een dichte uitklap rendert met `hidden`); elke uitklap erboven
 *    krijgt OPEN_VERZOEK (Disclosure en SituatieKiezer luisteren).
 * 3. Scrollen met ruimte erboven (`scroll-margin-top`), zonder animatie bij reduced motion.
 * 4. Focus op het invoerelement en een amber ring van 2,5 seconde (bij reduced motion tot het veld de focus verliest).
 * 5. `kondigAan("Naar {label}, {waar}.")` met het label uit het veldregister.
 * Bestaat het veld niet meer (het patroon staat in het register, het item niet), dan gaat de sprong naar de sectie
 * met "Dit veld bestaat niet meer. Je staat nu bij {sectie}." Een veld dat (nog) niet in het register staat, gaat
 * stil naar de sectie die de aanroeper meegeeft.
 */
import { useCallback, useRef, useState } from 'react'
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import { kondigAan } from '@/components/ui'
import { OPEN_VERZOEK_UITKLAP } from '@/components/ui/Disclosure'
import { leesVeldId, type VeldId } from '@/lib/dossier/veld'
import { VELDREGISTER } from '@/lib/dossier/veldregister'
import type { VeldregisterItem } from '@/lib/dossier/veldregister/types'
import { vindItem, vindVeld } from '@/lib/dossier/zoeken'

export const RING = ['ring-2', 'ring-amber-400', 'ring-offset-2'] as const
const RING_DUUR = 2500

export interface SpringMelding {
  tekst: string
  /** Oplopend, zodat dezelfde tekst twee keer na elkaar opnieuw verschijnt. */
  n: number
}

export interface SpringOpties {
  /** Sectie als het veld niet in de DOM staat (bijvoorbeeld uit een controle). */
  sectie?: string
  /** Label als het register het veld niet kent. */
  label?: string
}

const rustig = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const volgendFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** Wacht tot `vind()` iets geeft, hooguit een aantal frames (na het wisselen van persoon of het openen van een uitklap). */
async function wachtOp<T>(vind: () => T | null, frames = 30): Promise<T | null> {
  for (let i = 0; i < frames; i++) {
    const x = vind()
    if (x) return x
    await volgendFrame()
  }
  return vind()
}

const zoekVeld = (veld: VeldId) => document.querySelector<HTMLElement>(`[data-veld="${CSS.escape(veld)}"]`)

/** Opent elke uitklap boven het element; geeft true als er iets dicht was. */
export function openUitklappenBoven(el: HTMLElement): boolean {
  let dicht = false
  for (let n = el.parentElement; n; n = n.parentElement) {
    if (n.hidden) dicht = true
    if (n.hasAttribute('data-uitklap')) n.dispatchEvent(new CustomEvent(OPEN_VERZOEK_UITKLAP))
  }
  return dicht
}

/** Scrolt naar een element en zet de focus op het eerste invoerelement erin (of op het element zelf). */
export function scrolEnFocus(el: HTMLElement, opties: { ring?: boolean } = {}): void {
  const geenAnimatie = rustig()
  el.scrollIntoView({ behavior: geenAnimatie ? 'auto' : 'smooth', block: 'center' })
  const invoer = el.matches('input, select, textarea, button') ? el : el.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
  const doel = invoer ?? el
  if (!invoer && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  doel.focus({ preventScroll: true })
  if (!opties.ring) return
  el.classList.add(...RING)
  const weg = () => el.classList.remove(...RING)
  if (geenAnimatie) {
    const bijVerlaten = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return
      weg()
      el.removeEventListener('focusout', bijVerlaten)
    }
    el.addEventListener('focusout', bijVerlaten)
  } else {
    window.setTimeout(weg, RING_DUUR)
  }
}

/** Naar een sectie: scrollen en de focus op de kop (een sectie heeft `${id}-titel`). */
export function naarSectie(sectie: string): string | null {
  const el = document.getElementById(sectie)
  if (!el) return null
  const kop = document.getElementById(`${sectie}-titel`) ?? el
  if (!kop.hasAttribute('tabindex')) kop.setAttribute('tabindex', '-1')
  el.scrollIntoView({ behavior: rustig() ? 'auto' : 'smooth', block: 'start' })
  kop.focus({ preventScroll: true })
  return kop.textContent?.trim() || null
}

export interface UseSpringNaar {
  springNaar: (veld: VeldId, opties?: SpringOpties) => Promise<boolean>
  springNaarSectie: (sectie: string, naam?: string) => Promise<boolean>
  /**
   * Opent de kiezer "Bijzondere situatie toevoegen" met dit id en zet de focus op de optie (OPEN_VERZOEK met
   * `detail.optie`). Staat de kiezer bij de andere persoon, dan wordt eerst die persoon gekozen.
   */
  openKiezer: (elementId: string, optie: string) => Promise<boolean>
  melding: SpringMelding | null
  sluitMelding: () => void
}

/**
 * `actief` en `kiesPersoon`: de chips "Gegevens invullen voor" in de editor. `register` is het veldregister (standaard
 * alle onderdelen uit lib/dossier/veldregister).
 */
export function useSpringNaar(x: { invoer: HuishoudenInvoer; actief: PersoonId; kiesPersoon: (p: PersoonId) => void; register?: readonly VeldregisterItem[] }): UseSpringNaar {
  const [melding, setMelding] = useState<SpringMelding | null>(null)
  const teller = useRef(0)
  const laatste = useRef(x)
  laatste.current = x

  const meld = useCallback((tekst: string) => {
    teller.current += 1
    setMelding({ tekst, n: teller.current })
    kondigAan(tekst)
  }, [])

  const springNaarSectie = useCallback(
    async (sectie: string, naam?: string) => {
      const p = /-(A|B)$/.exec(sectie)?.[1] as PersoonId | undefined
      const { invoer, actief, kiesPersoon } = laatste.current
      if (p && p !== actief && invoer.personen.some((q) => q.id === p)) kiesPersoon(p)
      const el = await wachtOp(() => document.getElementById(sectie))
      if (!el) return false
      const kop = naarSectie(sectie)
      kondigAan(`Naar ${naam ?? kop ?? 'de sectie'}.`)
      return true
    },
    [],
  )

  const springNaar = useCallback(
    async (veld: VeldId, opties: SpringOpties = {}) => {
      const { invoer, actief, kiesPersoon, register = VELDREGISTER } = laatste.current
      const v = leesVeldId(veld)
      if (!v) return false
      if (v.persoon && v.persoon !== actief && invoer.personen.some((p) => p.id === v.persoon)) kiesPersoon(v.persoon)
      const info = vindVeld(veld, invoer, register)
      const el = await wachtOp(() => zoekVeld(veld))
      if (!el) {
        const sectie = info?.sectie ?? opties.sectie
        if (!sectie) return false
        // Alleen melden waar je nu staat als de sprong naar de sectie echt lukte; anders blijft de pagina staan.
        const gelukt = await springNaarSectie(sectie, info?.sectieNaam)
        // Staat het patroon in het register, dan bestond het veld en is het item weg; anders is het veld (nog) niet gemarkeerd.
        if (gelukt && vindItem(veld, register)) meld(`Dit veld bestaat niet meer. Je staat nu bij ${info?.sectieNaam ?? 'de sectie'}.`)
        else if (!gelukt) meld('Dit veld staat niet op deze pagina.')
        return false
      }
      if (openUitklappenBoven(el)) {
        await volgendFrame()
        await volgendFrame()
      }
      scrolEnFocus(el, { ring: true })
      const label = info?.label ?? opties.label ?? el.querySelector('label')?.textContent?.trim() ?? 'het veld'
      // Labels van ondernemingsvelden noemen de plek al ("Startjaar, Ontwerpstudio, Persoon A"): dan niet nog eens.
      kondigAan(`Naar ${label}${info?.waar && !label.includes(info.waar) ? `, ${info.waar}` : ''}.`)
      return true
    },
    [meld, springNaarSectie],
  )

  const openKiezer = useCallback(async (elementId: string, optie: string) => {
    const { invoer, actief, kiesPersoon } = laatste.current
    let el = document.getElementById(elementId)
    if (!el) {
      // De kiezer staat bij een onderneming van de persoon die nu niet gekozen is.
      for (const p of invoer.personen) {
        if (p.id === actief) continue
        kiesPersoon(p.id)
        el = await wachtOp(() => document.getElementById(elementId), 20)
        if (el) break
      }
    }
    if (!el) return false
    if (openUitklappenBoven(el)) await volgendFrame()
    el.scrollIntoView({ behavior: rustig() ? 'auto' : 'smooth', block: 'center' })
    el.dispatchEvent(new CustomEvent(OPEN_VERZOEK_UITKLAP, { detail: { optie } }))
    return true
  }, [])

  return { springNaar, springNaarSectie, openKiezer, melding, sluitMelding: () => setMelding(null) }
}
