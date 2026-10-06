'use client'

/**
 * Ronde 2 (A3): de badge "1 fout" in de kop van een sectie (ux-ronde2.md 4.2), alleen in een streng jaar.
 *
 * De secties zijn van verschillende onderdelen; daarom zet deze component de badge van buitenaf in de kop: elke Section
 * met een `id` heeft een kop met id `${id}-titel`, en de controles noemen hun `sectie`. De badge komt via een portal in
 * die kop (na de titel), zodat hij ook in de toegankelijke naam van de sectie staat ("Ondernemingen, 1 fout").
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Controle } from '@/lib/controles/types'
import { aantalTekst } from './niveau'

/** Open fouten per sectie-id. */
export function foutenPerSectie(open: readonly Controle[]): Record<string, number> {
  const uit: Record<string, number> = {}
  for (const c of open) if (c.ernst === 'fout' && c.sectie) uit[c.sectie] = (uit[c.sectie] ?? 0) + 1
  return uit
}

export function SectieBadges({ open, streng }: { open: readonly Controle[]; streng: boolean }) {
  const per = useMemo(() => foutenPerSectie(open), [open])
  const [doelen, setDoelen] = useState<Record<string, HTMLElement>>({})

  // Na elke weergave: de koppen opzoeken (een sectie kan opnieuw zijn opgebouwd, bijvoorbeeld bij een andere persoon).
  // Bewust zonder lijst van afhankelijkheden; de vergelijking hieronder voorkomt een lus.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const nieuw: Record<string, HTMLElement> = {}
    if (streng) {
      for (const s of Object.keys(per)) {
        const el = document.getElementById(`${s}-titel`)
        if (el) nieuw[s] = el
      }
    }
    const gelijk = Object.keys(nieuw).length === Object.keys(doelen).length && Object.entries(nieuw).every(([s, el]) => doelen[s] === el)
    if (!gelijk) setDoelen(nieuw)
  })

  if (!streng) return null
  return (
    <>
      {Object.entries(doelen).map(([s, el]) =>
        per[s]
          ? createPortal(
              <span className="ml-2 inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 align-middle text-xs font-medium text-red-800">
                <span className="sr-only">, </span>
                {aantalTekst('fout', per[s])}
              </span>,
              el,
              s,
            )
          : null,
      )}
    </>
  )
}
