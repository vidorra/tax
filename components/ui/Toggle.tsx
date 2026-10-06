'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface ToggleProps {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (aan: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
}

/** Schakelaar met label en optionele toelichting (role="switch"). */
export function Toggle({ label, description, checked, onChange, disabled, id, className }: ToggleProps) {
  const autoId = useId().replace(/:/g, '')
  const knopId = id ?? `toggle-${autoId}`
  const beschrijvingId = `${knopId}-uitleg`
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label htmlFor={knopId} className={cn('block text-sm font-medium text-gray-800', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
          {label}
        </label>
        {description && (
          <p id={beschrijvingId} className="mt-0.5 text-xs leading-relaxed text-gray-500">
            {description}
          </p>
        )}
      </div>
      <button
        id={knopId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? beschrijvingId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors before:absolute before:-inset-x-0.5 before:-inset-y-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary hover:bg-primary-dark' : 'bg-gray-300 hover:bg-gray-400',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-[margin]', checked ? 'ml-6' : 'ml-0.5')}
        />
      </button>
    </div>
  )
}
