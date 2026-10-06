'use client'

/**
 * Ronde 2 (A5): keuze van het land van de bronbelasting. Eerst de landen die het vaakst voorkomen, dan alle andere
 * alfabetisch, dan "Ander land" met een vrije ISO-code (twee letters). Native select met optgroups: werkt met het
 * toetsenbord (pijltjes, beginletter) en met een schermlezer zonder extra code.
 */
import { ChevronDown } from 'lucide-react'
import { forwardRef, useId, useState } from 'react'
import type { BronbelastingLand } from '@/lib/tax/types'
import { BRONBELASTING_LANDEN } from '@/lib/tax/years/data/bronbelasting-landen'
import { Field, INVOER_KLASSE, cn, veldIds } from '@/components/ui'
import { invoerRand } from '@/components/ui/Field'

const ANDER = '__ander'

export interface LandSelectProps {
  /** ISO-code, '' als er nog niets is gekozen, of een code buiten de tabel. */
  waarde: string
  onChange: (code: string) => void
  /** Oude vrije tekst die de tool niet herkende (alleen ter informatie). */
  oudeTekst?: string
  error?: string
  veld?: string
  tabel?: readonly BronbelastingLand[]
}

export const LandSelect = forwardRef<HTMLSelectElement, LandSelectProps>(function LandSelect({ waarde, onChange, oudeTekst, error, veld, tabel = BRONBELASTING_LANDEN }, ref) {
  const basis = useId().replace(/:/g, '')
  const ids = veldIds(`land-${basis}`)
  const codeIds = veldIds(`landcode-${basis}`)
  const inTabel = tabel.find((l) => l.code === waarde)
  const [anderGekozen, setAnderGekozen] = useState(false)
  const ander = anderGekozen || (waarde !== '' && !inTabel)
  const [code, setCode] = useState(ander ? waarde : '')
  const veel = tabel.filter((l) => l.veelgebruikt)
  const rest = tabel.filter((l) => !l.veelgebruikt).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  const hint = oudeTekst ? `Eerder ingevuld: ${oudeTekst}. Kies het land uit de lijst.` : undefined

  return (
    <div data-veld={veld} className="space-y-3">
      <Field ids={ids} label="Land" hint={hint} error={error} verplicht>
        <div className="relative">
          <select
            ref={ref}
            id={ids.invoer}
            value={ander ? ANDER : waarde}
            aria-invalid={error ? true : undefined}
            aria-describedby={[hint ? ids.hint : null, error ? ids.fout : null].filter(Boolean).join(' ') || undefined}
            aria-required
            onChange={(e) => {
              const v = e.target.value
              if (v === ANDER) {
                setAnderGekozen(true)
                setCode('')
                onChange('')
              } else {
                setAnderGekozen(false)
                onChange(v)
              }
            }}
            className={cn(INVOER_KLASSE, invoerRand(Boolean(error)), 'appearance-none pl-3.5 pr-10')}
          >
            <option value="" disabled>
              Kies een land
            </option>
            <optgroup label="Veel gebruikt">
              {veel.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.naam}
                </option>
              ))}
            </optgroup>
            <optgroup label="Andere landen">
              {rest.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.naam}
                </option>
              ))}
            </optgroup>
            <option value={ANDER}>Ander land</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        </div>
      </Field>
      {ander && (
        <Field ids={codeIds} label="Landcode" hint="Twee letters, zoals op je jaaroverzicht. Bijvoorbeeld ZA voor Zuid-Afrika.">
          <input
            id={codeIds.invoer}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            maxLength={2}
            value={code}
            aria-describedby={codeIds.hint}
            onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
              setCode(v)
              onChange(v.length === 2 ? v : '')
            }}
            className={cn(INVOER_KLASSE, 'max-w-[8rem] border-gray-200 px-3.5 uppercase hover:border-gray-300')}
          />
        </Field>
      )}
    </div>
  )
})
