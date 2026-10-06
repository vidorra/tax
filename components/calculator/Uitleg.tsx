'use client'

import { PiggyBank } from 'lucide-react'
import { memo } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Disclosure } from '@/components/ui/Disclosure'
import { formatDatum, formatEuro } from '@/components/ui/format'
import { Section } from '@/components/ui/Section'
import { StatLijst, StatRow } from '@/components/ui/StatRow'
import { UitlegLijst } from '@/components/ui/UitlegLijst'
import { WaarschuwingLijst } from '@/components/ui/WaarschuwingLijst'
import type { JaarUitkomst, PotUitkomst } from '@/lib/calculator/berekening'
import { PERSOON_NAAM } from './gedeeld'

export const UitlegBlok = memo(function UitlegBlok({ hoofd, partner }: { hoofd: JaarUitkomst; partner: boolean }) {
  const r = hoofd.resultaat
  return (
    <section id="uitleg" aria-labelledby="uitleg-titel" className="scroll-mt-4 space-y-3">
      <div>
        <h2 id="uitleg-titel" className="text-lg font-semibold text-gray-900">
          Uitleg van de berekening {hoofd.jaar}
        </h2>
        <p className="mt-1 text-sm text-gray-600">Elke stap in de volgorde van een fiscaal rapport, met de formule en de gebruikte parameter.</p>
      </div>
      {hoofd.notities.map((n, i) => (
        <Alert key={i} variant="info">
          {n}
        </Alert>
      ))}
      {!r && <p className="text-sm text-gray-600">Er is nog geen berekening om uit te leggen.</p>}
      {r?.personen.map((p) => (
        <Disclosure
          key={p.id}
          titel={partner ? `Berekening ${PERSOON_NAAM[p.id].toLowerCase()}` : 'Berekening inkomstenbelasting en Zvw'}
          subtitel={`${p.uitleg.length} regels${p.waarschuwingen.length ? `, ${p.waarschuwingen.length} ${p.waarschuwingen.length === 1 ? 'melding' : 'meldingen'}` : ''}`}
          rechts={<span className="whitespace-nowrap text-sm font-medium tabular-nums text-gray-900">{formatEuro(p.teBetalenIB + p.zvw.teBetalen)}</span>}
        >
          <UitlegLijst regels={p.uitleg} aria-label={partner ? `Uitleg ${PERSOON_NAAM[p.id].toLowerCase()}` : 'Uitleg'} />
          {p.waarschuwingen.length > 0 && <WaarschuwingLijst waarschuwingen={p.waarschuwingen} className="mt-4" />}
        </Disclosure>
      ))}
      {r && (r.uitleg.length > 0 || r.waarschuwingen.length > 0) && (
        <Disclosure titel="Huishouden: verdeling, box 3 en toeslagen" subtitel="Gemeenschappelijke posten en toeslagen" rechts={r.totaal.toeslagen > 0 ? <span className="whitespace-nowrap text-sm tabular-nums text-gray-700">toeslagen {formatEuro(r.totaal.toeslagen)}</span> : undefined}>
          <UitlegLijst regels={r.uitleg} aria-label="Uitleg huishouden" legeTekst="Geen gemeenschappelijke posten." />
          {r.waarschuwingen.length > 0 && <WaarschuwingLijst waarschuwingen={r.waarschuwingen} className="mt-4" />}
        </Disclosure>
      )}
    </section>
  )
})

export const BelastingpotKaart = memo(function BelastingpotKaart({ pot, jaar, maanden }: { pot: PotUitkomst | null; jaar: number; maanden: number }) {
  if (!pot) return null
  const rest = 12 - Math.min(12, Math.max(0, maanden))
  return (
    <Section
      id="belastingpot"
      icon={<PiggyBank />}
      title="Belastingpot"
      subtitle={`Wat je opzij zet voor de aanslag over ${jaar}`}
      value={rest > 0 ? `${formatEuro(pot.perMaandRest)} p/m` : formatEuro(pot.perMaandRest)}
    >
      <StatLijst aria-label="Belastingpot">
        <StatRow label="Doel aan het einde van het jaar" toelichting="Verschuldigde IB en Zvw min je voorlopige aanslagen" bedrag={pot.doel} />
        <StatRow label={`Nodig na ${maanden} ${maanden === 1 ? 'maand' : 'maanden'}`} bedrag={pot.doelNu} />
        <StatRow label="Achterstand" bedrag={pot.achterstand} />
        <StatRow label={rest > 0 ? `Per maand voor de resterende ${rest} ${rest === 1 ? 'maand' : 'maanden'}` : 'Nog opzij te zetten'} bedrag={pot.perMaandRest} variant="subtotaal" />
        <StatRow label="Belastingrente per jaar vertraging" toelichting={`Over een bijbetaling, vanaf ${formatDatum(pot.renteVanaf)}`} bedrag={pot.renteRisico} />
      </StatLijst>
      {pot.waarschuwingen.length > 0 && <WaarschuwingLijst waarschuwingen={pot.waarschuwingen} className="mt-4" />}
      <Disclosure titel="Zo rekenen we de pot uit" variant="kaal" className="mt-3">
        <UitlegLijst regels={pot.uitleg} toonParameter={false} />
      </Disclosure>
    </Section>
  )
})
