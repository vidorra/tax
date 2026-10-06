'use client'

import { HeartPulse, House, Landmark, Receipt, Wallet } from 'lucide-react'
import Link from 'next/link'
import { memo } from 'react'
import { formatEuro, formatPct } from '@/components/ui/format'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { NumberInput } from '@/components/ui/NumberInput'
import { Section } from '@/components/ui/Section'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Toggle } from '@/components/ui/Toggle'
import type { Box3Params, PersoonId, Status } from '@/lib/tax/types'
import { pad } from '@/lib/site'
import type { CalculatorState, PersoonState } from '@/lib/calculator/formulier'
import { type Wijzig, PersoonKeuze, VeldRij, zetPersoon } from './gedeeld'

interface PersoonProps {
  partner: boolean
  actief: PersoonId
  setActief: (id: PersoonId) => void
  persoon: PersoonState
  wijzig: Wijzig
}

const ikOfPartner = (id: PersoonId, ik: string, partner: string) => (id === 'B' ? partner : ik)

export const SectieInkomsten = memo(function SectieInkomsten({ partner, actief, setActief, persoon: p, wijzig }: PersoonProps) {
  const zet = (patch: Partial<PersoonState>) => zetPersoon(wijzig, actief, patch)
  return (
    <Section id="inkomsten" icon={<Wallet />} title="Overige inkomsten" subtitle="Loon uit een baan naast je onderneming">
      <PersoonKeuze partner={partner} actief={actief} onChange={setActief} />
      <div className="space-y-5">
        <Toggle
          label={ikOfPartner(actief, 'Ik heb ook loon uit dienstbetrekking', 'Mijn partner heeft loon uit dienstbetrekking')}
          description="Een baan in loondienst, ook parttime of tijdelijk."
          checked={p.loonAan}
          onChange={(aan) => zet({ loonAan: aan })}
        />
        {p.loonAan && (
          <VeldRij>
            <MoneyInput label="Brutoloon per jaar" value={p.loonBruto} onChange={(v) => zet({ loonBruto: v ?? 0 })} hint="Fiscaal loon van je jaaropgaaf." />
            <MoneyInput label="Ingehouden loonheffing" value={p.loonheffing} onChange={(v) => zet({ loonheffing: v ?? 0 })} hint="Staat ook op je jaaropgaaf." />
          </VeldRij>
        )}
      </div>
    </Section>
  )
})

export const SectiePensioen = memo(function SectiePensioen({ partner, actief, setActief, persoon: p, wijzig }: PersoonProps) {
  const zet = (patch: Partial<PersoonState>) => zetPersoon(wijzig, actief, patch)
  return (
    <Section id="pensioen" icon={<HeartPulse />} title="Pensioen en AOV" subtitle="Lijfrentepremie en arbeidsongeschiktheidsverzekering">
      <PersoonKeuze partner={partner} actief={actief} onChange={setActief} />
      <VeldRij>
        <MoneyInput
          label="Lijfrentepremie dit jaar"
          value={p.lijfrente}
          onChange={(v) => zet({ lijfrente: v ?? 0 })}
          hint={
            <>
              Aftrekbaar tot je jaarruimte. We schatten die met je inkomen van dit jaar.{' '}
              <Link href={pad('/jaarruimte')} className="font-medium text-primary underline-offset-2 hover:text-primary-dark hover:underline">
                Bereken je jaarruimte precies
              </Link>
              .
            </>
          }
        />
        <MoneyInput label="Premie AOV dit jaar" value={p.aov} onChange={(v) => zet({ aov: v ?? 0 })} hint="Premie voor een arbeidsongeschiktheidsverzekering die een uitkering geeft." />
      </VeldRij>
    </Section>
  )
})

export const SectieWoning = memo(function SectieWoning({ woning, wijzig }: { woning: CalculatorState['woning']; wijzig: Wijzig }) {
  const zet = (patch: Partial<CalculatorState['woning']>) => wijzig((s) => ({ ...s, woning: { ...s.woning, ...patch } }))
  return (
    <Section id="woning" icon={<House />} title="Woning" subtitle="Eigenwoningforfait en hypotheekrenteaftrek">
      <div className="space-y-5">
        <Toggle label="Ik heb een koopwoning als hoofdverblijf" checked={woning.aan} onChange={(aan) => zet({ aan })} />
        {woning.aan && (
          <VeldRij>
            <MoneyInput label="WOZ-waarde" value={woning.woz} onChange={(v) => zet({ woz: v ?? 0 })} hint="De WOZ-waarde op de aanslag gemeentelijke belastingen van dit jaar." />
            <MoneyInput label="Betaalde hypotheekrente per jaar" value={woning.rente} onChange={(v) => zet({ rente: v ?? 0 })} hint="Alleen rente over de lening voor je eigen woning." />
          </VeldRij>
        )}
      </div>
    </Section>
  )
})

interface VermogenProps {
  vermogen: CalculatorState['vermogen']
  box3: Box3Params
  status: Status
  wijzig: Wijzig
}

export const SectieVermogen = memo(function SectieVermogen({ vermogen, box3, status, wijzig }: VermogenProps) {
  const zet = (patch: Partial<CalculatorState['vermogen']>) => wijzig((s) => ({ ...s, vermogen: { ...s.vermogen, ...patch } }))
  const forfaitair = box3.regime !== 'werkelijkRendement'
  return (
    <Section
      id="vermogen"
      icon={<Landmark />}
      title="Vermogen (box 3)"
      subtitle="Stand op 1 januari"
      actie={status !== 'definitief' ? <StatusBadge status={status} klein tooltipKant="rechts" /> : undefined}
    >
      <div className="space-y-4">
        <VeldRij>
          <MoneyInput label="Bank- en spaartegoeden" value={vermogen.bank} onChange={(v) => zet({ bank: v ?? 0 })} />
          <MoneyInput label="Beleggingen" value={vermogen.beleggingen} onChange={(v) => zet({ beleggingen: v ?? 0 })} />
          <MoneyInput label="Crypto" value={vermogen.crypto} onChange={(v) => zet({ crypto: v ?? 0 })} />
          <MoneyInput label="Schulden" value={vermogen.schulden} onChange={(v) => zet({ schulden: v ?? 0 })} hint="Geen hypotheek van je eigen woning." />
        </VeldRij>
        <p className="text-xs leading-relaxed text-gray-500">
          {forfaitair
            ? `Heffingsvrij vermogen ${formatEuro(box3.heffingsvrijVermogen)} per persoon. Forfaitair rendement: bank ${formatPct(box3.forfaitBank)}, overige bezittingen ${formatPct(box3.forfaitOverig)}, schulden ${formatPct(box3.forfaitSchulden)}; tarief ${formatPct(box3.tarief)}.`
            : `In dit jaar geldt het nieuwe stelsel met belasting over het werkelijke rendement (tarief ${formatPct(box3.tarief)}). Zonder rendementsgegevens rekenen we met de standen op 1 januari.`}
        </p>
      </div>
    </Section>
  )
})

interface VoorlopigProps extends PersoonProps {
  pot: CalculatorState['belastingpot']
}

export const SectieVoorlopig = memo(function SectieVoorlopig({ partner, actief, setActief, persoon: p, pot, wijzig }: VoorlopigProps) {
  const zetVa = (patch: Partial<PersoonState['voorlopigeAanslag']>) => zetPersoon(wijzig, actief, { voorlopigeAanslag: { ...p.voorlopigeAanslag, ...patch } })
  const zetPot = (patch: Partial<CalculatorState['belastingpot']>) => wijzig((s) => ({ ...s, belastingpot: { ...s.belastingpot, ...patch } }))
  return (
    <Section id="voorlopig" icon={<Receipt />} title="Voorlopige aanslag en belastingpot" subtitle="Wat je al betaalt en wat je opzij hebt gezet">
      <PersoonKeuze partner={partner} actief={actief} onChange={setActief} />
      <div className="space-y-5">
        <VeldRij>
          <MoneyInput
            label="Voorlopige aanslag inkomstenbelasting"
            value={p.voorlopigeAanslag.ib}
            onChange={(v) => zetVa({ ib: v ?? 0 })}
            hint="Het totaalbedrag over het hele jaar, ook termijnen die nog komen."
          />
          <MoneyInput label="Voorlopige aanslag Zvw" value={p.voorlopigeAanslag.zvw} onChange={(v) => zetVa({ zvw: v ?? 0 })} hint="Inkomensafhankelijke bijdrage Zorgverzekeringswet." />
        </VeldRij>
        <div className="border-t border-gray-100 pt-5">
          <p className="mb-3 text-sm font-medium text-gray-700">Belastingpot{partner ? ' (samen)' : ''}</p>
          <VeldRij>
            <MoneyInput label="Nu opzij gezet" value={pot.saldo} onChange={(v) => zetPot({ saldo: v ?? 0 })} hint="Saldo van je spaarrekening voor de belasting." />
            <NumberInput
              label="Maanden van het jaar voorbij"
              value={pot.maandenVerstreken}
              min={0}
              max={12}
              suffix="mnd"
              onChange={(v) => v !== null && v >= 0 && v <= 12 && zetPot({ maandenVerstreken: v })}
              hint="Daarmee bepalen we hoeveel er nu al in de pot zou moeten zitten."
            />
          </VeldRij>
        </div>
      </div>
    </Section>
  )
})
