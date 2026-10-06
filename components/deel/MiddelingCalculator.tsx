'use client'

import { CalendarClock, Calculator as CalculatorIcoon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Disclosure } from '@/components/ui/Disclosure'
import { MobileResultBar } from '@/components/ui/MobileResultBar'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ResultBedrag, ResultPanel } from '@/components/ui/ResultPanel'
import { Section } from '@/components/ui/Section'
import { StatLijst, StatRow } from '@/components/ui/StatRow'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { UitlegLijst } from '@/components/ui/UitlegLijst'
import { WaarschuwingLijst } from '@/components/ui/WaarschuwingLijst'
import { formatDatum, formatEuro } from '@/components/ui/format'
import { berekenBox1 } from '@/lib/tax/modules/box1'
import { berekenMiddeling } from '@/lib/tax/modules/planning/middeling'
import { STANDAARD_JAAR } from '@/lib/tax/years'
import { DatumVeld, isIsoDatum } from './DatumVeld'
import { CalculatorGrid, DataTabel, Disclaimer } from './Opbouw'
import { jaarStatus, params } from './jaren'

/** Belasting en premie box 1 zonder heffingskortingen, met de tarieven van dat jaar (onder de AOW-leeftijd). */
export function box1Belasting(jaar: number, inkomen: number): number {
  return berekenBox1(inkomen, 0, { params: params(jaar), aowBereikt: false, geborenVoor1946: false }).totaal
}

/** ISO-datum plus een aantal maanden; valt de dag weg (31 februari), dan de laatste dag van die maand. */
export function plusMaanden(iso: string, maanden: number): string {
  const [j, m, d] = iso.split('-').map(Number)
  const laatste = new Date(Date.UTC(j, m - 1 + maanden + 1, 0)).getUTCDate()
  const uit = new Date(Date.UTC(j, m - 1 + maanden, Math.min(d, laatste)))
  return uit.toISOString().slice(0, 10)
}

const n = (x: number | null | undefined): number => x ?? 0

export function MiddelingCalculator() {
  const p = params(STANDAARD_JAAR)
  const m = p.overig.waarde.middeling
  const tijdvak = m.laatsteTijdvak
  const [inkomen, setInkomen] = useState<Record<number, number | null>>({})
  const [betaald, setBetaald] = useState<Record<number, number | null>>({})
  const [aanslagDatum, setAanslagDatum] = useState('')

  const jaren = useMemo(
    () =>
      tijdvak.map((jaar) => {
        const ink = n(inkomen[jaar])
        const berekend = box1Belasting(jaar, ink)
        const opgegeven = betaald[jaar] ?? null
        return { jaar, box1Inkomen: ink, box1BelastingEnPremie: opgegeven ?? berekend, berekend, eigen: opgegeven !== null }
      }),
    [tijdvak, inkomen, betaald],
  )
  const res = useMemo(() => berekenMiddeling(jaren, box1Belasting, { params: p }), [jaren, p])
  const ingevuld = tijdvak.every((j) => inkomen[j] !== null && inkomen[j] !== undefined)
  const bedrag = (id: string) => res.uitleg.find((r) => r.id === id)?.bedrag ?? 0
  const deadline = isIsoDatum(aanslagDatum) ? plusMaanden(aanslagDatum, m.termijnMaanden) : null
  const status = jaarStatus(tijdvak[tijdvak.length - 1])

  const invoer = (
    <>
      <Section
        icon={<CalculatorIcoon />}
        title={`Box 1 in ${tijdvak[0]} tot en met ${tijdvak[tijdvak.length - 1]}`}
        subtitle="Het belastbaar inkomen uit werk en woning en de belasting en premie daarover, zonder heffingskortingen."
      >
        <ol className="divide-y divide-gray-100">
          {jaren.map((j) => (
            <li key={j.jaar} className="py-4 first:pt-0 last:pb-0">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                {j.jaar}
                {jaarStatus(j.jaar) !== 'definitief' && <StatusBadge status={jaarStatus(j.jaar)} klein tooltipKant="links" />}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyInput
                  label="Inkomen box 1"
                  value={inkomen[j.jaar] ?? null}
                  onChange={(v) => setInkomen((x) => ({ ...x, [j.jaar]: v }))}
                  negatief
                  aria-label={`Belastbaar inkomen box 1 in ${j.jaar}`}
                />
                <MoneyInput
                  label="Belasting en premie box 1"
                  value={betaald[j.jaar] ?? null}
                  onChange={(v) => setBetaald((x) => ({ ...x, [j.jaar]: v }))}
                  aria-label={`Belasting en premie box 1 in ${j.jaar}, zonder heffingskortingen`}
                  hint={j.eigen ? 'Zoals op je aanslag.' : `Leeg: berekend met de tarieven van ${j.jaar}, ${formatEuro(j.berekend)}.`}
                />
              </div>
              {j.eigen && (
                <Button variant="kaal" grootte="sm" className="mt-2" onClick={() => setBetaald((x) => ({ ...x, [j.jaar]: j.berekend }))}>
                  Bereken uit het inkomen ({formatEuro(j.berekend)})
                </Button>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={<CalendarClock />} title="Termijn" subtitle={`Het verzoek moet binnen ${m.termijnMaanden} maanden na de laatste definitieve aanslag van de drie jaren binnen zijn.`}>
        <DatumVeld
          label="Datum van de laatste definitieve aanslag"
          value={aanslagDatum}
          onChange={setAanslagDatum}
          hint="De dagtekening van de aanslag die als laatste van de drie definitief is geworden."
        />
        {deadline && (
          <p className="mt-3 text-sm text-gray-700">
            Dien het verzoek uiterlijk in op <strong className="font-semibold">{formatDatum(deadline)}</strong>.
          </p>
        )}
      </Section>
    </>
  )

  const resultaat = (
    <>
      <ResultPanel titel="Teruggaaf door middeling" kopExtra={status !== 'definitief' ? <StatusBadge status={status} tooltipKant="rechts" /> : undefined} live>
        <ResultBedrag label="Indicatieve teruggaaf" bedrag={ingevuld ? res.teruggaaf : null} leegTekst="Vul het inkomen van alle drie de jaren in" />
        <StatLijst className="mt-5" aria-label="Berekening middeling">
          <StatRow label="Gemiddeld inkomen" bedrag={res.gemiddeld} />
          <StatRow label="Werkelijk betaald" bedrag={bedrag('middeling.werkelijk')} />
          <StatRow label="Op het gemiddelde inkomen" bedrag={bedrag('middeling.herberekend')} variant="min" />
          <StatRow label="Drempel" bedrag={m.drempel} variant="min" />
          <StatRow label="Teruggaaf" bedrag={res.teruggaaf} variant="totaal" />
        </StatLijst>
        <p className="mt-4 text-xs leading-relaxed text-gray-600">
          {tijdvak[0]} tot en met {tijdvak[tijdvak.length - 1]} is het laatste tijdvak waarvoor middeling kan. Daarna is de regeling afgeschaft.
        </p>
        <Disclaimer className="mt-3" />
      </ResultPanel>
      <MobileResultBar label="Teruggaaf middeling" bedrag={ingevuld ? res.teruggaaf : null} leegTekst="Vul alle drie de jaren in" toelichting={deadline ? `Uiterlijk ${formatDatum(deadline)}` : undefined} />
    </>
  )

  const details = ingevuld ? (
    <>
      <WaarschuwingLijst waarschuwingen={res.waarschuwingen} />
      <section aria-labelledby="perjaar-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <h2 id="perjaar-titel" className="text-base font-medium text-gray-900">
          Per jaar
        </h2>
        <DataTabel
          className="mt-3"
          bijschrift="Belasting per jaar, werkelijk en op het gemiddelde inkomen"
          kop={['Jaar', 'Inkomen', 'Betaald', 'Op gemiddelde']}
          rijen={jaren.map((j) => [j.jaar, formatEuro(j.box1Inkomen), formatEuro(j.box1BelastingEnPremie), formatEuro(box1Belasting(j.jaar, res.gemiddeld))])}
        />
      </section>
      <Disclosure titel="Zo is het berekend" defaultOpen={false}>
        <UitlegLijst regels={res.uitleg} aria-label="Berekening middeling" />
      </Disclosure>
    </>
  ) : null

  return <CalculatorGrid invoer={invoer} resultaat={resultaat} details={details} />
}
