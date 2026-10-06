import type { ReactNode } from 'react'
import { cn } from './cn'

export interface PageHeaderProps {
  titel: ReactNode
  intro?: ReactNode
  /** Klein label boven de titel, bijvoorbeeld "Kennisbank". */
  kicker?: ReactNode
  /** Rechts van of onder de kicker, bijvoorbeeld een StatusBadge. */
  badge?: ReactNode
  uitlijning?: 'links' | 'midden'
  className?: string
}

export function PageHeader({ titel, intro, kicker, badge, uitlijning = 'links', className }: PageHeaderProps) {
  const midden = uitlijning === 'midden'
  return (
    <header className={cn('mb-6 sm:mb-8', midden && 'text-center', className)}>
      {(kicker || badge) && (
        <div className={cn('mb-2 flex flex-wrap items-center gap-2', midden && 'justify-center')}>
          {kicker && <span className="text-xs font-medium uppercase tracking-wide text-primary">{kicker}</span>}
          {badge}
        </div>
      )}
      <h1 className="text-2xl font-semibold leading-tight text-gray-900 sm:text-3xl">{titel}</h1>
      {intro && <div className={cn('mt-3 text-base leading-relaxed text-gray-600', midden && 'mx-auto max-w-2xl')}>{intro}</div>}
    </header>
  )
}
