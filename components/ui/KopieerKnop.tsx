'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from './cn'
import { kondigAan } from './aankondig'

/**
 * Ronde 2: tekst die de kopieerknop op het klembord zet. Hele euro's als cijfers zonder euroteken en zonder
 * duizendtalpunt (het aangifteprogramma vraagt hele euro's; een punt kan daar verkeerd vallen): 15974, -1200.
 */
export function kopieerTekst(bedrag: number): string {
  return String(Math.round(bedrag) + 0)
}

export interface KopieerKnopProps {
  /** Bedrag in euro's; gekopieerd als hele euro's (zie kopieerTekst). */
  bedrag?: number
  /** Of een eigen tekst (bijvoorbeeld een datum of 'Ja'); gaat voor `bedrag`. */
  tekst?: string
  /** Waar het bedrag bij hoort, voor de toegankelijke naam: "Kopieer 15974, Loon Acme BV". */
  context: string
  /** Alleen het icoon (44 × 44), ook op brede schermen. Standaard: icoon op mobiel, icoon en tekst vanaf sm. */
  compact?: boolean
  className?: string
}

/**
 * Knop die een bedrag kopieert. Na een klik staat er 2 seconden "Gekopieerd" (alleen tekst en icoon wisselen, de knop
 * verspringt niet). Lukt het klembord niet (oude browser, geen https), dan staat het bedrag geselecteerd in een
 * alleen-lezen veld met uitleg.
 */
export function KopieerKnop({ bedrag, tekst, context, compact, className }: KopieerKnopProps) {
  const waarde = tekst ?? (bedrag !== undefined ? kopieerTekst(bedrag) : '')
  const [stand, setStand] = useState<'rust' | 'gekopieerd' | 'handmatig'>('rust')
  const [melding, setMelding] = useState('')
  const veld = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  useEffect(() => {
    if (stand === 'handmatig') veld.current?.select()
  }, [stand])

  async function kopieer() {
    if (!waarde) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('geen klembord')
      await navigator.clipboard.writeText(waarde)
      setStand('gekopieerd')
      setMelding(`${waarde} gekopieerd.`)
      kondigAan(`${waarde} gekopieerd.`)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setStand('rust')
        setMelding('')
      }, 2000)
    } catch {
      setStand('handmatig')
      setMelding('Automatisch kopiëren lukt hier niet. Het bedrag is geselecteerd: druk op Ctrl+C (Cmd+C op een Mac).')
      kondigAan('Automatisch kopiëren lukt hier niet. Het bedrag is geselecteerd: druk op Ctrl+C (Cmd+C op een Mac).')
    }
  }

  const klaar = stand === 'gekopieerd'
  return (
    <span className={cn('inline-flex flex-col items-end gap-1', className)}>
      <button
        type="button"
        onClick={() => void kopieer()}
        disabled={!waarde}
        aria-label={`Kopieer ${waarde}, ${context}`}
        className={cn(
          'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border px-2.5 text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          klaar ? 'border-primary/30 bg-primary/5 text-primary' : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary',
          !compact && 'sm:min-w-[7.5rem]',
        )}
      >
        {klaar ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
        {!compact && <span className="hidden sm:inline">{klaar ? 'Gekopieerd' : 'Kopieer'}</span>}
      </button>
      {stand === 'handmatig' && (
        <input
          ref={veld}
          readOnly
          value={waarde}
          aria-label={`${context}, om te kopiëren`}
          onBlur={() => setStand('rust')}
          className="w-32 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm tabular-nums"
        />
      )}
      {/* Zichtbare uitleg alleen als kopiëren niet lukt; schermlezers horen het via het gedeelde live-gebied (kondigAan). */}
      {stand === 'handmatig' && <span className="max-w-[16rem] text-right text-xs text-gray-600">{melding}</span>}
    </span>
  )
}
