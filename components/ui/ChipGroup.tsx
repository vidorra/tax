'use client'

import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Chip } from './Chip'
import { cn } from './cn'

export interface ChipOptie<T extends string | number> {
  value: T
  label: ReactNode
  beschrijving?: ReactNode
  disabled?: boolean
  /** Toegankelijke naam als het label geen tekst is. */
  ariaLabel?: string
}

export interface ChipGroupProps<T extends string | number> {
  label: ReactNode
  options: ReadonlyArray<ChipOptie<T>>
  value: T | null
  onChange: (waarde: T) => void
  /** Vast aantal kolommen; zonder waarde lopen de chips door (flex-wrap). */
  kolommen?: 2 | 3 | 4 | 5 | 6
  labelVerborgen?: boolean
  hint?: ReactNode
  /** Eigen inhoud per chip, bijvoorbeeld met een badge. */
  render?: (optie: ChipOptie<T>, actief: boolean) => ReactNode
  className?: string
}

const KOLOMMEN: Record<NonNullable<ChipGroupProps<string>['kolommen']>, string> = {
  2: 'grid grid-cols-2',
  3: 'grid grid-cols-3',
  4: 'grid grid-cols-2 min-[400px]:grid-cols-4',
  5: 'grid grid-cols-3 min-[400px]:grid-cols-5',
  6: 'grid grid-cols-3 sm:grid-cols-6',
}

/** Enkele keuze uit chips (radiogroep met pijltjestoetsen). */
export function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  kolommen,
  labelVerborgen,
  hint,
  render,
  className,
}: ChipGroupProps<T>) {
  const basis = useId().replace(/:/g, '')
  const labelId = `chips-${basis}`
  const hintId = hint ? `${labelId}-hint` : undefined
  const knoppen = useRef<Array<HTMLButtonElement | null>>([])
  const gekozenIndex = options.findIndex((o) => o.value === value)
  const focusIndex = gekozenIndex >= 0 ? gekozenIndex : options.findIndex((o) => !o.disabled)

  function verplaats(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const stap = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    let doel = -1
    if (stap !== 0) {
      for (let i = 1; i <= options.length; i++) {
        const k = (index + stap * i + options.length) % options.length
        if (!options[k].disabled) {
          doel = k
          break
        }
      }
    } else if (e.key === 'Home') {
      doel = options.findIndex((o) => !o.disabled)
    } else if (e.key === 'End') {
      for (let k = options.length - 1; k >= 0; k--) if (!options[k].disabled) { doel = k; break }
    }
    if (doel >= 0) {
      e.preventDefault()
      onChange(options[doel].value)
      knoppen.current[doel]?.focus()
    }
  }

  return (
    <div className={className}>
      <div id={labelId} className={cn('mb-2 block text-sm font-medium text-gray-700', labelVerborgen && 'sr-only')}>
        {label}
      </div>
      <div role="radiogroup" aria-labelledby={labelId} aria-describedby={hintId} className={cn('gap-2', kolommen ? KOLOMMEN[kolommen] : 'flex flex-wrap')}>
        {options.map((o, i) => {
          const actief = o.value === value
          return (
            <Chip
              key={String(o.value)}
              ref={(el) => {
                knoppen.current[i] = el
              }}
              role="radio"
              actief={actief}
              disabled={o.disabled}
              aria-label={o.ariaLabel}
              tabIndex={i === focusIndex ? 0 : -1}
              beschrijving={render ? undefined : o.beschrijving}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => verplaats(e, i)}
              className={kolommen ? undefined : 'min-w-[3.5rem]'}
            >
              {render ? render(o, actief) : o.label}
            </Chip>
          )
        })}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-gray-500">
          {hint}
        </p>
      )}
    </div>
  )
}
