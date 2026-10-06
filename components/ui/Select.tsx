'use client'

import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from './cn'
import { Field, INVOER_KLASSE, beschrijvingIds, invoerRand, veldIds } from './Field'

export interface SelectOptie<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  label: ReactNode
  options: ReadonlyArray<SelectOptie<T>>
  value: T | ''
  onChange: (waarde: T) => void
  hint?: ReactNode
  error?: ReactNode
  /** Lege eerste optie, bijvoorbeeld "Kies een soort". */
  placeholder?: string
  labelVerborgen?: boolean
  verplicht?: boolean
  wrapperClassName?: string
}

export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
  error,
  placeholder,
  labelVerborgen,
  verplicht,
  wrapperClassName,
  id,
  className,
  ...rest
}: SelectProps<T>) {
  const autoId = useId().replace(/:/g, '')
  const ids = veldIds(id ?? `keuze-${autoId}`)
  return (
    <Field ids={ids} label={label} hint={hint} error={error} labelVerborgen={labelVerborgen} verplicht={verplicht} className={wrapperClassName}>
      <div className="relative">
        <select
          {...rest}
          id={ids.invoer}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={beschrijvingIds(ids, hint, error)}
          aria-required={verplicht || undefined}
          onChange={(e) => onChange(e.target.value as T)}
          className={cn(INVOER_KLASSE, invoerRand(Boolean(error)), 'appearance-none pl-3.5 pr-10', className)}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      </div>
    </Field>
  )
}
