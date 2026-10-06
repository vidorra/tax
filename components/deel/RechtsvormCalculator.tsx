'use client'

import { Briefcase, Building2, Repeat, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
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
import { formatEuro, formatPct } from '@/components/ui/format'
import { berekenHuishouden } from '@/lib/tax/engine'
import { vergelijkRechtsvorm } from '@/lib/tax/modules/planning/rechtsvorm'
import type { RechtsvormUitkomst } from '@/lib/tax/modules/planning/rechtsvorm'
import type { PersoonInvoer } from '@/lib/tax/types'
import { STANDAARD_JAAR } from '@/lib/tax/years'
import { JaarKeuze } from './JaarKeuze'
import { CalculatorGrid, DataTabel, Disclaimer } from './Opbouw'
import { eenvoudigHuishouden, eenvoudigePersoon } from './invoer'
import { DEEL_JAREN, jaarLabel, jaarStatus, params } from './jaren'

/** Vergelijking voor het lopende jaar en later (oudere jaren zijn voor een overstap niet meer relevant). */
const RECHTSVORM_JAREN = DEEL_JAREN.filter((j) => j >= STANDAARD_JAAR)

const n = (x: number | null | undefined): number => x ?? 0
const uitlegBedrag = (u: RechtsvormUitkomst, id: string): number => u.uitleg.find((r) => r.id === id)?.bedrag ?? 0

interface Invoer {
  winst: number
  dgaLoon: number | null
  kostenBV: number
  dividend: number
  opgepot: number
  rendementPct: number | null
  partner: boolean
  partnerLoon: number | null
  forStand: number
  stakingswinst: number
}

function vergelijk(jaar: number, variant: string, x: Invoer, metStaking: boolean): RechtsvormUitkomst {
  const p = params(jaar, variant)
  const personen: PersoonInvoer[] = [
    eenvoudigePersoon('A', {
      winst: x.winst,
      jaar,
      params: p,
      onderneming: {
        for: x.forStand > 0 ? { stand: x.forStand } : undefined,
        staking: metStaking && x.stakingswinst > 0 ? { stakingswinst: x.stakingswinst } : undefined,
      },
    }),
  ]
  if (x.partner) personen.push(eenvoudigePersoon('B', { loon: x.partnerLoon, jaar, params: p }))
  return vergelijkRechtsvorm(
    {
      invoer: eenvoudigHuishouden(jaar, personen, { variant }),
      persoon: 'A',
      dgaLoon: x.dgaLoon ?? p.box2.waarde.gebruikelijkLoonNorm,
      kostenBV: x.kostenBV,
      opgepotVermogen: x.opgepot,
      verwachtRendement: x.rendementPct === null ? undefined : x.rendementPct / 100,
      dividendUitkering: x.dividend,
    },
    berekenHuishouden,
    { variant: variant || undefined },
  )
}

export function RechtsvormCalculator() {
  const [jaar, setJaar] = useState(STANDAARD_JAAR)
  const [variant, setVariant] = useState('')
  const [winst, setWinst] = useState<number | null>(null)
  const [dgaLoon, setDgaLoon] = useState<number | null>(null)
  const [kostenBV, setKostenBV] = useState<number | null>(null)
  const [dividend, setDividend] = useState<number | null>(null)
  const [opgepot, setOpgepot] = useState<number | null>(null)
  const [rendementPct, setRendementPct] = useState<number | null>(null)
  const [partner, setPartner] = useState(false)
  const [partnerLoon, setPartnerLoon] = useState<number | null>(null)
  const [forStand, setForStand] = useState<number | null>(null)
  const [stakingswinst, setStakingswinst] = useState<number | null>(null)

  const v = params(jaar).varianten.length > 0 ? variant : ''
  const p = params(jaar, v)
  const norm = p.box2.waarde.gebruikelijkLoonNorm
  const normStatus = p.box2.veldStatus?.gebruikelijkLoonNorm ?? p.box2.status

  const x: Invoer | null = useMemo(
    () =>
      winst === null
        ? null
        : {
            winst,
            dgaLoon,
            kostenBV: n(kostenBV),
            dividend: n(dividend),
            opgepot: n(opgepot),
            rendementPct,
            partner,
            partnerLoon,
            forStand: n(forStand),
            stakingswinst: n(stakingswinst),
          },
    [winst, dgaLoon, kostenBV, dividend, opgepot, rendementPct, partner, partnerLoon, forStand, stakingswinst],
  )

  const uit = useMemo(() => (x ? vergelijk(jaar, v, x, false) : null), [x, jaar, v])
  const overstap = useMemo(() => {
    if (!x || !uit) return null
    const bron = x.stakingswinst > 0 ? vergelijk(jaar, v, x, true) : uit
    return { ...bron.overstap, belasting: uitlegBedrag(bron, 'rechtsvorm.overstap'), regel: bron.uitleg.find((r) => r.id === 'rechtsvorm.overstap') }
  }, [x, uit, jaar, v])

  const perJaar = useMemo(() => {
    if (!x) return []
    const rijen: Array<{ label: string; jaar: number; variant: string; verschil: number }> = []
    for (const j of RECHTSVORM_JAREN) {
      const opties = ['', ...params(j).varianten.map((vv) => vv.id)]
      for (const o of opties) rijen.push({ label: jaarLabel(j, o), jaar: j, variant: o, verschil: vergelijk(j, o, x, false).verschil })
    }
    return rijen
  }, [x])

  const ingehouden = uit ? uitlegBedrag(uit, 'rechtsvorm.bv.ingehouden') : 0
  const bvVoordeliger = uit ? uit.verschil >= 0 : false
  const uitleg = uit ? uit.uitleg.filter((r) => r.id !== 'rechtsvorm.overstap').concat(overstap?.regel ? [overstap.regel] : []) : []

  const invoer = (
    <>
      <Section icon={<Users />} title="Jaar en huishouden">
        <div className="space-y-5">
          <JaarKeuze jaar={jaar} onJaar={setJaar} variant={v} onVariant={setVariant} jaren={RECHTSVORM_JAREN} />
          <Toggle
            label="Fiscaal partner"
            description="In box 2 mogen partners samen tweemaal het lage tarief gebruiken."
            checked={partner}
            onChange={setPartner}
          />
          {partner && <MoneyInput label="Loon van je partner" value={partnerLoon} onChange={setPartnerLoon} hint="Optioneel; telt mee voor de heffing van het huishouden." />}
        </div>
      </Section>

      <Section icon={<Briefcase />} title="Je onderneming nu">
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label={`Verwachte winst ${jaar}`} value={winst} onChange={setWinst} hint="Winst vóór ondernemersaftrek, als eenmanszaak." wrapperClassName="sm:col-span-2" />
          <MoneyInput label="Oudedagsreserve (FOR)" value={forStand} onChange={setForStand} hint="Valt vrij bij de overstap." />
          <MoneyInput label="Stakingswinst" value={stakingswinst} onChange={setStakingswinst} hint="Bijvoorbeeld goodwill bij inbreng in de BV." />
        </div>
      </Section>

      <Section icon={<Building2 />} title="De BV" subtitle="Wat je jezelf betaalt en wat in de BV blijft.">
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput
            label="Loon als dga"
            value={dgaLoon ?? norm}
            onChange={setDgaLoon}
            hint={
              <span className="inline-flex flex-wrap items-center gap-1">
                Normbedrag gebruikelijk loon {jaar}: {formatEuro(norm)}
                {normStatus !== 'definitief' && <StatusBadge status={normStatus} klein tooltipKant="links" />}
              </span>
            }
            error={dgaLoon !== null && dgaLoon < norm ? `Lager dan het normbedrag van ${formatEuro(norm)}; dat accepteert de Belastingdienst meestal niet.` : undefined}
          />
          <MoneyInput label="Extra kosten BV per jaar" value={kostenBV} onChange={setKostenBV} hint="Administratie, jaarrekening, bank. Schat het zelf in." />
          <MoneyInput label="Dividend per jaar" value={dividend} onChange={setDividend} hint="Wat je naast je loon uit de BV haalt." />
          <MoneyInput label="Vermogen in de BV" value={opgepot} onChange={setOpgepot} hint="Spaargeld of beleggingen die je anders privé in box 3 zou hebben." />
          <NumberInput
            label="Verwacht rendement op dat vermogen"
            value={rendementPct}
            onChange={setRendementPct}
            decimalen={1}
            suffix="%"
            min={0}
            max={100}
            hint={`Leeg: het box 3-forfait voor overige bezittingen (${formatPct(p.box3.waarde.forfaitOverig)}).`}
          />
        </div>
      </Section>
    </>
  )

  const resultaat = (
    <>
      <ResultPanel titel={`Eenmanszaak of BV in ${jaarLabel(jaar, v)}`} kopExtra={jaarStatus(jaar, v) !== 'definitief' ? <StatusBadge status={jaarStatus(jaar, v)} tooltipKant="rechts" /> : undefined} live>
        <ResultBedrag
          label={uit ? (bvVoordeliger ? 'BV voordeliger per jaar' : 'Eenmanszaak voordeliger per jaar') : 'Verschil per jaar'}
          bedrag={uit ? Math.abs(uit.verschil) : null}
          leegTekst="Vul je verwachte winst in"
          toelichting={uit ? 'Inclusief wat in de BV blijft, na latere box 2-heffing' : undefined}
        />
        {uit && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Eenmanszaak</h3>
              <StatLijst aria-label="Eenmanszaak">
                <StatRow label="Winst" bedrag={n(winst)} />
                <StatRow label="Inkomstenbelasting en Zvw" bedrag={uit.eenmanszaak.belasting} variant="min" />
                <StatRow label="Netto" bedrag={uit.eenmanszaak.netto} variant="subtotaal" />
              </StatLijst>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">BV</h3>
              <StatLijst aria-label="BV">
                <StatRow label="Vennootschapsbelasting" bedrag={uit.bv.vpb} variant="min" />
                <StatRow label="Kosten BV" bedrag={uit.bv.kosten} variant="min" />
                <StatRow label="Belasting en Zvw op je loon" bedrag={uit.bv.box1 + uit.bv.zvw} variant="min" />
                <StatRow label="Box 2 over dividend" bedrag={uit.bv.box2} variant="min" />
                <StatRow label="Netto privé" bedrag={uit.bv.netto} variant="subtotaal" />
                {ingehouden !== 0 && <StatRow label="Blijft in de BV" bedrag={ingehouden} toelichting="Na Vpb, vóór box 2 bij latere uitkering" />}
              </StatLijst>
            </div>
          </div>
        )}
        <Alert variant="actie" titel="Indicatief" className="mt-4">
          Laat dit doorrekenen door een adviseur voordat je overstapt. Een BV brengt ook juridische en administratieve verplichtingen mee die hier niet in zitten.
        </Alert>
        <Disclaimer className="mt-3" />
      </ResultPanel>
      <MobileResultBar
        label={uit ? (bvVoordeliger ? 'BV voordeliger' : 'Eenmanszaak voordeliger') : 'Eenmanszaak of BV'}
        bedrag={uit ? Math.abs(uit.verschil) : null}
        toelichting={uit ? `per jaar, ${jaarLabel(jaar, v)}` : undefined}
        leegTekst="Vul je verwachte winst in"
      />
    </>
  )

  const details = uit ? (
    <>
      <WaarschuwingLijst waarschuwingen={uit.waarschuwingen} />

      {perJaar.length > 1 && (
        <section aria-labelledby="perjaar-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <h2 id="perjaar-titel" className="text-base font-medium text-gray-900">
            Verschil per jaar
          </h2>
          <p className="mt-1 text-xs text-gray-500">Dezelfde invoer, met de regels van elk jaar. Positief betekent dat de BV voordeliger is.</p>
          <DataTabel
            className="mt-3"
            bijschrift="Verschil tussen BV en eenmanszaak per jaar en voorstel"
            kop={['Jaar', 'Verschil']}
            rijen={perJaar.map((r) => [
              <span key="l" className="inline-flex flex-wrap items-center gap-1.5">
                {r.label}
                {jaarStatus(r.jaar, r.variant) !== 'definitief' && <StatusBadge status={jaarStatus(r.jaar, r.variant)} klein tooltipKant="links" />}
              </span>,
              formatEuro(r.verschil, { teken: true }),
            ])}
          />
        </section>
      )}

      {overstap && (
        <section aria-labelledby="overstap-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Repeat aria-hidden="true" className="h-4 w-4 text-primary" />
            <h2 id="overstap-titel" className="text-base font-medium text-gray-900">
              Eenmalig bij de overstap
            </h2>
          </div>
          <StatLijst className="mt-2" aria-label="Kosten van de overstap">
            <StatRow label="Stakingswinst" bedrag={overstap.stakingswinst} />
            <StatRow label="Vrijval oudedagsreserve" bedrag={overstap.forVrijval} />
            <StatRow label="Stakingsaftrek" bedrag={overstap.stakingsaftrek} variant="min" />
            <StatRow label="Belasting bij een gewone (ruisende) inbreng" bedrag={overstap.belasting} variant="totaal" toelichting="Indicatief, tegen het toptarief" />
          </StatLijst>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Bij een geruisloze inbreng schuif je deze belasting door naar later. Of dat kan en verstandig is, hangt af van je situatie.
          </p>
        </section>
      )}

      <Disclosure titel="Zo is het berekend" subtitel="Beide kanten stap voor stap" defaultOpen={false}>
        <UitlegLijst regels={uitleg} aria-label="Berekening eenmanszaak tegenover BV" />
      </Disclosure>
    </>
  ) : null

  return <CalculatorGrid invoer={invoer} resultaat={resultaat} details={details} />
}
