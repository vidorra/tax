import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from './cn'

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  actief: boolean
  children?: ReactNode
  /** Kleine tweede regel onder het label. */
  beschrijving?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function chipKlassen(actief: boolean, extra?: string): string {
  return cn(
    'flex min-h-[44px] flex-col items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    actief ? 'border-primary bg-primary text-white hover:bg-primary-dark' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-primary hover:text-primary-dark',
    extra,
  )
}

/**
 * Keuzeknop. Losstaand gedraagt hij zich als aan/uit-knop (aria-pressed);
 * binnen een ChipGroup krijgt hij role="radio".
 */
export function Chip({ actief, children, beschrijving, className, role, ref, ...rest }: ChipProps) {
  return (
    <button
      ref={ref}
      type="button"
      role={role}
      aria-pressed={role ? undefined : actief}
      aria-checked={role === 'radio' ? actief : undefined}
      className={chipKlassen(actief, className)}
      {...rest}
    >
      {children}
      {beschrijving && <span className={cn('mt-0.5 text-[11px] font-normal', actief ? 'text-white' : 'text-gray-500')}>{beschrijving}</span>}
    </button>
  )
}
