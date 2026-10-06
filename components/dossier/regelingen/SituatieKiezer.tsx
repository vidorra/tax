'use client'

/**
 * Ronde 2: "Bijzondere situatie toevoegen". Een kale knop die eronder een korte lijst opent (inline, geen zwevend menu);
 * elke optie heeft één regel uitleg. Een gekozen situatie wordt bij de ouder een eigen blok (SituatieBlok) en hoort
 * dan niet meer in `opties`. Zonder opties verdwijnt de knop.
 *
 * Het zoekveld (RegelingZoeker) opent de lijst en zet de focus op een optie met het DOM-event OPEN_VERZOEK op het
 * element met `id`: `el.dispatchEvent(new CustomEvent(OPEN_VERZOEK, { detail: { optie: 'hir' } }))`. Er wordt nooit
 * ongevraagd iets toegevoegd.
 *
 * Na een keuze verdwijnt de optie; de ouder geeft het nieuwe SituatieBlok `focusBijTonen`, zodat de focus naar de kop
 * van dat blok gaat (ronde 2, na de toets).
 */
import { Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/components/ui'

/** DOM-event om een uitklap, kiezer of blok van buitenaf te openen (springen naar een veld, zoeken). */
export const OPEN_VERZOEK = 'ib:open'

export interface SituatieOptie {
  id: string
  label: string
  uitleg: string
}

export interface SituatieKiezerProps {
  opties: SituatieOptie[]
  onKies: (id: string) => void
  /** Stabiel id voor springen en zoeken, bijvoorbeeld 'situaties-A-0'. */
  id?: string
  label?: string
  className?: string
}

export function SituatieKiezer({ opties, onKies, id, label = 'Bijzondere situatie toevoegen', className }: SituatieKiezerProps) {
  const [open, setOpen] = useState(false)
  const lijstId = `${useId().replace(/:/g, '')}-situaties`
  const knop = useRef<HTMLButtonElement>(null)
  const lijst = useRef<HTMLUListElement>(null)
  const wortel = useRef<HTMLDivElement>(null)
  const [focusOptie, setFocusOptie] = useState<string | null>(null)

  useEffect(() => {
    const el = wortel.current
    if (!el) return
    const opVerzoek = (e: Event) => {
      const optie = (e as CustomEvent<{ optie?: string }>).detail?.optie
      setOpen(true)
      setFocusOptie(optie ?? opties[0]?.id ?? null)
    }
    el.addEventListener(OPEN_VERZOEK, opVerzoek)
    return () => el.removeEventListener(OPEN_VERZOEK, opVerzoek)
  }, [opties])

  useEffect(() => {
    if (!open) return
    const doel = focusOptie ? lijst.current?.querySelector<HTMLButtonElement>(`[data-optie="${CSS.escape(focusOptie)}"]`) : lijst.current?.querySelector<HTMLButtonElement>('button')
    doel?.focus()
  }, [open, focusOptie])

  if (opties.length === 0) return null

  function sluit() {
    setOpen(false)
    setFocusOptie(null)
    knop.current?.focus()
  }

  return (
    <div ref={wortel} id={id} className={className}>
      <button
        ref={knop}
        type="button"
        aria-expanded={open}
        aria-controls={lijstId}
        onClick={() => (open ? sluit() : setOpen(true))}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {label}
      </button>
      <ul
        ref={lijst}
        id={lijstId}
        hidden={!open}
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            sluit()
          }
        }}
        className={cn('mt-2 gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-2 sm:p-3', open ? 'grid' : 'hidden')}
      >
        {opties.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              data-optie={o.id}
              onClick={() => {
                setOpen(false)
                setFocusOptie(null)
                onKies(o.id)
              }}
              className={cn(
                'flex min-h-[44px] w-full flex-col items-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm transition-colors',
                'hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'sm:flex-row sm:items-baseline sm:gap-3',
              )}
            >
              <span className="font-medium text-gray-900 sm:w-64 sm:flex-shrink-0">{o.label}</span>
              <span className="text-xs text-gray-600">{o.uitleg}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
