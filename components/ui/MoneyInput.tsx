'use client'

import type { ReactNode } from 'react'
import { NumberInput } from './NumberInput'
import type { NumberInputProps } from './NumberInput'

export interface MoneyInputProps extends Omit<NumberInputProps, 'prefix' | 'groeperen' | 'label'> {
  label: ReactNode
  /** Standaard hele euro's, zoals in de aangifte. */
  decimalen?: number
}

/** Bedragveld met euroteken en duizendtallen (12.345) tijdens het typen. Geeft een number of null terug. */
export function MoneyInput({ label, decimalen = 0, min, negatief = false, ...rest }: MoneyInputProps) {
  return (
    <NumberInput
      {...rest}
      label={
        <>
          {label}
          <span className="sr-only"> (in euro)</span>
        </>
      }
      prefix="€"
      groeperen
      decimalen={decimalen}
      negatief={negatief}
      min={min ?? (negatief ? undefined : 0)}
    />
  )
}
