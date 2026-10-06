'use client'

import { useMemo, useState } from 'react'
import { Briefcase, Calculator, CalendarClock, Landmark, PiggyBank, Scale, ShieldAlert } from 'lucide-react'
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId, Status } from '@/lib/tax/types'
import { berekenDossier } from '@/lib/dossier/bereken'
import { getJaar } from '@/lib/tax/years'
import { belastingpot } from '@/lib/tax/modules/planning/belastingpot'
import { whatIf, extraInvestering, extraLijfrente, box3Variant } from '@/lib/tax/modules/planning/whatif'
import { vergelijkRechtsvorm } from '@/lib/tax/modules/planning/rechtsvorm'
import { berekenMiddeling } from '@/lib/tax/modules/planning/middeling'
import { berekenBox1 } from '@/lib/tax/modules/box1'
import { beoordeelArbeidsrelatie } from '@/lib/tax/modules/arbeidsrelatie'
import { Alert, ChipGroup, Disclosure, Section, StatLijst, StatRow, StatusBadge, UitlegLijst, WaarschuwingLijst, formatDatum, formatEuro, formatPct } from '@/components/ui'
import { Bedrag, Getal, Rij } from './velden'
import { persoonNaam } from './secties/types'
import { Disclaimer } from './Disclaimer'
import type { DossierStatus } from '@/lib/dossier/status'
import { useAangifteStaatContext } from './useAangifteStaat'
import { VoorlopigeAanslagSectie } from './planning/VoorlopigeAanslagSectie'
import { OpDezePagina, type OpDezePaginaItem } from './planning/OpDezePagina'
import { TerugvraagSectie } from './bronbelasting/TerugvraagSectie'
import { renteSchattingUitleg, renteStatusUitleg } from './planning/va-tekst'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'

export interface PlanningProps {
  jaar: number
  invoer: HuishoudenInvoer
  variant: string | null
  varianten: Array<{ id: string; label: string; status: Status }>
  /** Andere jaren uit het dossier (voor middeling). */
  andereJaren: Array<{ jaar: number; variant: string | null; invoer: HuishoudenInvoer }>
  /** ISO-datum van vandaag (van de server, zodat server en browser hetzelfde tonen). */
  vandaag: string
  /** Ronde 2 (A2): status van het jaar; bepaalt met `vandaag` de fase van de sectie Voorlopige aanslag. */
  status?: DossierStatus
  /** Ronde 2 (A2): moment waarop het jaar op Ingediend is gezet (schatting van de indieningsdatum). */
  ingediendOp?: string | null
}

const box1Totaal = (jaar: number, inkomen: number) => berekenBox1(inkomen, 0, { params: getJaar(jaar), aowBereikt: false, geborenVoor1946: false }).totaal

export function Planning({ jaar, invoer, variant, varianten, andereJaren, vandaag, status = 'concept', ingediendOp }: PlanningProps) {
  const v = variant ?? undefined
  const params = useMemo(() => getJaar(jaar, v), [jaar, v])
  const resultaat = useMemo<HuishoudenResultaat | null>(() => {
    try {
      return berekenDossier({ ...invoer, variant: v }, { variant: v })
    } catch {
      return null
    }
  }, [invoer, v])
  const naam = (id: string) => persoonNaam(invoer.personen.find((p) => p.id === id) ?? { id })
  const personen = invoer.personen.map((p) => ({ value: p.id, label: persoonNaam(p) }))

  // Belastingpot
  const huidigJaar = Number(vandaag.slice(0, 4))
  const standaardMaanden = jaar < huidigJaar ? 12 : jaar > huidigJaar ? 0 : Number(vandaag.slice(5, 7)) - 1
  const [saldoPot, setSaldoPot] = useState<number | undefined>(undefined)
  const [maanden, setMaanden] = useState<number | undefined>(standaardMaanden)
  // Ronde 2 (A2): de verwachte datum van de aanslag staat in de aangiftestaat (provider van de pagina) en wordt gezet in
  // de sectie Voorlopige aanslag en belastingrente.
  const aangifteStaat = useAangifteStaatContext()
  const aanslagdatum = aangifteStaat.staat.planning?.verwachteDagtekening

  // Scenario's
  const [scenarioPersoon, setScenarioPersoon] = useState<PersoonId>(invoer.personen[0]?.id ?? 'A')
  const [extraLijf, setExtraLijf] = useState<number | undefined>(undefined)
  const [extraInv, setExtraInv] = useState<number | undefined>(undefined)

  // Rechtsvorm
  const ondernemers = invoer.personen.filter((p) => p.ondernemingen.length > 0)
  const [bvPersoon, setBvPersoon] = useState<PersoonId>(ondernemers[0]?.id ?? 'A')
  const [dgaLoon, setDgaLoon] = useState<number | undefined>(params.box2.waarde.gebruikelijkLoonNorm)
  const [kostenBV, setKostenBV] = useState<number | undefined>(undefined)
  const [dividend, setDividend] = useState<number | undefined>(undefined)
  const [opgepot, setOpgepot] = useState<number | undefined>(undefined)

  // Middeling
  const middeling = params.overig.waarde.middeling
  const middelingJaar = middeling.laatsteTijdvak[2] === jaar
  const [handmatig, setHandmatig] = useState<Record<string, number | undefined>>({})

  if (!resultaat) {
    return <Alert variant="let-op">De berekening lukt niet met de opgeslagen invoer. Controleer de invoer van dit jaar.</Alert>
  }

  const voorlopig = resultaat.personen.reduce((s, p) => s + p.voorlopigeAanslag + p.zvw.voorlopig, 0)
  const pot = belastingpot({
    verschuldigdIB: resultaat.totaal.verschuldigdIB,
    verschuldigdZvw: resultaat.totaal.verschuldigdZvw,
    voorlopigBetaald: voorlopig,
    saldoPot: saldoPot ?? 0,
    maandenVerstreken: maanden ?? 0,
    params,
    jaar,
    verwachteAanslagdatum: aanslagdatum,
    personen: resultaat.personen.map((p) => ({ id: p.id, teBetalenIB: p.aanslag ? p.aanslag.teBetalen : p.teBetalenIB, teBetalenZvw: p.zvw.teBetalen })),
    vandaag,
  })

  const opties = { variant: v, params }
  const lijfScenario = extraLijf && extraLijf > 0 ? whatIf(invoer, extraLijfrente(scenarioPersoon, extraLijf), berekenDossier, opties) : null
  const heeftOnderneming = invoer.personen.find((p) => p.id === scenarioPersoon)?.ondernemingen.length
  const invScenario = extraInv && extraInv > 0 && heeftOnderneming ? whatIf(invoer, extraInvestering(scenarioPersoon, extraInv), berekenDossier, opties) : null
  const variantScenarios = varianten
    .filter((x) => x.id !== variant)
    .map((x) => ({ ...x, uitkomst: whatIf({ ...invoer, variant: v }, box3Variant(x.id), berekenDossier, opties) }))
  if (variant) {
    variantScenarios.unshift({ id: '', label: 'Standaard', status: getJaar(jaar).status, uitkomst: whatIf({ ...invoer, variant: v }, box3Variant(undefined), berekenDossier, opties) })
  }

  const rechtsvorm =
    ondernemers.length > 0
      ? vergelijkRechtsvorm(
          { invoer: { ...invoer, variant: v }, persoon: bvPersoon, dgaLoon: dgaLoon ?? 0, kostenBV: kostenBV ?? 0, dividendUitkering: dividend ?? 0, opgepotVermogen: opgepot ?? 0 },
          berekenDossier,
          opties,
        )
      : null

  const arbeid = invoer.personen.flatMap((p) =>
    p.ondernemingen
      .filter((o) => (o.opdrachtgevers ?? []).length > 0)
      .map((o) => ({ persoon: p, onderneming: o, uitkomst: beoordeelArbeidsrelatie(o.opdrachtgevers ?? [], { params, jaar, urenOnderneming: o.uren.onderneming }) })),
  )

  const resultaatAnderJaar = (j: number): HuishoudenResultaat | null => {
    const a = andereJaren.find((x) => x.jaar === j)
    if (!a) return null
    try {
      return berekenDossier({ ...a.invoer, variant: a.variant ?? undefined }, { variant: a.variant ?? undefined, zonderMarginaleDruk: true })
    } catch {
      return null
    }
  }
  const middelJaren = middelingJaar ? [jaar - 2, jaar - 1] : []
  const anderResultaat = Object.fromEntries(middelJaren.map((j) => [j, resultaatAnderJaar(j)]))

  const opDezePagina: OpDezePaginaItem[] = [
    { id: 'voorlopige-aanslag', label: 'Voorlopige aanslag' },
    { id: 'belastingpot', label: 'Belastingpot' },
    { id: 'terugvragen', label: 'Terugvragen in het buitenland', alleenAlsAanwezig: true },
    { id: 'scenarios', label: 'Wat als' },
    { id: 'jaarruimte', label: 'Jaarruimte' },
    { id: 'rechtsvorm', label: 'Rechtsvorm' },
    { id: 'arbeidsrelatie', label: 'Arbeidsrelatie' },
    ...(middelingJaar ? [{ id: 'middeling', label: 'Middeling' }] : []),
  ]

  return (
    <div className="space-y-6">
      <OpDezePagina items={opDezePagina} />
      <VoorlopigeAanslagSectie jaar={jaar} invoer={invoer} resultaat={resultaat} params={params} vandaag={vandaag} status={status} ingediendOp={ingediendOp} />
      <Section id="belastingpot" icon={<PiggyBank />} title="Belastingpot" subtitle="Hoeveel moet er opzij voor de aanslag, en wat kost uitstel aan belastingrente?" value={formatEuro(pot.doel)}>
        <div className="space-y-5">
          <Rij>
            <Bedrag label="Saldo in je belastingpot" value={saldoPot} onChange={setSaldoPot} />
            <Getal label="Maanden verstreken" suffix="mnd" max={12} value={maanden} onChange={setMaanden} hint={`Voor ${jaar} gaan we uit van ${standaardMaanden}.`} />
          </Rij>
          <StatLijst>
            <StatRow label="Doel van de pot" bedrag={pot.doel} toelichting={`Verschuldigd min ${formatEuro(voorlopig)} voorlopige aanslagen`} />
            <StatRow label={`Nodig na ${maanden ?? 0} maanden`} bedrag={pot.doelNu} />
            <StatRow label="Achterstand" bedrag={pot.achterstand} />
            <StatRow label="Opzij zetten per resterende maand" bedrag={pot.perMaandRest} nadruk />
            <StatRow
              label={`Belastingrente vanaf ${formatDatum(pot.renteVanaf)}`}
              bedrag={pot.renteRisico}
              status={pot.renteStatus}
              statusUitleg={renteSchattingUitleg(BELASTINGRENTE_IB) ?? undefined}
              toelichting={aanslagdatum ? `Bij een aanslag op ${formatDatum(aanslagdatum)}, per persoon` : 'Per jaar dat de aanslag later komt, per persoon'}
            />
          </StatLijst>
          <p className="text-xs text-gray-500">
            De verwachte datum van de aanslag en de rente per persoon staan bij{' '}
            <a href="#voorlopige-aanslag" className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline">
              Voorlopige aanslag en belastingrente
            </a>
            .
          </p>
          <WaarschuwingLijst waarschuwingen={pot.waarschuwingen} />
          <Disclosure variant="kaal" titel="Zo is het berekend">
            <UitlegLijst regels={pot.uitleg} statusUitleg={renteStatusUitleg(BELASTINGRENTE_IB)} />
          </Disclosure>
        </div>
      </Section>

      <TerugvraagSectie invoer={invoer} resultaat={resultaat} params={params} vandaag={vandaag} />
      <Section id="scenarios" icon={<Calculator />} title="Wat als?" subtitle="Het netto effect van een extra inleg of investering, inclusief Zvw en toeslagen">
        <div className="space-y-5">
          {personen.length > 1 && <ChipGroup<PersoonId> label="Voor wie" kolommen={2} value={scenarioPersoon} onChange={setScenarioPersoon} options={personen} />}
          <Rij>
            <Bedrag label="Extra lijfrentepremie" value={extraLijf} onChange={setExtraLijf} hint="Lijfrente is persoonlijk en blijft bij deze persoon." />
            <Bedrag label="Extra investering in december" value={extraInv} onChange={setExtraInv} hint={heeftOnderneming ? 'Met kleinschaligheidsinvesteringsaftrek in de eerste onderneming.' : 'Deze persoon heeft geen onderneming.'} />
          </Rij>
          {lijfScenario && <ScenarioUitkomst titel={`Extra lijfrente ${formatEuro(extraLijf ?? 0)}`} uitkomst={lijfScenario} />}
          {invScenario && <ScenarioUitkomst titel={`Extra investering ${formatEuro(extraInv ?? 0)}`} uitkomst={invScenario} />}
          {variantScenarios.map((s) => (
            <ScenarioUitkomst key={s.id} titel={`Rekenen met: ${s.label}`} status={s.status} uitkomst={s.uitkomst} />
          ))}
        </div>
      </Section>

      <Section id="jaarruimte" icon={<CalendarClock />} title="Jaarruimte en reserveringsruimte" subtitle="Per jaar de ruimte voor lijfrente-inleg en wanneer die vervalt">
        <div className="space-y-6">
          {resultaat.personen.map((p) => {
            const tabel = p.inkomensvoorziening.tabel
            const restJaar = tabel[0]?.resterend ?? 0
            const benutReservering = tabel.slice(1).reduce((s, t) => s + t.ditJaarBenut, 0)
            const restReservering = Math.max(0, Math.min(p.inkomensvoorziening.reserveringsruimte - benutReservering, tabel.slice(1).reduce((s, t) => s + t.resterend, 0)))
            const nogRuimte = restJaar + restReservering
            return (
              <div key={p.id}>
                <h3 className="mb-2 text-sm font-medium text-gray-900">{naam(p.id)}</h3>
                <StatLijst>
                  <StatRow label={`Jaarruimte ${jaar}`} bedrag={p.inkomensvoorziening.jaarruimte} status={params.inkomensvoorziening.status} />
                  <StatRow label="Reserveringsruimte" bedrag={p.inkomensvoorziening.reserveringsruimte} />
                  <StatRow label="Al ingelegd en aftrekbaar" bedrag={p.inkomensvoorziening.lijfrenteAftrek} />
                  <StatRow label={`Nog ruimte vóór 31 december ${jaar}`} bedrag={nogRuimte} nadruk />
                </StatLijst>
                {tabel.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <caption className="sr-only">Jaarruimte per jaar van {naam(p.id)}</caption>
                      <thead className="text-xs text-gray-500">
                        <tr>
                          <th scope="col" className="py-2 pr-3 font-medium">Jaar</th>
                          <th scope="col" className="py-2 pr-3 text-right font-medium">Ruimte</th>
                          <th scope="col" className="py-2 pr-3 text-right font-medium">Nog open</th>
                          <th scope="col" className="py-2 pr-3 text-right font-medium">Nu benut</th>
                          <th scope="col" className="py-2 pr-3 text-right font-medium">Resterend</th>
                          <th scope="col" className="py-2 text-right font-medium">Vervalt na</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 tabular-nums">
                        {tabel.map((t) => (
                          <tr key={t.jaar} className={t.resterend > 0 && t.vervaltNa <= jaar ? 'bg-amber-50' : undefined}>
                            <td className="py-2 pr-3">{t.jaar}</td>
                            <td className="py-2 pr-3 text-right">{formatEuro(t.jaarruimte)}</td>
                            <td className="py-2 pr-3 text-right">{formatEuro(t.nietBenutBegin)}</td>
                            <td className="py-2 pr-3 text-right">{formatEuro(t.ditJaarBenut)}</td>
                            <td className="py-2 pr-3 text-right">{formatEuro(t.resterend)}</td>
                            <td className="py-2 text-right">{t.vervaltNa}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {nogRuimte > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setScenarioPersoon(p.id)
                      setExtraLijf(nogRuimte)
                      document.getElementById('scenarios')?.scrollIntoView({ block: 'start' })
                    }}
                    className="mt-3 text-sm font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline"
                  >
                    Reken het effect van {formatEuro(nogRuimte)} extra inleg door
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <Section id="rechtsvorm" icon={<Scale />} title="Eenmanszaak of BV" subtitle="Indicatieve vergelijking met de cijfers van dit jaar">
        {rechtsvorm ? (
          <div className="space-y-5">
            {ondernemers.length > 1 && (
              <ChipGroup<PersoonId> label="Onderneming van" kolommen={2} value={bvPersoon} onChange={setBvPersoon} options={ondernemers.map((p) => ({ value: p.id, label: persoonNaam(p) }))} />
            )}
            <Rij>
              <Bedrag label="Loon als dga" value={dgaLoon} onChange={setDgaLoon} hint={`Gebruikelijk loon: minimaal ${formatEuro(params.box2.waarde.gebruikelijkLoonNorm)}.`} />
              <Bedrag label="Extra kosten van de BV per jaar" value={kostenBV} onChange={setKostenBV} hint="Administratie, jaarrekening, notaris." />
              <Bedrag label="Dividenduitkering" value={dividend} onChange={setDividend} />
              <Bedrag label="Vermogen dat in de BV blijft" value={opgepot} onChange={setOpgepot} hint="Voor de box 3-besparing." />
            </Rij>
            <StatLijst>
              <StatRow label="Netto eenmanszaak" bedrag={rechtsvorm.eenmanszaak.netto} />
              <StatRow label="Netto BV (privé)" bedrag={rechtsvorm.bv.netto} />
              <StatRow label={rechtsvorm.verschil >= 0 ? 'BV voordeliger' : 'Eenmanszaak voordeliger'} bedrag={Math.abs(rechtsvorm.verschil)} nadruk />
            </StatLijst>
            <WaarschuwingLijst waarschuwingen={rechtsvorm.waarschuwingen} />
            <Disclosure variant="kaal" titel="Zo is het berekend">
              <UitlegLijst regels={rechtsvorm.uitleg} />
            </Disclosure>
          </div>
        ) : (
          <p className="text-sm text-gray-600">Er is geen onderneming ingevuld; een vergelijking met een BV is dan niet zinvol.</p>
        )}
      </Section>

      <Section
        id="arbeidsrelatie"
        icon={<ShieldAlert />}
        title="Arbeidsrelatie"
        subtitle="Aandachtspunten per opdrachtgever. Geen oordeel over schijnzelfstandigheid."
        actie={params.arbeidsrelatie.status !== 'definitief' ? <StatusBadge status={params.arbeidsrelatie.status} klein tooltipKant="rechts" /> : undefined}
      >
        {arbeid.length === 0 ? (
          <p className="text-sm text-gray-600">Vul bij een onderneming de opdrachtgevers in om aandachtspunten te zien.</p>
        ) : (
          <div className="space-y-5">
            {arbeid.map(({ persoon, onderneming, uitkomst }) => (
              <div key={`${persoon.id}-${onderneming.naam}`}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Briefcase aria-hidden="true" className="h-4 w-4 text-gray-500" />
                  {onderneming.naam} ({persoonNaam(persoon)})
                </h3>
                <StatLijst>
                  <StatRow label="Opdrachtgevers met omzet" bedrag={String(uitkomst.aantalOpdrachtgevers)} />
                  <StatRow label="Grootste opdrachtgever" bedrag={formatPct(uitkomst.grootsteAandeel, 0)} toelichting="Deel van de omzet" />
                  {uitkomst.laagsteUurtarief !== null && <StatRow label="Laagste uurtarief" bedrag={formatEuro(uitkomst.laagsteUurtarief, { decimalen: 2 })} />}
                </StatLijst>
                <WaarschuwingLijst waarschuwingen={uitkomst.waarschuwingen} className="mt-3" />
              </div>
            ))}
          </div>
        )}
      </Section>

      {middelingJaar && (
        <Section id="middeling" icon={<Landmark />} title={`Middeling ${middeling.laatsteTijdvak.join(', ')}`} subtitle="Teruggaaf als je inkomen over drie jaar sterk wisselde" actie={params.overig.status !== 'definitief' ? <StatusBadge status={params.overig.status} klein /> : undefined}>
          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              Dit is het laatste tijdvak waarin middeling kan. We rekenen belasting en premie box 1 zonder heffingskortingen opnieuw uit op het gemiddelde inkomen. Jaren die niet in je dossier staan, vul je hieronder in.
            </p>
            {resultaat.personen.map((p) => {
              const jaren = [
                ...middelJaren.map((j) => {
                  const r = anderResultaat[j]
                  const uitDossier = r?.personen.find((x) => x.id === p.id)?.box1.inkomen
                  const inkomen = uitDossier ?? handmatig[`${p.id}-${j}`] ?? 0
                  return { jaar: j, box1Inkomen: inkomen, box1BelastingEnPremie: box1Totaal(j, inkomen), uitDossier: uitDossier !== undefined }
                }),
                { jaar, box1Inkomen: p.box1.inkomen, box1BelastingEnPremie: box1Totaal(jaar, p.box1.inkomen), uitDossier: true },
              ]
              const m = berekenMiddeling(jaren, box1Totaal, { params })
              return (
                <div key={p.id}>
                  <h3 className="mb-2 text-sm font-medium text-gray-900">{naam(p.id)}</h3>
                  <Rij kolommen={3}>
                    {jaren.map((j) =>
                      j.uitDossier ? (
                        <div key={j.jaar} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-sm">
                          <p className="text-xs text-gray-500">Box 1-inkomen {j.jaar} (uit je dossier)</p>
                          <p className="mt-1 font-medium tabular-nums text-gray-900">{formatEuro(j.box1Inkomen)}</p>
                        </div>
                      ) : (
                        <Bedrag key={j.jaar} label={`Box 1-inkomen ${j.jaar}`} negatief value={handmatig[`${p.id}-${j.jaar}`]} onChange={(n) => setHandmatig((h) => ({ ...h, [`${p.id}-${j.jaar}`]: n }))} />
                      ),
                    )}
                  </Rij>
                  <StatLijst className="mt-3">
                    <StatRow label="Teruggaaf door middeling" bedrag={m.teruggaaf} nadruk />
                  </StatLijst>
                  <WaarschuwingLijst waarschuwingen={m.waarschuwingen} className="mt-3" />
                  {m.uitleg.length > 0 && (
                    <Disclosure variant="kaal" titel="Zo is het berekend">
                      <UitlegLijst regels={m.uitleg} />
                    </Disclosure>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}
      <Disclaimer />
    </div>
  )
}

function ScenarioUitkomst({ titel, uitkomst, status }: { titel: string; uitkomst: ReturnType<typeof whatIf>; status?: Status }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-900">{titel}</h3>
        {status && status !== 'definitief' && <StatusBadge status={status} klein tooltipKant="rechts" />}
      </div>
      <StatLijst>
        <StatRow label="Inkomstenbelasting" bedrag={uitkomst.verschilIB} variant={uitkomst.verschilIB > 0 ? 'plus' : 'min'} />
        <StatRow label="Zvw" bedrag={uitkomst.verschilZvw} variant={uitkomst.verschilZvw > 0 ? 'plus' : 'min'} />
        <StatRow label="Toeslagen" bedrag={uitkomst.verschilToeslagen} variant={uitkomst.verschilToeslagen >= 0 ? 'plus' : 'min'} />
        <StatRow label={uitkomst.nettoEffect >= 0 ? 'Netto voordeel' : 'Netto nadeel'} bedrag={Math.abs(uitkomst.nettoEffect)} variant="totaal" />
      </StatLijst>
    </div>
  )
}
