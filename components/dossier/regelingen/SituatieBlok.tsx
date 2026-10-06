'use client'

/**
 * Ronde 2: blok voor een gekozen bijzondere situatie, met kop en Weghalen. Met ingevulde bedragen vraagt Weghalen
 * inline om bevestiging. De ouder bewaart wat er weg ging en toont daarna OngedaanMelding.
 */
import { Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, cn, knopKlassen } from '@/components/ui'
import { OPEN_VERZOEK } from './SituatieKiezer'

export interface SituatieBlokProps {
  /** Kop, bijvoorbeeld "Gestopt, verkocht of omgezet in 2025". */
  titel: ReactNode
  /** Naam van de situatie in de bevestiging ("Weghalen? De bedragen bij {situatie} verdwijnen uit dit jaar."). */
  situatie: string
  onWeghalen: () => void
  /** Er staan bedragen in: dan eerst bevestigen. */
  heeftBedragen: boolean
  /** Stabiel id voor springen (bijvoorbeeld 'staking-A-0'). */
  id?: string
  /** Rechts in de kop, bijvoorbeeld een bedrag of een StatusBadge. */
  rechts?: ReactNode
  /**
   * Ronde 2 (na de toets): focus op de kop zodra het blok verschijnt. De ouder zet dit voor het blok dat net via de
   * SituatieKiezer is gekozen (de gekozen optie verdwijnt uit de lijst, dus anders gaat de focus nergens heen).
   */
  focusBijTonen?: boolean
  className?: string
  children: ReactNode
}

export function SituatieBlok({ titel, situatie, onWeghalen, heeftBedragen, id, rechts, focusBijTonen, className, children }: SituatieBlokProps) {
  const [bevestig, setBevestig] = useState(false)
  const annuleer = useRef<HTMLButtonElement>(null)
  const wortel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bevestig) annuleer.current?.focus()
  }, [bevestig])

  useEffect(() => {
    if (focusBijTonen) wortel.current?.querySelector<HTMLElement>('[data-situatie-kop]')?.focus()
    // Alleen bij het verschijnen van het blok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Springen naar dit blok: de kop in beeld en focus (het blok zelf heeft geen uitklap).
  useEffect(() => {
    const el = wortel.current
    if (!el) return
    const opVerzoek = () => el.querySelector<HTMLElement>('[data-situatie-kop]')?.focus()
    el.addEventListener(OPEN_VERZOEK, opVerzoek)
    return () => el.removeEventListener(OPEN_VERZOEK, opVerzoek)
  }, [])

  return (
    <div ref={wortel} id={id} className={cn('rounded-xl border border-gray-200 bg-gray-50/60 p-4', className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h4 data-situatie-kop="" tabIndex={-1} className="min-w-0 text-sm font-medium text-gray-900 focus:outline-none">
          {titel}
        </h4>
        <div className="flex flex-shrink-0 items-center gap-2">
          {rechts}
          <button
            type="button"
            onClick={() => (heeftBedragen ? setBevestig(true) : onWeghalen())}
            aria-expanded={heeftBedragen ? bevestig : undefined}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Weghalen<span className="sr-only"> {situatie}</span>
          </button>
        </div>
      </div>
      {bevestig && (
        <div role="group" aria-label={`${situatie} weghalen`} className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>Weghalen? De bedragen bij {situatie} verdwijnen uit dit jaar.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button grootte="sm" className="bg-red-700 hover:bg-red-800" onClick={onWeghalen}>
              Weghalen
            </Button>
            <button ref={annuleer} type="button" className={knopKlassen('secundair', 'sm')} onClick={() => setBevestig(false)}>
              Annuleren
            </button>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

/** Melding na weghalen of importeren, met Ongedaan maken. */
export function OngedaanMelding({ tekst, onOngedaan, onSluit, className }: { tekst: ReactNode; onOngedaan: () => void; onSluit: () => void; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700', className)}>
      <span className="min-w-0 flex-1">{tekst}</span>
      <button type="button" onClick={onOngedaan} className="inline-flex min-h-[44px] items-center gap-1 font-medium text-primary transition-colors hover:text-primary-dark">
        <Undo2 aria-hidden="true" className="h-4 w-4" />
        Ongedaan maken
      </button>
      <button type="button" onClick={onSluit} aria-label="Melding sluiten" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-gray-800">
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
