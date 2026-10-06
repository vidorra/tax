'use client'

import { History, PiggyBank, Receipt, User, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { Disclosure } from '@/components/ui/Disclosure'
import { MobileResultBar } from '@/components/ui/MobileResultBar'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ResultBedrag, ResultPanel } from '@/components/ui/ResultPanel'
import { Section } from '@/components/ui/Section'
import { StatLijst, StatRow } from '@/components/ui/StatRow'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { UitlegLijst } from '@/components/ui/UitlegLijst'
import { WaarschuwingLijst } from '@/components/ui/WaarschuwingLijst'
import { cn } from '@/components/ui/cn'
import { formatEuro, formatPct } from '@/components/ui/format'
import { berekenHuishouden } from '@/lib/tax/engine'
import { berekenInkomensvoorziening, berekenJaarruimte } from '@/lib/tax/modules/inkomensvoorziening'
import type { InkomensvoorzieningInvoer, LijfrenteHistorieJaar, Waarschuwing } from '@/lib/tax/types'
import { STANDAARD_JAAR } from '@/lib/tax/years'
import { lijfrenteParamsVoorJaar, lijfrenteStatusVoorJaar } from '@/lib/tax/years/lijfrente-historie'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { DatumVeld, isIsoDatum } from './DatumVeld'
import { JaarKeuze } from './JaarKeuze'
import { CalculatorGrid, DataTabel, Disclaimer } from './Opbouw'
import { STANDAARD_GEBOORTEDATUM, eenvoudigHuishouden, eenvoudigePersoon } from './invoer'
import { params } from './jaren'

type Correctie = 'geen' | 'factorA' | 'wtpPremie'

interface HistorieRij {
  inkomen: number | null
  jaarruimte: number | null
  alGebruikt: number | null
}

const LEGE_RIJ: HistorieRij = { inkomen: null, jaarruimte: null, alGebruikt: null }

const n = (x: number | null | undefined): number => x ?? 0

export function JaarruimteCalculator() {
  const [jaar, setJaar] = useState(STANDAARD_JAAR)
  const [geboortedatum, setGeboortedatum] = useState('')
  const [inkomen, setInkomen] = useState<number | null>(null)
  const [forToename, setForToename] = useState<number | null>(null)
  const [correctie, setCorrectie] = useState<Correctie>('geen')
  const [correctieBedrag, setCorrectieBedrag] = useState<number | null>(null)
  const [historie, setHistorie] = useState<Record<number, HistorieRij>>({})
  const [lijfrente, setLijfrente] = useState<number | null>(null)
  const [aov, setAov] = useState<number | null>(null)
  const [verwachteWinst, setVerwachteWinst] = useState<number | null>(null)
  const [voorbeeld, setVoorbeeld] = useState(false)

  const p = params(jaar)
  const lp = p.inkomensvoorziening.waarde.lijfrente
  const blokStatus = p.inkomensvoorziening.veldStatus?.lijfrente ?? p.inkomensvoorziening.status
  const historieJaren = useMemo(() => Array.from({ length: lp.terugkijkJaren }, (_, i) => jaar - 1 - i), [jaar, lp.terugkijkJaren])
  const geboorte = isIsoDatum(geboortedatum) ? geboortedatum : STANDAARD_GEBOORTEDATUM

  const iv: InkomensvoorzieningInvoer = useMemo(() => {
    const rijen: LijfrenteHistorieJaar[] = []
    for (const j of historieJaren) {
      const r = historie[j]
      if (!r || (r.jaarruimte === null && r.inkomen === null)) continue
      rijen.push({
        jaar: j,
        premiegrondslagInkomen: n(r.inkomen),
        alGebruikt: n(r.alGebruikt),
        jaarruimteOverride: r.jaarruimte ?? undefined,
      })
    }
    return {
      lijfrentePremies: n(lijfrente),
      aovPremies: n(aov),
      premiegrondslagInkomenVorigJaar: inkomen ?? undefined,
      forToenameVorigJaar: forToename ?? undefined,
      pensioencorrectieVorigJaar: correctie !== 'geen' && n(correctieBedrag) > 0 ? { type: correctie, bedrag: n(correctieBedrag) } : undefined,
      historie: rijen,
    }
  }, [historie, historieJaren, lijfrente, aov, inkomen, forToename, correctie, correctieBedrag])

  const res = useMemo(
    () => berekenInkomensvoorziening(iv, { params: p, jaar, geboortedatum: geboorte, historieParams: lijfrenteParamsVoorJaar }),
    [iv, p, jaar, geboorte],
  )

  const netto = useMemo(() => {
    if (verwachteWinst === null || n(lijfrente) <= 0) return null
    const reken = (inv: InkomensvoorzieningInvoer) => {
      const r = berekenHuishouden(
        eenvoudigHuishouden(jaar, [eenvoudigePersoon('A', { winst: verwachteWinst, jaar, params: p, geboortedatum: geboorte, inkomensvoorziening: inv })]),
        { zonderMarginaleDruk: true },
      )
      return r.totaal.verschuldigdIB + r.totaal.verschuldigdZvw
    }
    const met = reken(iv)
    const zonder = reken({ ...iv, lijfrentePremies: 0 })
    const besparing = zonder - met
    return { besparing, nettoKosten: n(lijfrente) - besparing, pct: besparing / n(lijfrente) }
  }, [verwachteWinst, lijfrente, iv, jaar, p, geboorte])

  const ruimte = res.jaarruimte + res.reserveringsruimte
  const nogOver = Math.max(0, ruimte - res.lijfrenteAftrek)
  const heeftInvoer = inkomen !== null || iv.historie!.length > 0
  const metRest = res.tabel.filter((r) => r.resterend > 0)
  const eerstVervallend = metRest.length > 0 ? Math.min(...metRest.map((r) => r.vervaltNa)) : null
  const ingevuld = iv.historie!.length
  const somOpen = res.tabel.filter((r) => r.jaar < jaar).reduce((s, r) => s + r.nietBenutBegin, 0)

  const waarschuwingen: Waarschuwing[] = [...res.waarschuwingen]
  if (correctie === 'factorA' && !lp.factorA.toegestaan) {
    waarschuwingen.push({ id: 'ui.factorA', ernst: 'let-op', tekst: `Voor ${jaar} telt factor A niet meer; vul de werkelijk betaalde pensioenpremie (Wtp) in.` })
  }

  function zetRij(j: number, veld: keyof HistorieRij, waarde: number | null) {
    setHistorie((h) => ({ ...h, [j]: { ...(h[j] ?? LEGE_RIJ), [veld]: waarde } }))
  }

  function laadVoorbeeld() {
    const v = voorbeeldInvoer()
    const ivx: InkomensvoorzieningInvoer = v.personen[0].inkomensvoorziening
    setJaar(v.jaar)
    setInkomen(ivx.premiegrondslagInkomenVorigJaar ?? null)
    setForToename(null)
    setCorrectie('geen')
    setCorrectieBedrag(null)
    setLijfrente(ivx.lijfrentePremies)
    setAov(ivx.aovPremies)
    const h: Record<number, HistorieRij> = {}
    for (const r of ivx.historie ?? []) h[r.jaar] = { inkomen: r.premiegrondslagInkomen, jaarruimte: r.jaarruimteOverride ?? null, alGebruikt: r.alGebruikt }
    setHistorie(h)
    setVoorbeeld(true)
  }

  const invoer = (
    <>
      <Section icon={<User />} title="Jaar en persoon" subtitle="De jaarruimte is persoonlijk: reken per partner apart.">
        <div className="space-y-5">
          <JaarKeuze jaar={jaar} onJaar={setJaar} />
          <DatumVeld
            label="Geboortedatum"
            value={geboortedatum}
            onChange={setGeboortedatum}
            hint={`Lijfrentepremie is aftrekbaar tot en met ${lp.maxJarenNaAOW} jaar na het jaar waarin je de AOW-leeftijd bereikt. Leeg laten: we rekenen met iemand ruim onder de AOW-leeftijd.`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secundair" grootte="sm" onClick={laadVoorbeeld}>
              Voorbeeld laden
            </Button>
            {voorbeeld && <span className="text-xs text-gray-500">Een verzonnen zzp&apos;er met een paar jaar lijfrente-inleg.</span>}
          </div>
        </div>
      </Section>

      <Section icon={<Wallet />} title={`Inkomen in ${jaar - 1}`} subtitle="Hiermee rekenen we de jaarruimte van dit jaar uit.">
        <div className="space-y-4">
          <MoneyInput
            label="Premiegrondslag-inkomen"
            value={inkomen}
            onChange={setInkomen}
            hint={`Winst uit onderneming vóór ondernemersaftrek en MKB-winstvrijstelling, plus loon, resultaat uit overig werk en periodieke uitkeringen over ${jaar - 1}.`}
          />
          <MoneyInput
            label="Toename oudedagsreserve (FOR)"
            value={forToename}
            onChange={setForToename}
            hint="Alleen als je in het jaar ervoor nog aan de FOR hebt toegevoegd (kon tot en met 2022)."
          />
          <ChipGroup<Correctie>
            label="Pensioenopbouw in loondienst"
            value={correctie}
            onChange={setCorrectie}
            kolommen={3}
            options={[
              { value: 'geen', label: 'Geen' },
              { value: 'factorA', label: 'Factor A', disabled: !lp.factorA.toegestaan && correctie !== 'factorA' },
              { value: 'wtpPremie', label: 'Wtp-premie' },
            ]}
            hint={
              lp.factorA.toegestaan
                ? `Factor A staat op je UPO; die telt ${lp.factorA.factor.toLocaleString('nl-NL')} keer. Valt je regeling onder de nieuwe pensioenwet, vul dan de betaalde premie in.`
                : 'Vul de pensioenpremie in die in het jaar ervoor voor jou is betaald (staat op je UPO).'
            }
          />
          {correctie !== 'geen' && (
            <MoneyInput label={correctie === 'factorA' ? 'Factor A' : 'Betaalde pensioenpremie'} value={correctieBedrag} onChange={setCorrectieBedrag} />
          )}
        </div>
      </Section>

      <Disclosure
        titel="Niet-gebruikte jaarruimte van de afgelopen tien jaar"
        subtitel={ingevuld > 0 ? `${ingevuld} jaar ingevuld, samen ${formatEuro(somOpen)} niet gebruikt` : 'Optioneel: geeft je reserveringsruimte'}
        rechts={<History aria-hidden="true" className="h-4 w-4 text-primary" />}
        defaultOpen={false}
      >
        <p className="mb-3 text-xs leading-relaxed text-gray-500">
          Neem de jaarruimte over uit je aangifte of het rapport van je adviseur. Weet je die niet, vul dan het inkomen van het jaar daarvoor in: we rekenen de jaarruimte
          dan uit met de regels van dat jaar.
        </p>
        <ol className="divide-y divide-gray-100">
          {historieJaren.map((j) => {
            const r = historie[j] ?? LEGE_RIJ
            const hp = lijfrenteParamsVoorJaar(j)
            const status = lijfrenteStatusVoorJaar(j)
            const berekend = hp && r.inkomen !== null ? berekenJaarruimte(hp, { inkomen: r.inkomen }).jaarruimte : null
            return (
              <li key={j} className="py-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                  {j}
                  {status && status !== 'definitief' && <StatusBadge status={status} klein tooltipKant="links" />}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <MoneyInput label="Jaarruimte" value={r.jaarruimte} onChange={(v) => zetRij(j, 'jaarruimte', v)} aria-label={`Jaarruimte ${j}`} />
                  <MoneyInput label="Al gebruikt" value={r.alGebruikt} onChange={(v) => zetRij(j, 'alGebruikt', v)} aria-label={`Al gebruikt van de jaarruimte ${j}`} />
                  <MoneyInput
                    label={`Of: inkomen ${j - 1}`}
                    value={r.inkomen}
                    onChange={(v) => zetRij(j, 'inkomen', v)}
                    aria-label={`Premiegrondslag-inkomen ${j - 1}, voor de jaarruimte ${j}`}
                    wrapperClassName="col-span-2 sm:col-span-1"
                    hint={berekend !== null && r.jaarruimte === null ? `Berekend: ${formatEuro(berekend)}` : undefined}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      </Disclosure>

      <Section icon={<PiggyBank />} title={`Inleg in ${jaar}`} subtitle="Wat je dit jaar betaalt of wilt betalen.">
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label="Lijfrente-inleg" value={lijfrente} onChange={setLijfrente} hint="Bijvoorbeeld een lijfrenterekening of -verzekering." />
          <MoneyInput label="AOV-premie" value={aov} onChange={setAov} hint="Premie arbeidsongeschiktheidsverzekering, volledig aftrekbaar." />
        </div>
      </Section>

      <Section icon={<Receipt />} title="Wat kost de inleg je netto?" subtitle="Optioneel: met je verwachte winst rekenen we de belastingbesparing uit.">
        <MoneyInput
          label={`Verwachte winst ${jaar}`}
          value={verwachteWinst}
          onChange={setVerwachteWinst}
          hint="Winst vóór ondernemersaftrek. We rekenen voor één persoon zonder fiscaal partner, met het urencriterium gehaald, met en zonder de lijfrente-inleg."
        />
        {netto && (
          <StatLijst className="mt-4" aria-label="Netto kosten van de inleg">
            <StatRow label="Lijfrente-inleg" bedrag={n(lijfrente)} />
            <StatRow label="Minder inkomstenbelasting en Zvw" bedrag={netto.besparing} variant="min" toelichting={`${formatPct(netto.pct, 1)} van de inleg`} status={p.status} />
            <StatRow label="Netto kosten" bedrag={netto.nettoKosten} variant="totaal" />
          </StatLijst>
        )}
        {verwachteWinst !== null && n(lijfrente) <= 0 && <p className="mt-3 text-xs text-gray-500">Vul een lijfrente-inleg in om de besparing te zien.</p>}
      </Section>
    </>
  )

  const resultaat = (
    <>
      <ResultPanel titel={`Lijfrenteruimte ${jaar}`} kopExtra={blokStatus !== 'definitief' ? <StatusBadge status={blokStatus} tooltipKant="rechts" /> : undefined} live>
        <ResultBedrag
          label="Jaarruimte plus reserveringsruimte"
          bedrag={heeftInvoer ? ruimte : null}
          leegTekst="Vul je inkomen van vorig jaar in"
          toelichting={heeftInvoer ? `Nog ${formatEuro(nogOver)} ruimte na je geplande inleg` : undefined}
        />
        <StatLijst className="mt-5" aria-label="Opbouw van de ruimte">
          <StatRow label={`Jaarruimte ${jaar}`} bedrag={res.jaarruimte} status={blokStatus} />
          <StatRow label="Reserveringsruimte" bedrag={res.reserveringsruimte} toelichting={`Maximaal ${formatEuro(lp.maxReserveringsruimte)} per jaar`} />
          <StatRow label="Lijfrente-inleg" bedrag={n(lijfrente)} />
          <StatRow label="Daarvan aftrekbaar" bedrag={res.lijfrenteAftrek} variant="subtotaal" />
          {res.nietAftrekbaar > 0 && <StatRow label="Niet aftrekbaar" bedrag={res.nietAftrekbaar} toelichting={`Saldomethode: tot ${formatEuro(lp.saldomethodeMax)} per jaar van de uitkering blijft onbelast`} />}
          {res.aovAftrek > 0 && <StatRow label="AOV-premie" bedrag={res.aovAftrek} />}
          <StatRow label="Totaal aftrek inkomensvoorzieningen" bedrag={res.totaal} variant="totaal" />
        </StatLijst>
        {netto && (
          <p className="mt-3 text-sm text-gray-700">
            Netto kost je inleg ongeveer <strong className="font-semibold tabular-nums">{formatEuro(netto.nettoKosten)}</strong>.
          </p>
        )}
        <Disclaimer className="mt-4" />
      </ResultPanel>
      <MobileResultBar
        label={`Lijfrenteruimte ${jaar}`}
        bedrag={heeftInvoer ? ruimte : null}
        toelichting={heeftInvoer ? `Aftrekbaar: ${formatEuro(res.lijfrenteAftrek)}` : undefined}
        leegTekst="Vul je inkomen van vorig jaar in"
      />
    </>
  )

  const details = (
    <>
      <WaarschuwingLijst waarschuwingen={waarschuwingen} />

      <section aria-labelledby="toerekening-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <h2 id="toerekening-titel" className="text-base font-medium text-gray-900">
          Toerekening per jaar
        </h2>
        <p className="mt-1 text-xs text-gray-500">Je inleg gaat eerst naar de oudste niet-gebruikte ruimte, daarna naar de jaarruimte van {jaar}.</p>
        <DataTabel
          className="mt-3"
          bijschrift="Niet-gebruikte jaarruimte per jaar, wat je inleg daarvan gebruikt en wanneer de rest vervalt"
          kop={['Jaar', 'Open', 'Nu gebruikt', 'Rest', 'Vervalt na']}
          rijen={res.tabel.map((r) => [
            <span key="j" className="inline-flex flex-wrap items-center gap-1.5">
              {r.jaar}
              {r.vervaltNa === eerstVervallend && r.resterend > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">vervalt eerst</span>}
            </span>,
            formatEuro(r.nietBenutBegin),
            formatEuro(r.ditJaarBenut),
            formatEuro(r.resterend),
            r.vervaltNa,
          ])}
          rijKlasse={(i) => cn(res.tabel[i].vervaltNa === eerstVervallend && res.tabel[i].resterend > 0 && 'bg-amber-50')}
        />
      </section>

      <Disclosure titel="Zo is het berekend" subtitel="Elke stap met de formule en de parameter" defaultOpen={false}>
        <UitlegLijst regels={res.uitleg} aria-label="Berekening van de lijfrenteaftrek" />
      </Disclosure>

    </>
  )

  return <CalculatorGrid invoer={invoer} resultaat={resultaat} details={details} />
}
