'use client'

/**
 * Ronde 2 (A6): de vraag per onderneming "Waar komt de winst van {onderneming} vandaan?" (`OndernemingInvoer.winstBron`)
 * en per regeling de regel met wat eruit volgt ("Zit al in je winst: nee · volgt uit: winst uit je boekhouding ·
 * Aanpassen"). De vraag staat er alleen als een regeling die ervan afhangt speelt (ontwerp 2.5, rommelbudget); zonder
 * antwoord geldt boekhouding, dus bestaande dossiers veranderen niet.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { OndernemingInvoer } from '@/lib/tax/types'
import { ChipGroup, cn } from '@/components/ui'
import { winstBronTekst } from './onderneming-regelingen'

type Bron = NonNullable<OndernemingInvoer['winstBron']>

export function WinstBronVraag({ onderneming: o, pas, veld }: { onderneming: OndernemingInvoer; pas: (fn: (x: OndernemingInvoer) => void) => void; veld?: string }) {
  const naam = o.naam.trim() || 'deze onderneming'
  return (
    <div data-veld={veld}>
      <ChipGroup<Bron>
        label={`Waar komt de winst van ${naam} vandaan?`}
        kolommen={2}
        value={o.winstBron ?? 'boekhouding'}
        onChange={(v) => pas((x) => (v === 'boekhouding' ? delete x.winstBron : (x.winstBron = v)))}
        options={[
          { value: 'boekhouding', label: 'Uit mijn boekhouding' },
          { value: 'fiscaal-rapport', label: 'Uit een fiscaal rapport van mijn accountant' },
        ]}
        hint="Dit bepaalt of reserves, de btw-correctie van de auto en vergoedingen al in je winst zitten. Per regeling kun je het aanpassen."
      />
    </div>
  )
}

export interface InSaldoRegelProps {
  /** "Zit al in je winst", "Zit al in de autokosten" of "Zit al in je boekhouding". */
  label: string
  /** Het expliciete antwoord bij de regeling; undefined = de standaard. */
  expliciet: boolean | undefined
  /** De standaard uit `winstBron` (standaardInSaldo). */
  standaard: boolean
  onderneming: Pick<OndernemingInvoer, 'winstBron'>
  onChange: (waarde: boolean | undefined) => void
  /** Uitleg bij de keuze, bijvoorbeeld wat de engine dan doet. */
  uitleg?: string
  veld?: string
  className?: string
}

/**
 * Eén regel met het antwoord en waar het vandaan komt. Aanpassen opent ja/nee (focus op de keuze); "Standaard
 * gebruiken" haalt het expliciete antwoord weer weg.
 */
export function InSaldoRegel({ label, expliciet, standaard, onderneming, onChange, uitleg, veld, className }: InSaldoRegelProps) {
  const [open, setOpen] = useState(false)
  const wortel = useRef<HTMLDivElement>(null)
  const knop = useRef<HTMLButtonElement>(null)
  const paneelId = `${useId().replace(/:/g, '')}-insaldo`
  const waarde = expliciet ?? standaard

  useEffect(() => {
    if (open) wortel.current?.querySelector<HTMLButtonElement>('[role="radio"][tabindex="0"]')?.focus()
  }, [open])

  return (
    <div ref={wortel} data-veld={veld} className={cn('text-xs text-gray-600', className)}>
      <p className="flex flex-wrap items-center gap-x-1.5">
        <span>
          {label}: <span className="font-medium text-gray-900">{waarde ? 'ja' : 'nee'}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span>{expliciet === undefined ? `volgt uit: winst uit ${winstBronTekst(onderneming)}` : 'door jou aangepast'}</span>
        <span aria-hidden="true">·</span>
        <button
          ref={knop}
          type="button"
          aria-expanded={open}
          aria-controls={paneelId}
          onClick={() => setOpen((x) => !x)}
          className="inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Aanpassen<span className="sr-only">: {label.toLowerCase()}</span>
        </button>
      </p>
      <div id={paneelId} hidden={!open} className="mt-1 space-y-2 rounded-xl border border-gray-200 bg-white p-3">
        <ChipGroup<'ja' | 'nee'>
          label={`${label}?`}
          kolommen={2}
          value={waarde ? 'ja' : 'nee'}
          onChange={(v) => onChange(v === 'ja' ? (standaard ? undefined : true) : standaard ? false : undefined)}
          options={[
            { value: 'ja', label: 'Ja' },
            { value: 'nee', label: 'Nee' },
          ]}
          hint={uitleg}
        />
        <div className="flex flex-wrap gap-x-4">
          {expliciet !== undefined && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="inline-flex min-h-[44px] items-center text-xs font-medium text-primary transition-colors hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Standaard gebruiken ({standaard ? 'ja' : 'nee'})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              knop.current?.focus()
            }}
            className="inline-flex min-h-[44px] items-center text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Klaar
          </button>
        </div>
      </div>
    </div>
  )
}
