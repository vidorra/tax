import type { Ernst, Waarschuwing } from '@/lib/tax/types'
import { Alert } from './Alert'
import { cn } from './cn'

export interface WaarschuwingLijstProps {
  waarschuwingen: ReadonlyArray<Waarschuwing>
  /** Sorteer op ernst: eerst let op, dan actie, dan info. */
  sorteer?: boolean
  className?: string
}

const VOLGORDE: Record<Ernst, number> = { 'let-op': 0, actie: 1, info: 2 }

const TITEL: Record<Ernst, string> = { 'let-op': 'Let op', actie: 'Te doen', info: 'Goed om te weten' }

export function WaarschuwingLijst({ waarschuwingen, sorteer = true, className }: WaarschuwingLijstProps) {
  if (waarschuwingen.length === 0) return null
  const lijst = sorteer ? [...waarschuwingen].sort((a, b) => VOLGORDE[a.ernst] - VOLGORDE[b.ernst]) : waarschuwingen
  return (
    <ul className={cn('space-y-2', className)} aria-label="Meldingen bij deze berekening">
      {lijst.map((w) => (
        <li key={w.id}>
          <Alert variant={w.ernst}>
            <span className="sr-only">{TITEL[w.ernst]}: </span>
            {w.tekst}
            {w.bron?.url && (
              <>
                {' '}
                <a href={w.bron.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2 hover:text-primary-dark">
                  Bron<span className="sr-only">: {w.bron.titel} (opent in nieuw venster)</span>
                </a>
              </>
            )}
          </Alert>
        </li>
      ))}
    </ul>
  )
}
