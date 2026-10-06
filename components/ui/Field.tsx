import type { ReactNode } from 'react'
import { cn } from './cn'

export interface VeldIds {
  invoer: string
  hint: string
  fout: string
}

export function veldIds(basis: string): VeldIds {
  return { invoer: basis, hint: `${basis}-hint`, fout: `${basis}-fout` }
}

/** aria-describedby voor een veld met optionele hint en fout. */
export function beschrijvingIds(ids: VeldIds, hint?: ReactNode, fout?: ReactNode): string | undefined {
  const delen = [hint ? ids.hint : null, fout ? ids.fout : null].filter(Boolean)
  return delen.length ? delen.join(' ') : undefined
}

export interface FieldProps {
  ids: VeldIds
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  labelVerborgen?: boolean
  verplicht?: boolean
  className?: string
  children: ReactNode
}

/** Label, hint en foutmelding rond een invoerelement. */
export function Field({ ids, label, hint, error, labelVerborgen, verplicht, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={ids.invoer} className={cn('mb-1.5 block text-sm font-medium text-gray-700', labelVerborgen && 'sr-only')}>
        {label}
        {verplicht && (
          <span className="text-gray-400" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={ids.hint} className="mt-1.5 text-xs leading-relaxed text-gray-500">
          {hint}
        </p>
      )}
      {hint && error && (
        <p id={ids.hint} className="sr-only">
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.fout} className="mt-1.5 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export const INVOER_KLASSE =
  'w-full rounded-xl border bg-white py-2.5 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm'

export function invoerRand(fout: boolean): string {
  return fout ? 'border-red-400' : 'border-gray-200 hover:border-gray-300'
}
