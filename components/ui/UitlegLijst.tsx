import { ExternalLink } from 'lucide-react'
import type { Uitlegregel } from '@/lib/tax/types'
import { cn } from './cn'
import { formatEuro } from './format'
import { StatusBadge } from './StatusBadge'

export interface UitlegLijstProps {
  regels: ReadonlyArray<Uitlegregel>
  /** Toon de formule met de echte getallen onder het label. */
  toonFormule?: boolean
  /** Toon het parameterpad (bijv. ondernemer.mkbWinstvrijstelling). */
  toonParameter?: boolean
  legeTekst?: string
  /** Eigen uitleg bij de status van een regel (bijvoorbeeld een geschat percentage belastingrente); anders de standaard. */
  statusUitleg?: (r: Uitlegregel) => string | undefined
  className?: string
  'aria-label'?: string
}

const INSPRING: Record<Uitlegregel['niveau'], string> = {
  0: '',
  1: 'pl-4 sm:pl-6',
  2: 'pl-8 sm:pl-12',
}

function bedragTekst(r: Uitlegregel): string | null {
  if (r.soort === 'info' && r.bedrag === 0) return null
  if (r.soort === 'min') return r.bedrag === 0 ? formatEuro(0) : formatEuro(-Math.abs(r.bedrag))
  if (r.soort === 'plus') return formatEuro(Math.abs(r.bedrag), { teken: r.bedrag !== 0 })
  return formatEuro(r.bedrag)
}

/**
 * Uitlegregels in de opbouw van een fiscaal rapport: inspringing per niveau,
 * subtotalen en totalen met een lijn, formule en parameter als grijze regel.
 */
export function UitlegLijst({ regels, toonFormule = true, toonParameter = true, legeTekst = 'Nog geen berekening.', statusUitleg, className, ...rest }: UitlegLijstProps) {
  if (regels.length === 0) {
    return <p className={cn('text-sm text-gray-500', className)}>{legeTekst}</p>
  }
  return (
    <ol className={cn('text-sm', className)} {...rest}>
      {regels.map((r, i) => {
        const bedrag = bedragTekst(r)
        const toonExtra = (toonFormule && r.formule) || (toonParameter && r.parameter)
        return (
          <li
            key={`${r.id}-${i}`}
            className={cn(
              'py-2',
              INSPRING[r.niveau],
              r.soort === 'subtotaal' && 'border-t border-gray-200',
              r.soort === 'totaal' && 'mt-1 border-t-2 border-gray-800',
              i > 0 && r.soort !== 'subtotaal' && r.soort !== 'totaal' && 'border-t border-gray-100',
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span
                  className={cn(
                    r.niveau === 0 && 'font-medium text-gray-900',
                    r.niveau === 1 && 'text-gray-800',
                    r.niveau === 2 && 'text-gray-600',
                    r.soort === 'subtotaal' && 'font-medium text-gray-900',
                    r.soort === 'totaal' && 'font-semibold text-gray-900',
                    r.soort === 'info' && 'text-gray-500',
                  )}
                >
                  {r.label}
                </span>
                {r.status && r.status !== 'definitief' && (
                  <span className="ml-2 inline-flex align-middle">
                    <StatusBadge status={r.status} klein tooltipKant="links" uitleg={statusUitleg?.(r)} />
                  </span>
                )}
              </div>
              {bedrag !== null && (
                <span
                  className={cn(
                    'whitespace-nowrap text-right tabular-nums',
                    r.soort === 'totaal' ? 'font-semibold text-gray-900' : r.soort === 'subtotaal' ? 'font-medium text-gray-900' : 'text-gray-800',
                    r.soort === 'info' && 'text-gray-500',
                  )}
                >
                  {bedrag}
                </span>
              )}
            </div>
            {(toonExtra || r.bron?.url) && (
              <p className="mt-0.5 break-words text-xs leading-relaxed text-gray-500">
                {toonFormule && r.formule && <span className="tabular-nums">{r.formule}</span>}
                {toonFormule && r.formule && toonParameter && r.parameter && <span aria-hidden="true"> · </span>}
                {toonParameter && r.parameter && (
                  <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] text-gray-600">{r.parameter}</code>
                )}
                {r.bron?.url && (
                  <>
                    {toonExtra && <span aria-hidden="true"> · </span>}
                    <a
                      href={r.bron.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:text-primary-dark hover:underline"
                    >
                      bron<span className="sr-only">: {r.bron.titel} (opent in nieuw venster)</span>
                      <ExternalLink aria-hidden="true" className="h-3 w-3" />
                    </a>
                  </>
                )}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
