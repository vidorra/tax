import type { ReactNode } from 'react'
import { cn } from './cn'

export interface SectionProps {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Waarde rechts in de kop, bijvoorbeeld het bedrag van deze sectie. */
  value?: ReactNode
  /** Extra element in de kop (badge, knop). */
  actie?: ReactNode
  id?: string
  as?: 'h2' | 'h3'
  className?: string
  children?: ReactNode
}

/** Kaart met icoon, titel, ondertitel en optioneel een waarde rechts. */
export function Section({ icon, title, subtitle, value, actie, id, as: Kop = 'h2', className, children }: SectionProps) {
  const kopId = id ? `${id}-titel` : undefined
  return (
    <section id={id} aria-labelledby={kopId} className={cn('bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6', className)}>
      <div className={cn('flex items-start justify-between gap-3', children ? 'mb-4' : undefined)}>
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <div aria-hidden="true" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:h-5 [&>svg]:w-5">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <Kop id={kopId} className="text-base font-medium leading-snug text-gray-900">
              {title}
            </Kop>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {(value !== undefined && value !== null && value !== '') || actie ? (
          <div className="flex flex-shrink-0 items-center gap-2">
            {actie}
            {value !== undefined && value !== null && value !== '' && (
              <span className="whitespace-nowrap text-lg font-semibold tabular-nums text-primary sm:text-xl">{value}</span>
            )}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  )
}
