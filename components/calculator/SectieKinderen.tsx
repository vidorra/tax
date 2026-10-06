'use client'

import { Baby, Plus, Trash2 } from 'lucide-react'
import { memo, useId } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { INVOER_KLASSE } from '@/components/ui/Field'
import { formatEuro } from '@/components/ui/format'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { NumberInput } from '@/components/ui/NumberInput'
import { Section } from '@/components/ui/Section'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/components/ui/cn'
import type { ToeslagenParams } from '@/lib/tax/types'
import { type CalculatorState, type KindState, type OpvangSoort, MAX_KINDEREN, standaardKind, standaardOpvang } from '@/lib/calculator/formulier'
import { type Wijzig, VeldRij } from './gedeeld'

const SOORTEN: Array<{ value: OpvangSoort; label: string }> = [
  { value: 'dagopvang', label: 'Dagopvang' },
  { value: 'bso', label: 'BSO' },
  { value: 'gastouder', label: 'Gastouder' },
]

interface Props {
  jaar: number
  kinderen: CalculatorState['kinderen']
  kot: ToeslagenParams['kot']
  wijzig: Wijzig
}

function KindKaart({ index, kind, jaar, kot, wijzig }: { index: number; kind: KindState; jaar: number; kot: ToeslagenParams['kot']; wijzig: Wijzig }) {
  const basis = useId().replace(/:/g, '')
  const datumId = `kind-${basis}-datum`
  const naam = `Kind ${index + 1}`
  const zet = (patch: Partial<KindState>) => wijzig((s) => ({ ...s, kinderen: s.kinderen.map((k, i) => (i === index ? { ...k, ...patch } : k)) }))
  const zetOpvang = (patch: Partial<NonNullable<KindState['opvang']>>) => zet({ opvang: { ...(kind.opvang ?? standaardOpvang()), ...patch } })
  const maxUurprijs = kind.opvang ? kot.maxUurprijs[kind.opvang.soort] : 0

  return (
    <li className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-900">{naam}</h3>
        <Button
          variant="kaal"
          grootte="sm"
          onClick={() => wijzig((s) => ({ ...s, kinderen: s.kinderen.filter((_, i) => i !== index) }))}
          aria-label={`${naam} verwijderen`}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Verwijderen
        </Button>
      </div>
      <div className="space-y-4">
        <div>
          <label htmlFor={datumId} className="mb-1.5 block text-sm font-medium text-gray-700">
            Geboortedatum
          </label>
          <input
            id={datumId}
            type="date"
            value={kind.geboortedatum}
            min="1990-01-01"
            max={`${jaar + 1}-12-31`}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) zet({ geboortedatum: e.target.value })
            }}
            className={cn(INVOER_KLASSE, 'border-gray-200 px-3.5 hover:border-gray-300')}
          />
        </div>
        <Toggle label="Kinderopvang" description="Opvang bij een geregistreerde organisatie of gastouder." checked={kind.opvang !== null} onChange={(aan) => zet({ opvang: aan ? standaardOpvang() : null })} />
        {kind.opvang && (
          <>
            <ChipGroup<OpvangSoort> label="Soort opvang" kolommen={3} value={kind.opvang.soort} onChange={(soort) => zetOpvang({ soort })} options={SOORTEN} />
            <VeldRij>
              <NumberInput
                label="Uren per maand"
                value={kind.opvang.urenPerMaand}
                min={0}
                max={kot.maxUrenPerMaand}
                suffix="uur"
                onChange={(v) => zetOpvang({ urenPerMaand: Math.min(kot.maxUrenPerMaand, v ?? 0) })}
                hint={`Toeslag over maximaal ${kot.maxUrenPerMaand} uur per maand.`}
              />
              <MoneyInput
                label="Uurtarief"
                decimalen={2}
                value={kind.opvang.uurtarief}
                onChange={(v) => zetOpvang({ uurtarief: v ?? 0 })}
                hint={maxUurprijs > 0 ? `Toeslag tot een uurprijs van ${formatEuro(maxUurprijs, { decimalen: 2 })}.` : undefined}
              />
            </VeldRij>
          </>
        )}
      </div>
    </li>
  )
}

export const SectieKinderen = memo(function SectieKinderen({ jaar, kinderen, kot, wijzig }: Props) {
  return (
    <Section id="kinderen" icon={<Baby />} title="Kind en opvang" subtitle="Combinatiekorting, kinderopvangtoeslag en kinderbijslag">
      {kinderen.length === 0 && <p className="mb-4 text-sm text-gray-600">Geen kinderen ingevuld. Voeg een kind toe voor de combinatiekorting en toeslagen.</p>}
      {kinderen.length > 0 && (
        <ul className="mb-4 space-y-3" aria-label="Kinderen">
          {kinderen.map((k, i) => (
            <KindKaart key={i} index={i} kind={k} jaar={jaar} kot={kot} wijzig={wijzig} />
          ))}
        </ul>
      )}
      {kinderen.length < MAX_KINDEREN && (
        <Button variant="secundair" onClick={() => wijzig((s) => ({ ...s, kinderen: [...s.kinderen, standaardKind(s.jaar)] }))}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Kind toevoegen
        </Button>
      )}
    </Section>
  )
})
