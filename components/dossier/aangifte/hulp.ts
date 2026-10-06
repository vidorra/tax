/**
 * Ronde 2 (A1): kleine hulpjes voor de componenten van de invulhulp (geen React-componenten).
 */
import type { InvulhulpKolom, Scherm } from '@/lib/invulhulp/types'
import type { Controle } from '@/lib/controles/types'
import { leesVeldId } from '@/lib/dossier/veld'

export const KOLOM_LABEL: Record<InvulhulpKolom, string> = {
  begin: 'Begin boekjaar',
  eind: 'Einde boekjaar',
  kosten: 'Kosten van aanschaf',
  restwaarde: 'Restwaarde',
  nominaal: 'Nominale waarde',
}

/** Id van de kop van een scherm (focus bij Volgende onderdeel en in de lijst Onderdelen). */
export const kopId = (sleutel: string) => `${sleutel}-titel`

/** Scrolt naar een element en zet de focus erop (of op het eerste focusbare element erin). */
export function gaNaar(id: string, focusId?: string): boolean {
  const doel = document.getElementById(id)
  if (!doel) return false
  const rustig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  doel.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' })
  const focus = (focusId ? document.getElementById(focusId) : null) ?? doel
  if (focus instanceof HTMLElement) {
    if (!focus.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(focus.tagName)) focus.setAttribute('tabindex', '-1')
    focus.focus({ preventScroll: true })
  }
  return true
}

/** Het item-voorvoegsel van een veld-id ("persoon:A/onderneming:ond-1/"), om een controle bij een scherm te vinden. */
function itemVoorvoegsel(veld: string): string | null {
  const l = leesVeldId(veld)
  if (!l) return null
  const delen = veld.split('/')
  // Tot en met het laatste segment met een sleutel (persoon:A, onderneming:ond-1, loon:loon-2, positie:x).
  let laatste = -1
  l.segmenten.forEach((s, i) => {
    if (s.sleutel !== undefined && s.naam !== 'persoon') laatste = i
  })
  return laatste < 0 ? null : `${delen.slice(0, laatste + 1).join('/')}/`
}

/** Hoort deze (open) fout bij dit scherm? Op de rij (invulhulpsleutel) of op een veld van hetzelfde item. */
export function foutBijScherm(scherm: Scherm, c: Controle): boolean {
  if (c.invulhulpSleutel?.startsWith(`${scherm.sleutel}/`)) return true
  if (!c.veld) return false
  const velden = scherm.rubrieken.flatMap((r) => r.velden.map((v) => v.herkomst?.veld).filter((v): v is string => Boolean(v)))
  if (velden.includes(c.veld)) return true
  const voor = itemVoorvoegsel(c.veld)
  return voor !== null && velden.some((v) => v.startsWith(voor))
}
