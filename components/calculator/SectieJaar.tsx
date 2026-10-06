'use client'

import { CalendarDays } from 'lucide-react'
import { memo } from 'react'
import { Alert } from '@/components/ui/Alert'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { NumberInput } from '@/components/ui/NumberInput'
import { Section } from '@/components/ui/Section'
import { StatusBadge, STATUS_INFO } from '@/components/ui/StatusBadge'
import { Toggle } from '@/components/ui/Toggle'
import type { Status } from '@/lib/tax/types'
import { CONCEPT_JAREN, getJaar, laagsteStatus } from '@/lib/tax/years'
import { jaarBestaat } from '@/lib/calculator/formulier'
import { type Wijzig, PERSOON_NAAM, VeldRij, zetPersoon } from './gedeeld'

export interface JaarOptieInfo {
  jaar: number
  status: Status
  concept: boolean
}

/** Jaren in de jaarkiezer: 2024 tot en met het conceptjaar, plus een eerder beginjaar. */
export function jaarOpties(beginJaar?: number): JaarOptieInfo[] {
  const jaren = [2024, 2025, 2026, 2027, ...CONCEPT_JAREN].filter(jaarBestaat)
  if (beginJaar && jaarBestaat(beginJaar) && !jaren.includes(beginJaar)) jaren.unshift(beginJaar)
  return [...new Set(jaren)].sort((a, b) => a - b).map((jaar) => ({ jaar, status: laagsteStatus(getJaar(jaar)), concept: CONCEPT_JAREN.includes(jaar) }))
}

/** Label voor de standaardset van een jaar met varianten (2027: de sleuteltabel van Prinsjesdag). */
const STANDAARD_VARIANT_LABEL = 'Sleuteltabel (Prinsjesdag)'

interface Props {
  jaar: number
  variant?: string
  partner: boolean
  vergelijk: boolean
  geboortejaarA: number
  geboortejaarB: number
  opties: JaarOptieInfo[]
  wijzig: Wijzig
}

export const SectieJaar = memo(function SectieJaar({ jaar, variant, partner, vergelijk, geboortejaarA, geboortejaarB, opties, wijzig }: Props) {
  const volgendBestaat = jaarBestaat(jaar + 1)
  // Het jaar waarvoor een variantkeuze bestaat: het gekozen jaar, of het vergelijkingsjaar.
  const kandidaten = vergelijk && volgendBestaat ? [jaar, jaar + 1] : [jaar]
  const variantJaar = kandidaten.find((j) => getJaar(j).varianten.length > 0)
  const varianten = variantJaar ? getJaar(variantJaar).varianten : []
  const gekozenVariant = varianten.some((v) => v.id === variant) ? (variant as string) : ''
  const concept = CONCEPT_JAREN.includes(jaar)

  return (
    <Section id="jaar" icon={<CalendarDays />} title="Jaar en situatie" subtitle="Kies het belastingjaar en of je een fiscale partner hebt">
      <div className="space-y-5">
        <ChipGroup<number>
          label="Belastingjaar"
          value={jaar}
          onChange={(j) => wijzig((s) => ({ ...s, jaar: j }))}
          kolommen={opties.length >= 5 ? 5 : undefined}
          options={opties.map((o) => ({
            value: o.jaar,
            label: String(o.jaar),
            ariaLabel: `${o.jaar}, ${o.concept ? 'concept' : STATUS_INFO[o.status].label.toLowerCase()}`,
          }))}
          render={(optie, actief) => {
            const o = opties.find((x) => x.jaar === optie.value)
            return (
              <span className="flex flex-col items-center gap-1">
                <span className="tabular-nums">{optie.label}</span>
                {o && <StatusBadge status={o.concept ? 'geschat' : o.status} label={o.concept ? 'Concept' : undefined} tooltip={false} klein opDonker={actief} />}
              </span>
            )
          }}
          hint="Het label laat zien hoe zeker de cijfers van dat jaar zijn."
        />

        {concept && (
          <Alert variant="let-op" titel={`${jaar} is een concept`}>
            De cijfers voor {jaar} zijn grotendeels geschat op basis van de indexatieregels en lopende voorstellen. Gebruik deze uitkomst alleen als globale verkenning.
          </Alert>
        )}

        {varianten.length > 0 && variantJaar && (
          <ChipGroup<string>
            label={`Welk voorstel voor ${variantJaar}?`}
            value={gekozenVariant}
            onChange={(v) => wijzig((s) => ({ ...s, variant: v || undefined }))}
            kolommen={2}
            options={[
              { value: '', label: STANDAARD_VARIANT_LABEL, beschrijving: 'Belastingplan, 15 september 2026' },
              ...varianten.map((v) => ({ value: v.id, label: v.label, beschrijving: 'Nota van wijziging en novelle' })),
            ]}
            hint="Beide zijn voorstellen. Het parlement stemt er nog over."
          />
        )}

        <Toggle
          label="Vergelijk met volgend jaar"
          description={volgendBestaat ? `Toont naast ${jaar} ook de uitkomst voor ${jaar + 1} met dezelfde invoer.` : `Voor ${jaar + 1} zijn nog geen cijfers beschikbaar.`}
          checked={vergelijk && volgendBestaat}
          disabled={!volgendBestaat}
          onChange={(aan) => wijzig((s) => ({ ...s, vergelijk: aan }))}
        />

        <Toggle
          label="Ik heb een fiscale partner"
          description="Getrouwd, geregistreerd partner of samenwonend met een notarieel samenlevingscontract of een kind samen. We verdelen woning en vermogen zo voordelig mogelijk."
          checked={partner}
          onChange={(aan) => wijzig((s) => ({ ...s, partner: aan }))}
        />

        <VeldRij>
          <NumberInput
            label={partner ? `Geboortejaar (${PERSOON_NAAM.A.toLowerCase()})` : 'Geboortejaar'}
            value={geboortejaarA}
            min={1920}
            max={2010}
            onChange={(v) => v !== null && v >= 1920 && v <= 2010 && zetPersoon(wijzig, 'A', { geboortejaar: v })}
            hint="Voor de AOW-leeftijd en de heffingskortingen."
          />
          {partner && (
            <NumberInput
              label={`Geboortejaar (${PERSOON_NAAM.B.toLowerCase()})`}
              value={geboortejaarB}
              min={1920}
              max={2010}
              onChange={(v) => v !== null && v >= 1920 && v <= 2010 && zetPersoon(wijzig, 'B', { geboortejaar: v })}
            />
          )}
        </VeldRij>
      </div>
    </Section>
  )
})
