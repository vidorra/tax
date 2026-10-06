'use client'

import { Baby, Plus, Trash2, Users, Wallet } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { Disclosure } from '@/components/ui/Disclosure'
import { MobileResultBar } from '@/components/ui/MobileResultBar'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { NumberInput } from '@/components/ui/NumberInput'
import { ResultBedrag, ResultPanel } from '@/components/ui/ResultPanel'
import { Section } from '@/components/ui/Section'
import { StatLijst, StatRow } from '@/components/ui/StatRow'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Toggle } from '@/components/ui/Toggle'
import { UitlegLijst } from '@/components/ui/UitlegLijst'
import { WaarschuwingLijst } from '@/components/ui/WaarschuwingLijst'
import { formatDatum, formatEuro, formatPct } from '@/components/ui/format'
import { berekenHuishouden } from '@/lib/tax/engine'
import { berekenKgb, berekenKinderbijslag, berekenKot } from '@/lib/tax/modules/toeslagen'
import type { KindInvoer, PersoonInvoer } from '@/lib/tax/types'
import { JAREN, STANDAARD_JAAR } from '@/lib/tax/years'
import { DatumVeld, isIsoDatum } from './DatumVeld'
import { JaarKeuze } from './JaarKeuze'
import { CalculatorGrid, DataTabel, Disclaimer } from './Opbouw'
import { eenvoudigHuishouden, eenvoudigePersoon } from './invoer'
import { params } from './jaren'

type Soort = 'dagopvang' | 'bso' | 'gastouder'
type Modus = 'direct' | 'berekenen'

interface KindRij {
  id: string
  geboortedatum: string
  soort: Soort
  uren: number | null
  uurtarief: number | null
  maanden: number | null
  startdatum: string
}

const SOORT_LABEL: Record<Soort, string> = { dagopvang: 'Dagopvang', bso: 'BSO', gastouder: 'Gastouder' }
const MAANDEN_PER_JAAR = 12

/** Jaren in de vergelijking: het standaardjaar en het jaar erna (als dat bestaat). */
const VERGELIJK_JAREN = [STANDAARD_JAAR, STANDAARD_JAAR + 1].filter((j) => JAREN[j])

const n = (x: number | null | undefined): number => x ?? 0

function naarKindInvoer(rijen: KindRij[], jaar: number): KindInvoer[] {
  const p = params(jaar)
  const kot = p.toeslagen.waarde.kot
  return rijen
    .filter((k) => isIsoDatum(k.geboortedatum))
    .map((k, i) => ({
      id: k.id,
      naam: `Kind ${i + 1}`,
      geboortedatum: k.geboortedatum,
      opvang: [
        {
          soort: k.soort,
          urenPerMaand: n(k.uren),
          uurtarief: k.uurtarief ?? kot.maxUurprijs[k.soort],
          maanden: Math.min(MAANDEN_PER_JAAR, Math.max(0, k.maanden ?? MAANDEN_PER_JAAR)),
          startdatum: isIsoDatum(k.startdatum) ? k.startdatum : undefined,
        },
      ],
    }))
}

export function KinderopvangCalculator() {
  const [jaar, setJaar] = useState(STANDAARD_JAAR)
  const [partner, setPartner] = useState(true)
  const [modus, setModus] = useState<Modus>('direct')
  const [toetsingsinkomen, setToetsingsinkomen] = useState<number | null>(null)
  const [winstA, setWinstA] = useState<number | null>(null)
  const [loonA, setLoonA] = useState<number | null>(null)
  const [winstB, setWinstB] = useState<number | null>(null)
  const [loonB, setLoonB] = useState<number | null>(null)
  const [vermogen, setVermogen] = useState<number | null>(null)
  const [kinderen, setKinderen] = useState<KindRij[]>([
    { id: 'kind-1', geboortedatum: `${STANDAARD_JAAR - 2}-03-01`, soort: 'dagopvang', uren: 100, uurtarief: null, maanden: 12, startdatum: '' },
  ])
  const teller = useRef(1)

  const p = params(jaar)
  const kotP = p.toeslagen.waarde.kot

  const inkomenVoor = useMemo(() => {
    return (j: number): number => {
      if (modus === 'direct') return Math.max(0, n(toetsingsinkomen))
      const pj = params(j)
      const personen: PersoonInvoer[] = [eenvoudigePersoon('A', { winst: winstA, loon: loonA, jaar: j, params: pj })]
      if (partner) personen.push(eenvoudigePersoon('B', { winst: winstB, loon: loonB, jaar: j, params: pj }))
      return berekenHuishouden(eenvoudigHuishouden(j, personen), { zonderMarginaleDruk: true }).toeslagen.toetsingsinkomen
    }
  }, [modus, toetsingsinkomen, winstA, loonA, winstB, loonB, partner])

  const reken = useMemo(() => {
    return (j: number) => {
      const pj = params(j)
      const inkomen = inkomenVoor(j)
      const kids = naarKindInvoer(kinderen, j)
      const kot = berekenKot(kids, inkomen, { params: pj, jaar: j })
      const kgb = berekenKgb(kids, inkomen, n(vermogen), { params: pj, jaar: j, partner })
      const kb = berekenKinderbijslag(kids, { params: pj, jaar: j })
      return { inkomen, kids, kot, kgb, kb, totaal: kot.totaal + kgb.bedrag + kb.totaal }
    }
  }, [inkomenVoor, kinderen, vermogen, partner])

  const r = useMemo(() => reken(jaar), [reken, jaar])
  const vergelijk = useMemo(() => VERGELIJK_JAREN.map((j) => ({ jaar: j, ...reken(j) })), [reken])
  const heeftInkomen = modus === 'direct' ? toetsingsinkomen !== null : [winstA, loonA, winstB, loonB].some((x) => x !== null)
  const kosten = r.kot.perKind.reduce((s, k) => s + k.kostenPerJaar, 0)
  const eigenBijdrage = r.kot.perKind.reduce((s, k) => s + k.eigenBijdragePerJaar, 0)

  function wijzig(id: string, veld: Partial<KindRij>) {
    setKinderen((ks) => ks.map((k) => (k.id === id ? { ...k, ...veld } : k)))
  }
  function voegToe() {
    teller.current += 1
    setKinderen((ks) => [...ks, { id: `kind-${teller.current}`, geboortedatum: '', soort: 'bso', uren: 40, uurtarief: null, maanden: 12, startdatum: '' }])
  }

  const invoer = (
    <>
      <Section icon={<Users />} title="Jaar en huishouden">
        <div className="space-y-5">
          <JaarKeuze jaar={jaar} onJaar={setJaar} />
          <Toggle label="Toeslagpartner" description="Woon je samen met een partner? Dan telt jullie inkomen samen." checked={partner} onChange={setPartner} />
        </div>
      </Section>

      <Section icon={<Wallet />} title="Toetsingsinkomen" subtitle="Het verzamelinkomen van jou en je toeslagpartner samen.">
        <div className="space-y-4">
          <ChipGroup<Modus>
            label="Hoe wil je het inkomen opgeven?"
            labelVerborgen
            value={modus}
            onChange={setModus}
            kolommen={2}
            options={[
              { value: 'direct', label: 'Ik weet het', beschrijving: 'toetsingsinkomen' },
              { value: 'berekenen', label: 'Bereken het', beschrijving: 'uit winst en loon' },
            ]}
          />
          {modus === 'direct' ? (
            <MoneyInput
              label={`Toetsingsinkomen ${jaar}`}
              value={toetsingsinkomen}
              onChange={setToetsingsinkomen}
              hint="Staat op je aanslag inkomstenbelasting als verzamelinkomen. Tel dat van je toeslagpartner erbij op."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyInput label="Jouw winst" value={winstA} onChange={setWinstA} hint="Winst uit onderneming vóór ondernemersaftrek." />
              <MoneyInput label="Jouw loon" value={loonA} onChange={setLoonA} />
              {partner && <MoneyInput label="Winst partner" value={winstB} onChange={setWinstB} />}
              {partner && <MoneyInput label="Loon partner" value={loonB} onChange={setLoonB} />}
              <p className="text-xs leading-relaxed text-gray-500 sm:col-span-2">
                We rekenen met de zelfstandigenaftrek en de MKB-winstvrijstelling, het urencriterium gehaald, zonder eigen woning en zonder box 3. Toetsingsinkomen{' '}
                {jaar}: <strong className="tabular-nums text-gray-700">{formatEuro(r.inkomen)}</strong>.
              </p>
            </div>
          )}
          <MoneyInput
            label="Vermogen op 1 januari"
            value={vermogen}
            onChange={setVermogen}
            hint="Alleen voor het kindgebonden budget; voor de kinderopvangtoeslag geldt geen vermogenstoets."
          />
        </div>
      </Section>

      <Section
        icon={<Baby />}
        title="Kinderen en opvang"
        subtitle={`Maximaal ${kotP.maxUrenPerMaand} uur per kind per maand telt mee.`}
        actie={
          <Button variant="kaal" grootte="sm" onClick={voegToe} disabled={kinderen.length >= 6}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Kind
          </Button>
        }
      >
        <ol className="space-y-5">
          {kinderen.map((k, i) => (
            <li key={k.id} className="rounded-xl border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-gray-900">Kind {i + 1}</h3>
                {kinderen.length > 1 && (
                  <Button variant="kaal" grootte="sm" onClick={() => setKinderen((ks) => ks.filter((x) => x.id !== k.id))} aria-label={`Kind ${i + 1} verwijderen`}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="space-y-4">
                <ChipGroup<Soort>
                  label="Soort opvang"
                  value={k.soort}
                  onChange={(soort) => wijzig(k.id, { soort })}
                  kolommen={3}
                  options={(Object.keys(SOORT_LABEL) as Soort[]).map((s) => ({ value: s, label: SOORT_LABEL[s] }))}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <DatumVeld label="Geboortedatum" value={k.geboortedatum} onChange={(geboortedatum) => wijzig(k.id, { geboortedatum })} />
                  <NumberInput
                    label="Uren per maand"
                    value={k.uren}
                    onChange={(uren) => wijzig(k.id, { uren })}
                    min={0}
                    max={kotP.maxUrenPerMaand}
                    suffix="uur"
                    hint={`Hoogstens ${kotP.maxUrenPerMaand}.`}
                  />
                  <MoneyInput
                    label="Uurtarief"
                    value={k.uurtarief}
                    onChange={(uurtarief) => wijzig(k.id, { uurtarief })}
                    decimalen={2}
                    hint={`Leeg: de maximum uurprijs ${formatEuro(kotP.maxUurprijs[k.soort], { decimalen: 2 })}.`}
                  />
                  <NumberInput label="Maanden opvang" value={k.maanden} onChange={(maanden) => wijzig(k.id, { maanden })} min={0} max={MAANDEN_PER_JAAR} suffix="mnd" />
                  <DatumVeld
                    label="Start opvang"
                    value={k.startdatum}
                    onChange={(startdatum) => wijzig(k.id, { startdatum })}
                    hint="Optioneel: voor de uiterste aanvraagdatum."
                    wrapperClassName="sm:col-span-2"
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </>
  )

  const totaalPerMaand = r.kot.totaal / MAANDEN_PER_JAAR
  const resultaat = (
    <>
      <ResultPanel titel={`Kinderopvangtoeslag ${jaar}`} kopExtra={p.toeslagen.status !== 'definitief' ? <StatusBadge status={p.toeslagen.status} tooltipKant="rechts" /> : undefined} live>
        <ResultBedrag
          label="Toeslag per jaar"
          bedrag={heeftInkomen ? r.kot.totaal : null}
          leegTekst="Vul je toetsingsinkomen in"
          toelichting={heeftInkomen ? `Gemiddeld ${formatEuro(totaalPerMaand)} per maand` : undefined}
        />
        {heeftInkomen && (
          <StatLijst className="mt-5" aria-label="Samenvatting">
            <StatRow label="Kosten opvang" bedrag={kosten} />
            <StatRow label="Kinderopvangtoeslag" bedrag={r.kot.totaal} variant="min" />
            <StatRow label="Eigen bijdrage" bedrag={eigenBijdrage} variant="subtotaal" />
            <StatRow label="Kindgebonden budget" bedrag={r.kgb.bedrag} status={p.toeslagen.status} />
            <StatRow label="Kinderbijslag" bedrag={r.kb.totaal} toelichting="Los van je inkomen" />
            <StatRow label="Samen per jaar" bedrag={r.totaal} variant="totaal" />
          </StatLijst>
        )}
        <Disclaimer className="mt-4" />
      </ResultPanel>
      <MobileResultBar
        label={`Kinderopvangtoeslag ${jaar}`}
        bedrag={heeftInkomen ? r.kot.totaal : null}
        toelichting={heeftInkomen ? `${formatEuro(totaalPerMaand)} per maand` : undefined}
        leegTekst="Vul je toetsingsinkomen in"
      />
    </>
  )

  const details = (
    <>
      <WaarschuwingLijst waarschuwingen={[...r.kot.waarschuwingen, ...r.kgb.waarschuwingen]} />

      {/* Zonder inkomen zou dit rekenen met € 0 en dus met het hoogste percentage; het resultaatpaneel vraagt dan eerst om het inkomen. */}
      {heeftInkomen && r.kot.perKind.length > 0 && (
        <section aria-labelledby="perkind-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <h2 id="perkind-titel" className="text-base font-medium text-gray-900">
            Per kind
          </h2>
          <p className="mt-1 text-xs text-gray-500">Het kind met de meeste opvanguren telt als eerste kind en krijgt het hoogste percentage.</p>
          <ul className="mt-4 space-y-4">
            {r.kot.perKind.map((pk) => {
              const kind = r.kids.find((k) => k.id === pk.kindId)
              const maanden = kind?.opvang?.[0]?.maanden || MAANDEN_PER_JAAR
              return (
                <li key={pk.kindId} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium text-gray-900">
                      {kind?.naam} ({pk.rang === 1 ? 'eerste kind' : `kind ${pk.rang}`})
                    </h3>
                    <span className="text-sm tabular-nums text-gray-700">{formatPct(pk.pct, 1)} vergoed</span>
                  </div>
                  <DataTabel
                    className="mt-2"
                    bijschrift={`Kosten, toeslag en eigen bijdrage voor ${kind?.naam}`}
                    kop={['', 'Per maand', 'Per jaar']}
                    rijen={[
                      ['Kosten', formatEuro(pk.kostenPerJaar / maanden), formatEuro(pk.kostenPerJaar)],
                      ['Toeslag', formatEuro(pk.toeslagPerJaar / maanden), formatEuro(pk.toeslagPerJaar)],
                      ['Eigen bijdrage', formatEuro(pk.eigenBijdragePerJaar / maanden), formatEuro(pk.eigenBijdragePerJaar)],
                    ]}
                  />
                  {pk.aanvraagUiterlijk && (
                    <p className="mt-2 text-xs text-gray-600">
                      Aanvragen uiterlijk <strong className="font-medium">{formatDatum(pk.aanvraagUiterlijk)}</strong>.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {heeftInkomen && vergelijk.length === 2 && (
        <section aria-labelledby="vergelijk-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <h2 id="vergelijk-titel" className="text-base font-medium text-gray-900">
            {vergelijk[0].jaar} naast {vergelijk[1].jaar}
          </h2>
          <p className="mt-1 text-xs text-gray-500">Dezelfde opvang en hetzelfde inkomen, met de bedragen en tabellen van elk jaar.</p>
          <DataTabel
            className="mt-3"
            bijschrift={`Toeslagen ${vergelijk[0].jaar} en ${vergelijk[1].jaar} naast elkaar`}
            kop={[
              '',
              ...vergelijk.map((v) => (
                <span key={v.jaar} className="inline-flex flex-col items-end gap-1">
                  {v.jaar}
                  {params(v.jaar).toeslagen.status !== 'definitief' && <StatusBadge status={params(v.jaar).toeslagen.status} klein tooltipKant="rechts" />}
                </span>
              )),
            ]}
            rijen={[
              ['Toetsingsinkomen', ...vergelijk.map((v) => formatEuro(v.inkomen))],
              ['Percentage eerste kind', ...vergelijk.map((v) => (v.kot.perKind[0] ? formatPct(v.kot.perKind[0].pct, 1) : '–'))],
              ['Kinderopvangtoeslag', ...vergelijk.map((v) => formatEuro(v.kot.totaal))],
              ['Eigen bijdrage', ...vergelijk.map((v) => formatEuro(v.kot.perKind.reduce((s, k) => s + k.eigenBijdragePerJaar, 0)))],
              ['Kindgebonden budget', ...vergelijk.map((v) => formatEuro(v.kgb.bedrag))],
              ['Kinderbijslag', ...vergelijk.map((v) => formatEuro(v.kb.totaal))],
              [<strong key="t">Samen</strong>, ...vergelijk.map((v) => <strong key={v.jaar}>{formatEuro(v.totaal)}</strong>)],
            ]}
          />
        </section>
      )}

      <section aria-labelledby="stelsel-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="stelsel-titel" className="text-base font-medium text-gray-900">
            Vanaf 2029: kinderopvang bijna gratis voor werkende ouders
          </h2>
          <StatusBadge status="voorstel" />
        </div>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-700">
          <p>
            Het kabinet wil de kinderopvangtoeslag per 1 januari 2029 vervangen door directe financiering. Werkende ouders krijgen dan 95,6% van de maximum uurprijs
            vergoed, los van hun inkomen. Het geld gaat rechtstreeks naar de opvang, zodat je geen toeslag meer aanvraagt en achteraf ook niets hoeft terug te betalen.
          </p>
          <p>
            Je betaalt zelf de rest van de maximum uurprijs en alles wat de opvang daarboven rekent. Dit is een wetsvoorstel en kan nog veranderen; de berekening hierboven
            gaat uit van de toeslag zoals die in {jaar} geldt.
          </p>
        </div>
      </section>

      {heeftInkomen && (
        <Disclosure titel="Zo is het berekend" subtitel="Toeslag per kind, kindgebonden budget en kinderbijslag" defaultOpen={false}>
          <UitlegLijst regels={[...r.kot.uitleg, ...r.kgb.uitleg, ...r.kb.uitleg]} aria-label="Berekening van de toeslagen" />
        </Disclosure>
      )}
    </>
  )

  return <CalculatorGrid invoer={invoer} resultaat={resultaat} details={details} />
}
