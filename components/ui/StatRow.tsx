import type { ReactNode } from 'react'
import type { Status } from '@/lib/tax/types'
import { cn } from './cn'
import { formatEuro } from './format'
import { StatusBadge } from './StatusBadge'

export type StatRowVariant = 'standaard' | 'plus' | 'min' | 'subtotaal' | 'totaal'

export interface StatRowProps {
  label: ReactNode
  /** Bedrag in euro's, of een eigen weergave (bijvoorbeeld een percentage). */
  bedrag: number | string | null
  variant?: StatRowVariant
  /** Kleine tweede regel onder het label. */
  toelichting?: ReactNode
  status?: Status
  /** Eigen uitleg bij de status (tooltip en schermlezer), in plaats van de standaarduitleg. */
  statusUitleg?: string
  /** Groot en in de merkkleur, voor het hoofdbedrag. */
  nadruk?: boolean
  className?: string
}

function weergave(bedrag: StatRowProps['bedrag'], variant: StatRowVariant): string {
  if (bedrag === null) return '–'
  if (typeof bedrag === 'string') return bedrag
  if (variant === 'plus') return formatEuro(Math.abs(bedrag), { teken: true })
  if (variant === 'min') return Math.abs(bedrag) === 0 ? formatEuro(0) : formatEuro(-Math.abs(bedrag))
  return formatEuro(bedrag)
}

/**
 * Regel met label links en bedrag rechts. Gebruik binnen een StatLijst (dl).
 * plus en min tonen het teken; het bedrag zelf mag positief worden aangeleverd.
 */
export function StatRow({ label, bedrag, variant = 'standaard', toelichting, status, statusUitleg, nadruk, className }: StatRowProps) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 py-2',
        variant === 'subtotaal' && 'border-t border-gray-200 font-medium text-gray-900',
        variant === 'totaal' && 'mt-1 border-t-2 border-gray-300 pt-3 font-semibold text-gray-900',
        className,
      )}
    >
      <dt className="min-w-0 text-sm text-gray-700">
        <span className={cn(variant === 'totaal' && 'text-gray-900')}>{label}</span>
        {status && status !== 'definitief' && (
          <span className="ml-2 inline-flex">
            <StatusBadge status={status} klein tooltipKant="links" uitleg={statusUitleg} />
          </span>
        )}
        {toelichting && <span className="mt-0.5 block text-xs font-normal text-gray-500">{toelichting}</span>}
      </dt>
      <dd
        className={cn(
          'whitespace-nowrap text-right tabular-nums',
          nadruk ? 'text-xl font-semibold text-primary' : 'text-sm',
          !nadruk && variant === 'min' && 'text-gray-700',
          !nadruk && variant === 'plus' && 'text-gray-900',
          !nadruk && (variant === 'totaal' || variant === 'subtotaal') && 'text-gray-900',
        )}
      >
        {weergave(bedrag, variant)}
      </dd>
    </div>
  )
}

export interface StatLijstProps {
  children?: ReactNode
  className?: string
  'aria-label'?: string
}

export function StatLijst({ children, className, ...rest }: StatLijstProps) {
  return (
    <dl className={cn('divide-y divide-gray-100', className)} {...rest}>
      {children}
    </dl>
  )
}
