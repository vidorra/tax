'use client'

import { Briefcase } from 'lucide-react'
import { memo } from 'react'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { formatEuro, formatGetal } from '@/components/ui/format'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { NumberInput } from '@/components/ui/NumberInput'
import { Section } from '@/components/ui/Section'
import { Toggle } from '@/components/ui/Toggle'
import type { OndernemerParams, PersoonId } from '@/lib/tax/types'
import { naarJaarbasis, type PersoonState } from '@/lib/calculator/formulier'
import { type Wijzig, PersoonKeuze, VeldRij, zetPersoon } from './gedeeld'

const MAANDEN = Array.from({ length: 12 }, (_, i) => i + 1)

interface Props {
  jaar: number
  partner: boolean
  actief: PersoonId
  setActief: (id: PersoonId) => void
  persoon: PersoonState
  ondernemer: OndernemerParams
  wijzig: Wijzig
}

export const SectieOnderneming = memo(function SectieOnderneming({ jaar, partner, actief, setActief, persoon: p, ondernemer, wijzig }: Props) {
  const id = actief
  const zet = (patch: Partial<PersoonState>) => zetPersoon(wijzig, id, patch)
  const kia = ondernemer.kia
  const omgerekend = p.maandenGewerkt < 12

  return (
    <Section
      id="onderneming"
      icon={<Briefcase />}
      title="Onderneming"
      subtitle="Omzet, kosten en het urencriterium"
      value={p.heeftOnderneming ? formatEuro(naarJaarbasis(p.omzet, p.maandenGewerkt) - naarJaarbasis(p.kosten, p.maandenGewerkt)) : undefined}
    >
      <PersoonKeuze partner={partner} actief={actief} onChange={setActief} />
      <div className="space-y-5">
        <Toggle
          label={id === 'B' ? 'Mijn partner heeft een eenmanszaak of vof' : 'Ik heb een eenmanszaak of vof'}
          description="Winst uit onderneming, met zelfstandigenaftrek en MKB-winstvrijstelling."
          checked={p.heeftOnderneming}
          onChange={(aan) => zet({ heeftOnderneming: aan })}
        />

        {p.heeftOnderneming && (
          <>
            <ChipGroup<number>
              label="Over hoeveel maanden gaan de bedragen?"
              value={p.maandenGewerkt}
              onChange={(m) => zet({ maandenGewerkt: m })}
              kolommen={6}
              options={MAANDEN.map((m) => ({ value: m, label: String(m), ariaLabel: m === 1 ? '1 maand' : `${m} maanden` }))}
              hint={
                omgerekend
                  ? `We rekenen je cijfers om naar een heel jaar (× 12 / ${p.maandenGewerkt}).`
                  : 'Kies minder dan 12 als je de cijfers tot nu toe invult; we rekenen ze dan om naar een heel jaar.'
              }
            />

            <VeldRij>
              <MoneyInput
                label={omgerekend ? `Omzet in ${p.maandenGewerkt} ${p.maandenGewerkt === 1 ? 'maand' : 'maanden'}` : 'Omzet per jaar'}
                value={p.omzet}
                onChange={(v) => zet({ omzet: v ?? 0 })}
                hint="Exclusief btw."
              />
              <MoneyInput
                label={omgerekend ? `Kosten in ${p.maandenGewerkt} ${p.maandenGewerkt === 1 ? 'maand' : 'maanden'}` : 'Kosten per jaar'}
                value={p.kosten}
                onChange={(v) => zet({ kosten: v ?? 0 })}
                hint="Zakelijke kosten inclusief afschrijvingen, exclusief btw."
              />
            </VeldRij>

            <Toggle
              label={id === 'B' ? 'Mijn partner voldoet aan het urencriterium' : 'Ik voldoe aan het urencriterium'}
              description={`Minstens ${formatGetal(ondernemer.urencriterium.uren)} uur per jaar aan je onderneming, inclusief indirecte uren zoals administratie en acquisitie, en meer dan de helft van je werktijd. Nodig voor de zelfstandigenaftrek (${jaar}: ${formatEuro(ondernemer.zelfstandigenaftrek)}).`}
              checked={p.urencriterium}
              onChange={(aan) => zet({ urencriterium: aan })}
            />

            <VeldRij>
              <NumberInput
                label="Startjaar onderneming"
                value={p.startjaar}
                min={1950}
                max={jaar}
                onChange={(v) => v !== null && v >= 1950 && v <= jaar + 1 && zet({ startjaar: v })}
                hint={`Starters krijgen de eerste jaren startersaftrek (${formatEuro(ondernemer.startersaftrek)}).`}
              />
              <MoneyInput
                label="Investeringen dit jaar"
                value={p.investeringen}
                onChange={(v) => zet({ investeringen: v ?? 0 })}
                hint={`Kleinschaligheidsinvesteringsaftrek (KIA) bij meer dan ${formatEuro(kia.ondergrens)} in totaal; alleen bedrijfsmiddelen van minstens ${formatEuro(kia.minPerBedrijfsmiddel)} per stuk tellen mee.`}
              />
            </VeldRij>

            <NumberInput
              label="Zakelijke kilometers met je privéauto"
              value={p.zakelijkeKmPrive}
              min={0}
              groeperen
              suffix="km"
              onChange={(v) => zet({ zakelijkeKmPrive: v ?? 0 })}
              hint={`Aftrekbaar tegen ${formatEuro(ondernemer.kilometerTariefPrivevervoer, { decimalen: 2 })} per kilometer. Laat leeg als je die al in je kosten hebt meegenomen.`}
            />
          </>
        )}
      </div>
    </Section>
  )
})
