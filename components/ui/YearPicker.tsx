'use client'

import type { ReactNode } from 'react'
import type { Status } from '@/lib/tax/types'
import { ChipGroup } from './ChipGroup'
import { StatusBadge, STATUS_INFO } from './StatusBadge'

export interface JaarOptie {
  jaar: number
  status: Status
  disabled?: boolean
}

export interface YearPickerProps {
  jaren: ReadonlyArray<JaarOptie>
  value: number
  onChange: (jaar: number) => void
  label?: ReactNode
  labelVerborgen?: boolean
  hint?: ReactNode
  className?: string
}

/** Jaarkeuze met chips en per jaar de status van de parameters. */
export function YearPicker({ jaren, value, onChange, label = 'Belastingjaar', labelVerborgen, hint, className }: YearPickerProps) {
  return (
    <ChipGroup<number>
      label={label}
      labelVerborgen={labelVerborgen}
      hint={hint}
      className={className}
      value={value}
      onChange={onChange}
      options={jaren.map((j) => ({
        value: j.jaar,
        label: String(j.jaar),
        disabled: j.disabled,
        ariaLabel: `${j.jaar}, ${STATUS_INFO[j.status].label.toLowerCase()}`,
      }))}
      render={(optie, actief) => {
        const j = jaren.find((x) => x.jaar === optie.value)
        return (
          <span className="flex flex-col items-center gap-1">
            <span className="tabular-nums">{optie.label}</span>
            {j && <StatusBadge status={j.status} tooltip={false} klein opDonker={actief} />}
          </span>
        )
      }}
    />
  )
}
