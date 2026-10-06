'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'
import { Field, INVOER_KLASSE, beschrijvingIds, invoerRand, veldIds } from '@/components/ui/Field'
import { cn } from '@/components/ui/cn'

export interface DatumVeldProps {
  label: ReactNode
  /** ISO-datum 'YYYY-MM-DD' of '' als leeg. */
  value: string
  onChange: (iso: string) => void
  hint?: ReactNode
  error?: ReactNode
  min?: string
  max?: string
  wrapperClassName?: string
}

/** Datumveld met de native datumkiezer; geeft een ISO-datum terug. */
export function DatumVeld({ label, value, onChange, hint, error, min, max, wrapperClassName }: DatumVeldProps) {
  const ids = veldIds(`datum-${useId().replace(/:/g, '')}`)
  return (
    <Field ids={ids} label={label} hint={hint} error={error} className={wrapperClassName}>
      <input
        id={ids.invoer}
        type="date"
        value={value}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={beschrijvingIds(ids, hint, error)}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INVOER_KLASSE, invoerRand(Boolean(error)), 'min-h-[44px] px-3.5')}
      />
    </Field>
  )
}

/** Geldige ISO-datum? */
export const isIsoDatum = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
