'use client'

import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'
import { formatEuro } from './format'

export interface MobileResultBarProps {
  label: ReactNode
  bedrag: number | null
  /** Kleine tweede regel, bijvoorbeeld "Zvw € 2.140". */
  toelichting?: ReactNode
  /** id van het element waar de knop naartoe scrolt (meestal het ResultPanel). */
  doelId?: string
  knopLabel?: string
  leegTekst?: ReactNode
  /** Ronde 2: iets anders dan een bedrag als hoofdwaarde, bijvoorbeeld de voortgang "18 van 42". Gaat voor `bedrag`. */
  waarde?: ReactNode
  /** Ronde 2: extra knop links (bijvoorbeeld "2 fouten open"), minimaal 44 px hoog. */
  links?: ReactNode
  className?: string
}

/**
 * Vaste balk onderin op mobiel met het hoofdbedrag en een knop naar de
 * berekening. Rendert ook een lege ruimte in de flow, zodat de balk geen
 * inhoud afdekt. Verborgen vanaf lg. Via data-mobiele-balk zorgt globals.css
 * dat de footer en een veld met focus niet onder de balk verdwijnen.
 */
export function MobileResultBar({
  label,
  bedrag,
  toelichting,
  doelId = 'resultaat',
  knopLabel = 'Bekijk berekening',
  leegTekst = 'Vul je gegevens in voor een uitkomst',
  waarde,
  links,
  className,
}: MobileResultBarProps) {
  function naarResultaat() {
    const doel = document.getElementById(doelId)
    if (!doel) return
    const rustig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    doel.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' })
    if (doel.hasAttribute('tabindex')) doel.focus({ preventScroll: true })
  }

  return (
    <>
      <div aria-hidden="true" className="h-28 lg:hidden" />
      <div data-mobiele-balk="" className={cn('pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden', className)}>
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border-2 border-primary/30 bg-white p-3 pl-4 shadow-[0_-6px_28px_rgba(0,0,0,0.16)]">
          {links && <div className="flex-shrink-0">{links}</div>}
          <div className="min-w-0 flex-1" aria-live="polite">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
            {waarde !== undefined && waarde !== null ? (
              <div className="text-xl font-semibold leading-tight tabular-nums text-primary">{waarde}</div>
            ) : bedrag === null ? (
              <div className="text-sm text-gray-600">{leegTekst}</div>
            ) : (
              <div className="text-xl font-semibold leading-tight tabular-nums text-primary">{formatEuro(bedrag)}</div>
            )}
            {toelichting && <div className="truncate text-[11px] text-gray-600">{toelichting}</div>}
          </div>
          <button
            type="button"
            onClick={naarResultaat}
            className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {knopLabel}
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  )
}
