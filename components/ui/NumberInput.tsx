'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { Field, INVOER_KLASSE, beschrijvingIds, invoerRand, veldIds } from './Field'
import { cursorNaFormat, formatTijdensTypen, formatVoorInvoer } from './format'

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'prefix' | 'min' | 'max' | 'inputMode'
>

export interface NumberInputProps extends NativeProps {
  label: ReactNode
  value: number | null
  onChange: (waarde: number | null) => void
  hint?: ReactNode
  error?: ReactNode
  /** Vóór het getal in het veld, bijvoorbeeld '€'. */
  prefix?: ReactNode
  /** Achter het getal in het veld, bijvoorbeeld 'uur' of '%'. */
  suffix?: ReactNode
  /** Aantal toegestane decimalen (komma). Standaard 0. */
  decimalen?: number
  /** Duizendtallen scheiden met een punt tijdens het typen. */
  groeperen?: boolean
  /** Negatieve getallen toestaan (minteken vooraan). */
  negatief?: boolean
  /** Bij het verlaten van het veld begrenzen op min en max. */
  min?: number
  max?: number
  labelVerborgen?: boolean
  verplicht?: boolean
  wrapperClassName?: string
}

/**
 * Getalveld met Nederlandse notatie (komma als decimaalteken). Geeft een
 * number terug, of null als het veld leeg is.
 */
export function NumberInput({
  label,
  value,
  onChange,
  hint,
  error,
  prefix,
  suffix,
  decimalen = 0,
  groeperen = false,
  negatief = false,
  min,
  max,
  labelVerborgen,
  verplicht,
  wrapperClassName,
  id,
  className,
  onBlur,
  ...rest
}: NumberInputProps) {
  const autoId = useId()
  const ids = veldIds(id ?? `getal-${autoId.replace(/:/g, '')}`)
  const opties = { decimalen, groeperen, negatief }
  const [tekst, setTekst] = useState(() => formatVoorInvoer(value, opties))
  const invoerRef = useRef<HTMLInputElement>(null)
  const cursorRef = useRef<number | null>(null)

  // Externe wijziging van value: alleen overnemen als die afwijkt van wat er staat.
  useEffect(() => {
    const huidig = formatTijdensTypen(tekst, opties).getal
    if (huidig !== value) setTekst(formatVoorInvoer(value, opties))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimalen, groeperen, negatief])

  useLayoutEffect(() => {
    const el = invoerRef.current
    if (el && cursorRef.current !== null && document.activeElement === el) {
      el.setSelectionRange(cursorRef.current, cursorRef.current)
    }
    cursorRef.current = null
  }, [tekst])

  const beschreven = beschrijvingIds(ids, hint, error)

  return (
    <Field ids={ids} label={label} hint={hint} error={error} labelVerborgen={labelVerborgen} verplicht={verplicht} className={wrapperClassName}>
      <div className="relative">
        {prefix && (
          <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            {prefix}
          </span>
        )}
        <input
          {...rest}
          ref={invoerRef}
          id={ids.invoer}
          type="text"
          inputMode={decimalen > 0 ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={tekst}
          aria-invalid={error ? true : undefined}
          aria-describedby={beschreven}
          aria-required={verplicht || undefined}
          className={cn(INVOER_KLASSE, invoerRand(Boolean(error)), prefix ? 'pl-8' : 'pl-3.5', suffix ? 'pr-14' : 'pr-3.5', 'tabular-nums', className)}
          onChange={(e) => {
            const ruw = e.target.value
            const cursor = e.target.selectionStart ?? ruw.length
            const uit = formatTijdensTypen(ruw, opties)
            cursorRef.current = cursorNaFormat(ruw, cursor, uit.tekst)
            setTekst(uit.tekst)
            if (uit.getal !== value) onChange(uit.getal)
          }}
          onBlur={(e) => {
            const getal = formatTijdensTypen(tekst, opties).getal
            if (getal !== null) {
              let begrensd = getal
              if (min !== undefined && begrensd < min) begrensd = min
              if (max !== undefined && begrensd > max) begrensd = max
              if (begrensd !== getal) onChange(begrensd)
              setTekst(formatVoorInvoer(begrensd, opties))
            } else if (tekst !== '') {
              setTekst('')
            }
            onBlur?.(e)
          }}
        />
        {suffix && (
          <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  )
}
