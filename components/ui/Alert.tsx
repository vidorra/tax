import { CircleX, Info, ListChecks, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export type AlertVariant = 'info' | 'let-op' | 'actie' | 'fout'

const STIJL: Record<AlertVariant, { kader: string; icoon: string; titel: string; Icoon: typeof Info }> = {
  info: { kader: 'border-slate-200 bg-slate-50 text-slate-700', icoon: 'text-slate-500', titel: 'text-slate-900', Icoon: Info },
  'let-op': { kader: 'border-amber-200 bg-amber-50 text-amber-900', icoon: 'text-amber-600', titel: 'text-amber-900', Icoon: TriangleAlert },
  actie: { kader: 'border-primary/25 bg-primary/5 text-gray-800', icoon: 'text-primary', titel: 'text-gray-900', Icoon: ListChecks },
  /** Ronde 2: een echte fout (controles). Rood blijft voorbehouden aan fouten en verwijderen. */
  fout: { kader: 'border-red-200 bg-red-50 text-red-900', icoon: 'text-red-700', titel: 'text-red-900', Icoon: CircleX },
}

/** Verborgen voorvoegsel per niveau, zodat kleur nooit het enige signaal is. */
const VOORVOEGSEL: Partial<Record<AlertVariant, string>> = { fout: 'Fout: ', 'let-op': 'Let op: ' }

export interface AlertProps {
  /** info = achtergrond, let-op = waarschuwing (amber, alleen voor waarschuwingen), actie = iets om te doen, fout = moet worden opgelost (rood). */
  variant?: AlertVariant
  titel?: ReactNode
  children?: ReactNode
  /** Eigen icoon, of false voor geen icoon. */
  icoon?: ReactNode | false
  className?: string
  role?: 'note' | 'status' | 'alert'
}

export function Alert({ variant = 'info', titel, children, icoon, className, role = 'note' }: AlertProps) {
  const s = STIJL[variant]
  const Icoon = s.Icoon
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-2xl border p-4 text-sm leading-relaxed', s.kader, className)}>
      {icoon !== false && (
        <span aria-hidden="true" className={cn('mt-0.5 flex-shrink-0 [&>svg]:h-4 [&>svg]:w-4', s.icoon)}>
          {icoon ?? <Icoon />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {titel && (
          <p className={cn('mb-1 font-medium', s.titel)}>
            {VOORVOEGSEL[variant] && <span className="sr-only">{VOORVOEGSEL[variant]}</span>}
            {titel}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
