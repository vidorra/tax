'use client'

/**
 * Ronde 2 (A2): korte lijst bovenaan Planning met ankerlinks naar de secties die op de pagina staan. Een sectie die een
 * ander onderdeel alleen soms toont (Terugvragen in het buitenland, A5) staat er alleen als het element na het laden
 * op de pagina staat (`alleenAlsAanwezig`).
 */
import { useEffect, useState } from 'react'

export interface OpDezePaginaItem {
  id: string
  label: string
  alleenAlsAanwezig?: boolean
}

export function OpDezePagina({ items }: { items: OpDezePaginaItem[] }) {
  const [aanwezig, setAanwezig] = useState<ReadonlySet<string>>(() => new Set())
  const sleutel = items.map((i) => i.id).join('|')
  useEffect(() => {
    const gevonden = new Set(items.filter((i) => i.alleenAlsAanwezig && document.getElementById(i.id)).map((i) => i.id))
    setAanwezig(gevonden)
    // Alleen opnieuw kijken als de lijst verandert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel])
  const zichtbaar = items.filter((i) => !i.alleenAlsAanwezig || aanwezig.has(i.id))
  if (zichtbaar.length < 2) return null
  return (
    <nav aria-labelledby="op-deze-pagina-titel" className="rounded-2xl border border-gray-200 bg-white px-5 py-3 shadow-sm sm:px-6">
      <h2 id="op-deze-pagina-titel" className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Op deze pagina
      </h2>
      <ul className="mt-1 flex flex-wrap gap-x-5">
        {zichtbaar.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
