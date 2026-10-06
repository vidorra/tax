import type { ReactNode } from 'react'
import type { Status } from '@/lib/tax/types'
import { cn } from './cn'
import { formatEuro } from './format'
import { StatusBadge } from './StatusBadge'

export interface ResultPanelProps {
  /** Wordt ook gebruikt als scrolldoel van de MobileResultBar. */
  id?: string
  titel?: ReactNode
  /** Extra in de kop, bijvoorbeeld een StatusBadge van het jaar. */
  kopExtra?: ReactNode
  /** Kondig wijzigingen aan voor schermlezers (live herberekening). */
  live?: boolean
  /** Sticky op desktop (standaard aan). */
  sticky?: boolean
  className?: string
  children?: ReactNode
}

/** Resultaatpaneel: sticky rechts op desktop, gewoon blok op mobiel. */
export function ResultPanel({ id = 'resultaat', titel, kopExtra, live = false, sticky = true, className, children }: ResultPanelProps) {
  const kopId = `${id}-titel`
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={titel ? kopId : undefined}
      aria-live={live ? 'polite' : undefined}
      className={cn(
        'scroll-mt-4 rounded-2xl border-2 border-primary/30 bg-white p-5 shadow-md outline-none sm:p-6',
        sticky && 'lg:sticky lg:top-6',
        className,
      )}
    >
      {(titel || kopExtra) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          {titel && (
            <h2 id={kopId} className="text-base font-medium text-gray-900">
              {titel}
            </h2>
          )}
          {kopExtra}
        </div>
      )}
      {children}
    </section>
  )
}

export interface ResultBedragProps {
  label: ReactNode
  bedrag: number | null
  toelichting?: ReactNode
  status?: Status
  /** Tekst als er nog geen bedrag is. */
  leegTekst?: ReactNode
  className?: string
}

/** Groot hoofdbedrag bovenin het resultaatpaneel. */
export function ResultBedrag({ label, bedrag, toelichting, status, leegTekst = 'Vul je gegevens in', className }: ResultBedragProps) {
  return (
    <div className={cn('text-center', className)}>
      <div className="mb-1 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
        {status && status !== 'definitief' && <StatusBadge status={status} klein />}
      </div>
      {bedrag === null ? (
        <div className="py-1 text-sm text-gray-500">{leegTekst}</div>
      ) : (
        <div className="text-4xl font-semibold leading-none tabular-nums text-primary">{formatEuro(bedrag)}</div>
      )}
      {toelichting && <p className="mt-2 text-xs text-gray-500">{toelichting}</p>}
    </div>
  )
}
