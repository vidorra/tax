'use client'

/**
 * Ronde 2 (A6): de auto van de zaak (taak-A6 9.4, ux 8.4). Youngtimer met het overgangsrecht van 2026 en de
 * btw-correctie privégebruik. Leeftijden, percentages en datums komen uit de parameters; de bedragen uit de engine
 * (`OndernemingResultaat.auto`). De dagwaarde staat er alleen als de auto dit jaar youngtimer is of wordt, of onder het
 * overgangsrecht valt; een ingevulde dagwaarde blijft staan. De btw-regel is ingeklapt.
 */
import type { AutoInvoer, AutoUitkomst, OndernemingInvoer, TaxYearParams } from '@/lib/tax/types'
import { isoDatum, parseDatum } from '@/lib/tax/datum'
import { standaardInSaldo } from '@/lib/tax/modules/onderneming/in-saldo'
import { btwCorrectieTekst, jaarIngebruikname, maandJaar } from '@/lib/tax/modules/onderneming/auto'
import { autoStand } from '@/lib/dossier/auto-velden'
import { ChipGroup, Disclosure, StatLijst, StatRow, Toggle, formatDatum, formatEuro, formatPct } from '@/components/ui'
import { Bedrag, Datum, Getal, Rij } from '../velden'
import { InSaldoRegel } from './WinstBronVraag'

export interface AutoBlokProps {
  onderneming: OndernemingInvoer
  pas: (fn: (x: OndernemingInvoer) => void) => void
  jaar: number
  params: TaxYearParams | null
  uitkomst: AutoUitkomst | undefined
  /** Veld-id voor een pad onder de onderneming, bijvoorbeeld 'auto.dagwaarde'. */
  veld: (pad: string) => string
}

const dagNa = (iso: string): string => {
  const d = parseDatum(iso)
  return isoDatum(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)))
}

function Pil({ children }: { children: string }) {
  return <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-xs font-medium text-gray-800">{children}</span>
}

export function AutoBlok({ onderneming: o, pas, jaar, params, uitkomst, veld }: AutoBlokProps) {
  const auto = o.auto
  if (!auto) return null
  const pasA = (fn: (a: AutoInvoer) => void) =>
    pas((x) => {
      if (x.auto) fn(x.auto)
    })
  const ap = params?.ondernemer.waarde.auto
  // Dezelfde stand als het zoekveld gebruikt (lib/dossier/auto-velden.ts): welke velden staan er en waarom.
  const { leeftijd, og, heelJaar, vanaf, overgang, youngtimer, toonDagwaarde, toonOvergang } = autoStand(auto, params, jaar)
  const overgangAan = overgang?.terBeschikking === 'ja' || overgang?.terBeschikking === 'aangenomen'
  const grensDag = og ? dagNa(og.terBeschikkingUiterlijk) : null
  const b = auto.btw
  const bp = ap?.btwPrive
  const afgeleidJaar = jaarIngebruikname({ ...auto, btw: b ? { ...b, jaarIngebruikname: undefined } : undefined }, o.activa)
  const detail = uitkomst?.btwDetail

  let pil: string | null = null
  if (uitkomst?.overgangsrecht) pil = 'Youngtimer met overgangsrecht'
  else if (heelJaar) pil = 'Youngtimer'
  else if (vanaf) pil = `Youngtimer vanaf ${maandJaar(vanaf)}`

  let youngtimerTekst: string | null = null
  if (leeftijd !== undefined && ap) {
    const perDag = 'We rekenen per maand; de Belastingdienst vanaf de dag erna, dus het bedrag kan iets verschillen.'
    if (heelJaar) youngtimerTekst = `Je auto is ${leeftijd} jaar of ouder. De bijtelling gaat dan over de dagwaarde.`
    else if (overgang && og)
      youngtimerTekst = `Je auto was eind ${og.youngtimerOp.slice(0, 4)} al ouder dan ${og.oudeLeeftijd} jaar. De grens is nu ${leeftijd} jaar. Stond hij toen al tot je beschikking, dan is hij met het overgangsrecht het hele jaar youngtimer.${vanaf ? ` Anders gaat de bijtelling vanaf ${maandJaar(vanaf)} over de dagwaarde. ${perDag}` : ''}`
    else if (vanaf) youngtimerTekst = `Je auto wordt dit jaar ${leeftijd} jaar. Vanaf ${maandJaar(vanaf)} gaat de bijtelling over de dagwaarde. ${perDag}`
  }

  return (
    <div className="space-y-4">
      <Rij>
        <Bedrag label="Cataloguswaarde" veld={veld('auto.cataloguswaarde')} value={auto.cataloguswaarde} onChange={(v) => pasA((x) => void (x.cataloguswaarde = v ?? 0))} />
        <div className="space-y-2">
          <Datum label="Datum eerste toelating" verplicht veld={veld('auto.datumEersteToelating')} value={auto.datumEersteToelating} onChange={(v) => pasA((x) => void (x.datumEersteToelating = v ?? ''))} />
          {pil && <Pil>{pil}</Pil>}
        </div>
      </Rij>
      {youngtimerTekst && <p className="text-sm text-gray-700">{youngtimerTekst}</p>}
      {toonDagwaarde && (
        <Rij>
          <Bedrag
            label="Dagwaarde op 1 januari"
            veld={veld('auto.dagwaarde')}
            hint={youngtimer ? 'De waarde in het economisch verkeer, bijvoorbeeld uit een taxatie of een koerslijst.' : `Telt niet mee: de auto is jonger dan ${leeftijd ?? ''} jaar.`}
            value={auto.dagwaarde}
            onChange={(v) => pasA((x) => (v === undefined ? delete x.dagwaarde : (x.dagwaarde = v)))}
          />
        </Rij>
      )}
      {toonOvergang && overgang && og && grensDag && (
        <div data-veld={veld('auto.youngtimerOvergang')}>
          <Toggle
            label={`De auto stond al vóór ${formatDatum(grensDag)} tot mijn beschikking`}
            description={
              overgangAan
                ? uitkomst?.overgangsrecht
                  ? `Dan geldt het overgangsrecht: het hele jaar ${formatPct(ap?.youngtimerPct ?? 0)} van de dagwaarde${auto.dagwaarde !== undefined ? ` (${formatEuro((ap?.youngtimerPct ?? 0) * auto.dagwaarde)})` : ''}.`
                  : 'Het overgangsrecht mag, maar hoeft niet. Zonder is de bijtelling hier niet hoger, dus rekenen we zonder.'
                : `Kwam de auto later, dan geldt de grens van ${leeftijd ?? ''} jaar.`
            }
            checked={overgangAan}
            onChange={(aan) =>
              pasA((x) => {
                if (aan) {
                  if (!x.terBeschikkingSinds || x.terBeschikkingSinds > og.terBeschikkingUiterlijk) {
                    if (jaar === Number(og.terBeschikkingUiterlijk.slice(0, 4)) + 1) delete x.terBeschikkingSinds
                    else x.terBeschikkingSinds = og.terBeschikkingUiterlijk
                  }
                } else if (!x.terBeschikkingSinds || x.terBeschikkingSinds <= og.terBeschikkingUiterlijk) {
                  x.terBeschikkingSinds = grensDag
                }
              })
            }
          />
        </div>
      )}
      <Rij>
        <Bedrag label="Autokosten in de winstberekening" veld={veld('auto.autokosten')} hint="Alle kosten van de auto die je zakelijk aftrok, met de afschrijving." value={auto.autokosten} onChange={(v) => pasA((x) => void (x.autokosten = v ?? 0))} />
        <Bedrag
          label="Privé betaalde autokosten"
          veld={veld('auto.eigenBijdrage')}
          hint="Wat je zelf betaalde voor het privégebruik. Gaat af van de bijtelling."
          value={auto.eigenBijdrage}
          onChange={(v) => pasA((x) => (v === undefined ? delete x.eigenBijdrage : (x.eigenBijdrage = v)))}
        />
        <Getal label="Privékilometers" suffix="km" veld={veld('auto.priveKm')} value={auto.priveKm} onChange={(v) => pasA((x) => void (x.priveKm = v))} />
      </Rij>
      <div data-veld={veld('auto.nulEmissie')}>
        <Toggle label="Elektrisch (nulemissie)" checked={auto.nulEmissie} onChange={(aan) => pasA((x) => void (x.nulEmissie = aan))} />
      </div>
      <div data-veld={veld('auto.rittenregistratie')}>
        <Toggle label="Sluitende rittenregistratie" checked={Boolean(auto.rittenregistratie)} onChange={(aan) => pasA((x) => void (x.rittenregistratie = aan))} />
      </div>
      <Disclosure
        variant="kaal"
        titel="Niet het hele jaar ter beschikking"
        subtitel="Gekocht, verkocht of naar privé in de loop van het jaar"
        defaultOpen={Boolean(auto.terBeschikkingTot) || Boolean(auto.terBeschikkingSinds?.startsWith(`${jaar}-`))}
      >
        <Rij className="pt-2">
          <Datum
            label="Ter beschikking sinds"
            veld={veld('auto.terBeschikkingSinds')}
            hint="Leeg: al vóór dit jaar."
            value={auto.terBeschikkingSinds}
            onChange={(v) => pasA((x) => (v ? (x.terBeschikkingSinds = v) : delete x.terBeschikkingSinds))}
          />
          <Datum
            label="Ter beschikking tot en met"
            veld={veld('auto.terBeschikkingTot')}
            hint="Leeg: het hele jaar."
            value={auto.terBeschikkingTot}
            onChange={(v) => pasA((x) => (v ? (x.terBeschikkingTot = v) : delete x.terBeschikkingTot))}
          />
        </Rij>
      </Disclosure>

      {uitkomst && (
        <StatLijst className="rounded-xl border border-gray-200 bg-white px-4">
          <StatRow
            label={`Bijtelling ${jaar}`}
            bedrag={uitkomst.bijtelling}
            toelichting={
              uitkomst.overgangsrecht && uitkomst.zonderOvergangsrecht !== undefined
                ? `Met het overgangsrecht; zonder zou het ${formatEuro(uitkomst.zonderOvergangsrecht)} zijn.`
                : uitkomst.bijtelling < Math.max(0, uitkomst.bruto - uitkomst.eigenBijdrage)
                  ? `Niet meer dan je autokosten (${formatEuro(uitkomst.plafond)}).`
                  : undefined
            }
          />
        </StatLijst>
      )}

      <Disclosure variant="kaal" titel={`Btw-correctie privégebruik · ${btwCorrectieTekst(uitkomst)}`}>
        <div data-veld={veld('auto.btw')} className="space-y-4 pt-2">
          <p className="text-xs leading-relaxed text-gray-600">Betaal je bij de laatste btw-aangifte van het jaar. In de winst is het een kostenpost.</p>
          <div data-veld={veld('auto.btw.aftrekOpKosten')}>
            <ChipGroup<'ja' | 'nee'>
              label="Trek je btw af op de kosten van deze auto?"
              kolommen={2}
              value={b ? (b.aftrekOpKosten === false ? 'nee' : 'ja') : null}
              onChange={(v) =>
                pasA((x) => {
                  const huidig = x.btw ?? { aftrekBijAanschaf: true, methode: 'forfait' as const }
                  if (v === 'nee') huidig.aftrekOpKosten = false
                  else delete huidig.aftrekOpKosten
                  x.btw = huidig
                })
              }
              options={[
                { value: 'ja', label: 'Ja' },
                { value: 'nee', label: 'Nee' },
              ]}
              hint="Nee als je geen btw aftrekt, bijvoorbeeld met de kleineondernemersregeling of bij vrijgestelde diensten."
            />
          </div>
          {b && b.aftrekOpKosten === false && <p className="text-sm text-gray-700">Geen btw-correctie: je trekt geen btw af op deze auto.</p>}
          {b && b.aftrekOpKosten !== false && (
            <>
              <div data-veld={veld('auto.btw.aftrekBijAanschaf')}>
                <ChipGroup<'ja' | 'nee'>
                  label="Heb je bij aankoop btw teruggekregen?"
                  kolommen={2}
                  value={b.aftrekBijAanschaf ? 'ja' : 'nee'}
                  onChange={(v) =>
                    pasA((x) => {
                      if (!x.btw) return
                      x.btw.aftrekBijAanschaf = v === 'ja'
                      if (v === 'nee') delete x.btw.btwBijAanschaf
                    })
                  }
                  options={[
                    { value: 'ja', label: 'Ja' },
                    { value: 'nee', label: 'Nee' },
                  ]}
                  hint={`Nee bij een auto van een particulier of een marge-auto. Dan is het forfait ${bp ? formatPct(bp.verlaagdPct, 1) : 'lager'}.`}
                />
              </div>
              <Rij>
                <Getal
                  label="In gebruik genomen in"
                  veld={veld('auto.btw.jaarIngebruikname')}
                  min={1990}
                  max={jaar}
                  hint={`Het jaar waarin jij de auto zakelijk ging gebruiken, niet het bouwjaar.${afgeleidJaar !== null && b.jaarIngebruikname === undefined ? ` Leeg: ${afgeleidJaar}.` : ''}${bp ? ` Tot en met ${bp.verlaagdNaJaren} jaar daarna geldt ${formatPct(bp.standaardPct, 1)}, later ${formatPct(bp.verlaagdPct, 1)}.` : ''}`}
                  value={b.jaarIngebruikname}
                  onChange={(v) => pasA((x) => void (x.btw && (v === undefined ? delete x.btw.jaarIngebruikname : (x.btw.jaarIngebruikname = v))))}
                />
                <div data-veld={veld('auto.btw.methode')}>
                  <ChipGroup<'forfait' | 'kilometers'>
                    label="Methode"
                    kolommen={2}
                    value={b.methode}
                    onChange={(v) => pasA((x) => void (x.btw && (x.btw.methode = v)))}
                    options={[
                      { value: 'forfait', label: 'Forfait' },
                      { value: 'kilometers', label: 'Kilometers' },
                    ]}
                    hint={b.methode === 'kilometers' ? 'Met een kilometeradministratie: de btw op de kosten naar het deel privékilometers.' : 'Een percentage van de cataloguswaarde.'}
                  />
                </div>
                <Bedrag
                  label="Btw op de autokosten dit jaar"
                  veld={veld('auto.btw.btwOpKosten')}
                  hint="De btw die je dit jaar aftrok op brandstof, onderhoud en reparaties. De correctie is nooit hoger."
                  value={b.btwOpKosten}
                  onChange={(v) => pasA((x) => void (x.btw && (v === undefined ? delete x.btw.btwOpKosten : (x.btw.btwOpKosten = v))))}
                />
                {b.aftrekBijAanschaf && (
                  <Bedrag
                    label="Btw bij aankoop"
                    veld={veld('auto.btw.btwBijAanschaf')}
                    hint={bp ? `In de eerste ${bp.verlaagdNaJaren} jaar telt een vijfde mee in het maximum.` : undefined}
                    value={b.btwBijAanschaf}
                    onChange={(v) => pasA((x) => void (x.btw && (v === undefined ? delete x.btw.btwBijAanschaf : (x.btw.btwBijAanschaf = v))))}
                  />
                )}
                {b.methode === 'kilometers' && (
                  <>
                    <Getal
                      label="Privékilometers met woon-werk"
                      suffix="km"
                      veld={veld('auto.btw.priveKmInclWoonWerk')}
                      hint="Voor de btw is woon-werkverkeer privé."
                      value={b.priveKmInclWoonWerk}
                      onChange={(v) => pasA((x) => void (x.btw && (v === undefined ? delete x.btw.priveKmInclWoonWerk : (x.btw.priveKmInclWoonWerk = v))))}
                    />
                    <Getal
                      label="Totaal aantal kilometers"
                      suffix="km"
                      veld={veld('auto.btw.totaalKm')}
                      value={b.totaalKm}
                      onChange={(v) => pasA((x) => void (x.btw && (v === undefined ? delete x.btw.totaalKm : (x.btw.totaalKm = v))))}
                    />
                  </>
                )}
              </Rij>
              {detail && uitkomst && (
                <p className="text-xs text-gray-600">
                  {detail.reden === 'kilometers'
                    ? `Btw op de kosten naar het deel privékilometers: ${formatEuro(uitkomst.btwCorrectie)}.`
                    : `${detail.pct !== null ? formatPct(detail.pct, 1) : ''} van de cataloguswaarde${detail.maanden < 12 ? `, ${detail.maanden} van de 12 maanden` : ''}${detail.maximum !== null ? `, niet meer dan ${formatEuro(detail.maximum)}` : ''}: ${formatEuro(uitkomst.btwCorrectie)}.`}
                </p>
              )}
              <InSaldoRegel
                label="Zit al in de autokosten"
                veld={veld('auto.btw.inAutokosten')}
                expliciet={b.inAutokosten}
                standaard={standaardInSaldo(o, 'autoBtw')}
                onderneming={o}
                uitleg="Ja: de correctie staat al in je autokosten. Nee: we trekken hem van je winst af en tellen hem mee in het maximum van de bijtelling."
                onChange={(v) => pasA((x) => void (x.btw && (v === undefined ? delete x.btw.inAutokosten : (x.btw.inAutokosten = v))))}
              />
            </>
          )}
          {b && (
            <button
              type="button"
              onClick={() => pasA((x) => void delete x.btw)}
              className="inline-flex min-h-[44px] items-center text-xs font-medium text-gray-600 transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Btw-correctie niet berekenen
            </button>
          )}
        </div>
      </Disclosure>
    </div>
  )
}
