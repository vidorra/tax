'use client'

import { ChevronDown, Coins, Gift, Home, Scale, Building2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { Box3Categorie, Eigenaar, HuishoudenInvoer, SchuldPositie, Verdeling, VermogensPositie } from '@/lib/tax/types'
import { Alert, ChipGroup, Disclosure, NumberInput, Section, Select, Toggle, cn, formatEuro, formatPct } from '@/components/ui'
import { Bedrag, Lijst, MetVeld, Rij, Subkop, Tekst, VeldVak, nieuwId } from '../velden'
import { persoonNaam, type SectieProps } from './types'
import { opbrengstLabel, tegenbewijsStand, volgEigenGebruik, zetEigenGebruik } from './box3Tegenbewijs'
import { WoningSectieInhoud } from '../woning/WoningSectieInhoud'
import { HypotheekBox3Regel } from '../woning/HypotheekBox3Regel'
import { Box2SectieInhoud } from '../box2/Box2SectieInhoud'
import { BestandImport } from '../import/BestandImport'
import { getJaar } from '@/lib/tax/years'
import { veldVan } from '@/lib/dossier/veld'
import { bronbelastingRegels } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { BronbelastingLijst } from '../bronbelasting/BronbelastingLijst'
import { BronbelastingSamenvatting } from '../bronbelasting/BronbelastingSamenvatting'

const CATEGORIE: Array<{ value: Box3Categorie; label: string }> = [
  { value: 'bankNL', label: 'Bank- en spaarrekeningen Nederland' },
  { value: 'bankBuitenland', label: 'Bankrekeningen buitenland' },
  { value: 'contant', label: 'Contant geld' },
  { value: 'beleggingen', label: 'Beleggingen' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'groen', label: 'Groene beleggingen' },
  { value: 'vorderingen', label: 'Uitgeleend geld en vorderingen' },
  { value: 'onroerend', label: 'Vastgoed (niet de eigen woning)' },
  { value: 'overig', label: 'Overige bezittingen' },
  { value: 'nettolijfrente', label: 'Nettolijfrente' },
]

function eigenaarOpties(invoer: HuishoudenInvoer): Array<{ value: string; label: string }> {
  return [
    ...invoer.personen.map((p) => ({ value: p.id, label: persoonNaam(p) })),
    ...invoer.kinderen.map((k, i) => ({ value: `kind:${k.id}`, label: k.naam?.trim() || `Kind ${i + 1}` })),
  ]
}

/** Ronde 2 (A2): eigenaar A2; de inhoud staat in components/dossier/woning/WoningSectieInhoud.tsx. */
export function WoningSectie({ invoer, wijzig, resultaat }: SectieProps) {
  return (
    <Section id="woning" icon={<Home />} title="Eigen woning" subtitle="WOZ-waarde, hypotheekrente en leningdelen">
      <WoningSectieInhoud invoer={invoer} wijzig={wijzig} resultaat={resultaat} />
    </Section>
  )
}

/** Opsomming in gewone taal: "a", "a en b", "a, b en c". */
function opsomming(namen: string[]): string {
  if (namen.length <= 1) return namen.join('')
  return `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`
}

function opbrengstHint(c: Box3Categorie): string | undefined {
  if (c === 'beleggingen' || c === 'groen') return 'Vóór inhouding van dividendbelasting.'
  if (c === 'onroerend') return 'Zonder kosten eraf te halen.'
  return undefined
}

/**
 * Eigenaar: onderdeel bronbelasting (A5). Markeringen voor A4 (import) en A2 (deel van de hypotheek in box 3); die lezen
 * `props` (bijvoorbeeld `props.resultaat`) en wijzigen de regel hieronder niet.
 */
export function VermogenSectie(props: SectieProps) {
  const { invoer, wijzig } = props
  // Ronde 2 (A5): parameters van het jaar voor de live uitkomst per land (dezelfde functie als de engine).
  const params = useMemo(() => {
    try {
      return getJaar(invoer.jaar, invoer.variant)
    } catch {
      return null
    }
  }, [invoer.jaar, invoer.variant])
  const eigenaren = eigenaarOpties(invoer)
  const totaal = invoer.box3.posities.reduce((s, p) => s + p.waardeBegin, 0) - invoer.box3.schulden.reduce((s, p) => s + p.waardeBegin, 0)
  const basisId = useId().replace(/:/g, '')
  const stand = useMemo(() => tegenbewijsStand(invoer), [invoer])
  const [uitgeklapt, setUitgeklapt] = useState<ReadonlySet<string>>(() => new Set())
  const tegenbewijsAan = Boolean(invoer.box3.tegenbewijs)
  // Velden voor het werkelijk rendement: zichtbaar als ze meetellen, anders uitklapbaar per bezitting.
  // Ze blijven altijd gemount (hidden), zodat de focus niet verspringt als de melding tijdens het typen verandert.
  const velden = stand.mogelijk || stand.altijdWerkelijk || stand.heeftGegevens
  // Bij een stijging zonder storting (melding van de engine) klappen de velden ook open: misschien loont tegenbewijs dan.
  const tonen = stand.altijdWerkelijk || (stand.mogelijk && (tegenbewijsAan || stand.loont || stand.onvolledig || stand.storting)) || stand.heeftGegevens
  const daling = stand.loont || stand.onvolledig || stand.toegepast ? stand.dalingZonderOpname : []
  const naam = (p: VermogensPositie) => p.omschrijving.trim() || `Bezitting ${invoer.box3.posities.indexOf(p) + 1}`
  const klap = (id: string, open: boolean) =>
    setUitgeklapt((s) => {
      if (s.has(id) === open) return s
      const n = new Set(s)
      if (open) n.add(id)
      else n.delete(id)
      return n
    })

  return (
    <Section id="vermogen" icon={<Coins />} title="Vermogen (box 3)" subtitle={`Per rekening de waarde op 1 januari ${invoer.jaar} en ${invoer.jaar + 1}`} value={formatEuro(totaal)}>
      <div className="space-y-5">
        {tonen && stand.mogelijk && (
          <Alert variant="info">
            <p>
              Voor tegenbewijs rekenen we per bezitting het werkelijk rendement uit: eindwaarde min beginwaarde, plus rente, dividend en huur. Geld dat je erbij zette of eraf haalde hoort daar niet bij. Vul
              het daarom in, anders telt een storting als rendement en een opname als verlies.
            </p>
            <p className="mt-2 text-xs">
              Rente, dividend en huur vul je bruto in bij de bezitting die ze opleverde. Kwam het geld binnen op een rekening in box 3, tel het daar bij gestort, ook bij rente op de spaarrekening zelf. Een
              overboeking tussen je eigen rekeningen in box 3 is een opname bij de ene en een storting bij de andere.
            </p>
          </Alert>
        )}
        {stand.altijdWerkelijk && (
          <Alert variant="info">In dit voorgestelde stelsel telt altijd het werkelijk rendement. Daarvoor zijn per bezitting de stortingen, opnames en opbrengsten nodig.</Alert>
        )}
        {stand.stijgingZonderStorting.length > 0 && (
          <Alert variant="info" titel="Zette je er geld bij?">
            Bij {opsomming(stand.stijgingZonderStorting.map(naam))} steeg de waarde, maar staat er geen storting. Geld dat je erbij zette is geen rendement. Vul het in bij gestort, dan
            rekenen we het werkelijk rendement goed uit en zie je of tegenbewijs loont. Zette je er niets bij, vul dan 0 in.
          </Alert>
        )}
        {daling.length > 0 && (
          <Alert variant="let-op" titel={stand.loont || stand.onvolledig ? 'Tegenbewijs lijkt te lonen, maar controleer eerst je opnames' : 'Controleer je opnames'}>
            Bij {opsomming(daling.map(naam))} is de waarde gedaald, maar staat er geen opname. Haalde je er geld af of verkocht je iets, vul dat dan in bij opgenomen: dat is geen verlies. Was het echt een
            waardedaling, vul dan 0 in.
          </Alert>
        )}
        <BestandImport invoer={invoer} wijzig={wijzig} />
        <Lijst<VermogensPositie>
          items={invoer.box3.posities}
          onChange={(l) => wijzig((d) => void (d.box3.posities = l))}
          nieuw={() => ({ id: nieuwId('positie'), omschrijving: '', categorie: 'bankNL', eigenaar: 'A', waardeBegin: 0 })}
          titel={(p, i) => `${p.omschrijving || `Bezitting ${i + 1}`} · ${formatEuro(p.waardeBegin)}`}
          toevoegLabel="Bezitting toevoegen"
          toevoegVeld={invoer.box3.posities.length === 0 ? 'box3/posities' : undefined}
        >
          {(p, pas, i) => {
            const open = tonen || uitgeklapt.has(p.id)
            const paneelId = `${basisId}-rendement-${i}`
            const zet = (fn: (x: VermogensPositie) => void) => {
              klap(p.id, true)
              pas(fn)
            }
            return (
              <div className="space-y-4">
                <Rij>
                  <Tekst label="Omschrijving" verplicht placeholder="Bijvoorbeeld: spaarrekening" veld={veldVan.positie(p.id, 'omschrijving')} value={p.omschrijving} onChange={(v) => pas((x) => void (x.omschrijving = v))} />
                  <div data-veld={veldVan.positie(p.id, 'categorie')}>
                    <Select
                      label="Categorie"
                      value={p.categorie}
                      onChange={(v) =>
                        pas((x) => {
                          x.categorie = v
                          volgEigenGebruik(x)
                        })
                      }
                      options={CATEGORIE}
                    />
                  </div>
                  <div data-veld={veldVan.positie(p.id, 'eigenaar')}>
                    <Select label="Eigenaar" value={p.eigenaar} onChange={(v) => pas((x) => void (x.eigenaar = v as Eigenaar))} options={eigenaren} />
                  </div>
                  <span className="hidden sm:block" />
                  <Bedrag
                    label={`Waarde 1 januari ${invoer.jaar}`}
                    veld={veldVan.positie(p.id, 'waardeBegin')}
                    value={p.waardeBegin}
                    onChange={(v) =>
                      pas((x) => {
                        x.waardeBegin = v ?? 0
                        volgEigenGebruik(x)
                      })
                    }
                  />
                  <Bedrag
                    label={`Waarde 1 januari ${invoer.jaar + 1}`}
                    veld={veldVan.positie(p.id, 'waardeEind')}
                    value={p.waardeEind}
                    onChange={(v) =>
                      pas((x) => {
                        x.waardeEind = v
                        volgEigenGebruik(x)
                      })
                    }
                  />
                </Rij>
                {velden && (
                  <div>
                    {!tonen && (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={paneelId}
                        onClick={() => klap(p.id, !open)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg py-2 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">Stortingen, opnames en opbrengsten</span>
                          <span className="mt-0.5 block text-xs font-normal text-gray-500">Nodig voor tegenbewijs</span>
                        </span>
                        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 flex-shrink-0 text-gray-500', open && 'rotate-180')} />
                      </button>
                    )}
                    <div id={paneelId} hidden={!open} className={tonen ? undefined : 'pb-2 pt-1'}>
                      {tonen && <p className="mb-3 text-sm font-medium text-gray-900">Voor het werkelijk rendement</p>}
                      <Rij kolommen={3}>
                        <Bedrag label="Gestort" hint="Ook rente of dividend die hierop binnenkwam." veld={veldVan.positie(p.id, 'stortingen')} value={p.stortingen} onChange={(v) => zet((x) => void (x.stortingen = v))} />
                        <Bedrag label="Opgenomen" hint="Ook geld waarmee je een schuld in box 3 aflost." veld={veldVan.positie(p.id, 'onttrekkingen')} value={p.onttrekkingen} onChange={(v) => zet((x) => void (x.onttrekkingen = v))} />
                        <Bedrag label={opbrengstLabel(p.categorie)} hint={opbrengstHint(p.categorie)} veld={veldVan.positie(p.id, 'directeOpbrengsten')} value={p.directeOpbrengsten} onChange={(v) => zet((x) => void (x.directeOpbrengsten = v))} />
                      </Rij>
                      {p.categorie === 'onroerend' && (stand.eigenGebruikPct > 0 || Boolean(p.woz?.dagenEigenGebruik)) && (
                        <Rij className="mt-4">
                          <div data-veld={veldVan.positie(p.id, 'woz.dagenEigenGebruik')}>
                            <NumberInput
                              label="Dagen eigen gebruik"
                              suffix="dagen"
                              min={0}
                              max={366}
                              value={p.woz?.dagenEigenGebruik ?? null}
                              disabled={p.waardeEind === undefined}
                              hint={
                                p.waardeEind === undefined
                                  ? `Vul eerst de waarde op 1 januari ${invoer.jaar + 1} in.`
                                  : stand.eigenGebruikPct > 0
                                    ? `Bijvoorbeeld een vakantiehuis. Als rendement telt ${formatPct(stand.eigenGebruikPct)} van de waarde op 1 januari ${invoer.jaar} per jaar, naar rato van deze dagen.`
                                    : `Eigen gebruik telt in ${invoer.jaar} niet mee.`
                              }
                              onChange={(v) => zet((x) => zetEigenGebruik(x, v ?? undefined))}
                            />
                          </div>
                        </Rij>
                      )}
                    </div>
                  </div>
                )}
                <Disclosure variant="kaal" titel="Dividend en bronbelasting" defaultOpen={Boolean(p.dividendbelasting || bronbelastingRegels(p).length > 0)}>
                  <div className="space-y-5 pt-2">
                    <Rij>
                      <Bedrag label="Ingehouden Nederlandse dividendbelasting" veld={veldVan.positie(p.id, 'dividendbelasting')} value={p.dividendbelasting} onChange={(v) => pas((x) => void (x.dividendbelasting = v))} />
                    </Rij>
                    <BronbelastingLijst positie={p} pas={pas} jaar={invoer.jaar} params={params} />
                  </div>
                </Disclosure>
              </div>
            )
          }}
        </Lijst>
        <div>
          <Subkop>Schulden</Subkop>
          <Lijst<SchuldPositie>
            items={invoer.box3.schulden}
            onChange={(l) => wijzig((d) => void (d.box3.schulden = l))}
            nieuw={() => ({ id: nieuwId('schuld'), omschrijving: '', eigenaar: 'A', waardeBegin: 0 })}
            titel={(s, i) => `${s.omschrijving || `Schuld ${i + 1}`} · ${formatEuro(s.waardeBegin)}`}
            toevoegLabel="Schuld toevoegen"
            leegTekst="Geen schulden in box 3."
          >
            {(s, pas) => (
              <Rij>
                <Tekst label="Omschrijving" verplicht placeholder="Bijvoorbeeld: studieschuld" veld={veldVan.schuld(s.id, 'omschrijving')} value={s.omschrijving} onChange={(v) => pas((x) => void (x.omschrijving = v))} />
                <div data-veld={veldVan.schuld(s.id, 'eigenaar')}>
                  <Select label="Eigenaar" value={s.eigenaar} onChange={(v) => pas((x) => void (x.eigenaar = v as Eigenaar))} options={eigenaren} />
                </div>
                <Bedrag label={`Schuld 1 januari ${invoer.jaar}`} veld={veldVan.schuld(s.id, 'waardeBegin')} value={s.waardeBegin} onChange={(v) => pas((x) => void (x.waardeBegin = v ?? 0))} />
                <Bedrag label={`Schuld 1 januari ${invoer.jaar + 1}`} veld={veldVan.schuld(s.id, 'waardeEind')} value={s.waardeEind} onChange={(v) => pas((x) => void (x.waardeEind = v))} />
                {tonen && <Bedrag label="Betaalde rente" hint="Gaat bij het werkelijk rendement van het rendement af." veld={veldVan.schuld(s.id, 'betaaldeRente')} value={s.betaaldeRente} onChange={(v) => pas((x) => void (x.betaaldeRente = v))} />}
              </Rij>
            )}
          </Lijst>
          <HypotheekBox3Regel invoer={props.invoer} resultaat={props.resultaat} />
        </div>
        <BronbelastingSamenvatting invoer={invoer} resultaat={props.resultaat} params={params} />
        {!stand.altijdWerkelijk && (
          <div data-veld="box3/tegenbewijs">
            <Toggle
              label="Tegenbewijs: werkelijk rendement opgeven als dat lager is"
              description={
                stand.mogelijk
                  ? 'We vergelijken het werkelijk rendement met het forfaitaire rendement. Daarvoor zijn per bezitting de eindwaarde en je stortingen, opnames en opbrengsten nodig.'
                  : `Voor ${invoer.jaar} rekent deze tool tegenbewijs niet door.`
              }
              checked={tegenbewijsAan}
              onChange={(aan) => wijzig((d) => void (d.box3.tegenbewijs = aan || undefined))}
            />
          </div>
        )}
      </div>
    </Section>
  )
}

export function PgaSectie({ invoer, wijzig }: SectieProps) {
  const pga = invoer.pga ?? {}
  const zet = (veld: keyof NonNullable<HuishoudenInvoer['pga']>, v: number | undefined) =>
    wijzig((d) => {
      const nieuw = { ...(d.pga ?? {}), [veld]: v }
      if (v === undefined) delete nieuw[veld]
      if (Object.keys(nieuw).length === 0) delete d.pga
      else d.pga = nieuw
    })
  return (
    <Section id="pga" icon={<Gift />} title="Persoonsgebonden aftrek" subtitle="Giften en specifieke zorgkosten van het huishouden">
      <Rij>
        <Bedrag label="Gewone giften" veld="pga/giftenGewoon" value={pga.giftenGewoon} onChange={(v) => zet('giftenGewoon', v)} />
        <Bedrag label="Periodieke giften" veld="pga/giftenPeriodiek" hint="Vastgelegd voor minimaal vijf jaar." value={pga.giftenPeriodiek} onChange={(v) => zet('giftenPeriodiek', v)} />
        <Bedrag label="Giften aan culturele instellingen" veld="pga/giftenCultureel" value={pga.giftenCultureel} onChange={(v) => zet('giftenCultureel', v)} />
        <Bedrag label="Specifieke zorgkosten" veld="pga/specifiekeZorgkosten" value={pga.specifiekeZorgkosten} onChange={(v) => zet('specifiekeZorgkosten', v)} />
      </Rij>
    </Section>
  )
}

/** Ronde 2 (A2): eigenaar A2; de inhoud staat in components/dossier/box2/Box2SectieInhoud.tsx. */
export function Box2Sectie({ invoer, wijzig, resultaat }: SectieProps) {
  return (
    <Section id="box2" icon={<Building2 />} title="Aanmerkelijk belang (box 2)" subtitle="Dividend uit je eigen BV">
      <Box2SectieInhoud invoer={invoer} wijzig={wijzig} resultaat={resultaat} />
    </Section>
  )
}

const POSTEN: Array<{ id: keyof Verdeling; label: string }> = [
  { id: 'eigenWoning', label: 'Eigen woning' },
  { id: 'box3', label: 'Box 3' },
  { id: 'pga', label: 'Persoonsgebonden aftrek' },
  { id: 'box2', label: 'Box 2' },
  { id: 'dividendbelasting', label: 'Dividendbelasting' },
]

export const STANDAARD_VERDELING: Verdeling = { eigenWoning: 0.5, pga: 0.5, box3: 0.5, box2: 0.5, dividendbelasting: 0.5 }

export function VerdelingSectie({ invoer, wijzig, gekozen }: SectieProps & { gekozen: Verdeling | null }) {
  if (!invoer.fiscaalPartner || invoer.personen.length < 2) return null
  const vast = invoer.verdeling !== 'optimaal' ? invoer.verdeling : null
  const [a, b] = [persoonNaam(invoer.personen.find((p) => p.id === 'A')!), persoonNaam(invoer.personen.find((p) => p.id === 'B')!)]
  return (
    <Section id="verdeling" icon={<Scale />} title="Verdeling tussen partners" subtitle="Gemeenschappelijke posten mag je vrij verdelen">
      <div className="space-y-5">
        <VeldVak veld="verdeling/keuze">
          {() => (
            <ChipGroup<'optimaal' | 'vast'>
              label="Verdeling"
              kolommen={2}
              value={vast ? 'vast' : 'optimaal'}
              onChange={(k) => wijzig((d) => void (d.verdeling = k === 'optimaal' ? 'optimaal' : (gekozen ?? STANDAARD_VERDELING)))}
              options={[
                { value: 'optimaal', label: 'Optimaal', beschrijving: 'Laagste heffing samen' },
                { value: 'vast', label: 'Zelf kiezen', beschrijving: 'Per post een aandeel' },
              ]}
            />
          )}
        </VeldVak>
        {POSTEN.map((post) => {
          const waarde = vast ? vast[post.id] : (gekozen?.[post.id] ?? 0.5)
          const pct = Math.round(waarde * 100)
          const id = `verdeling-${post.id}`
          return (
            <MetVeld key={post.id} veld={`verdeling/${post.id}`}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <label htmlFor={id} className="font-medium text-gray-700">
                  {post.label}
                </label>
                <span className="tabular-nums text-gray-600">
                  {a} {pct}% · {b} {100 - pct}%
                </span>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                step={1}
                value={pct}
                disabled={!vast}
                aria-valuetext={`${a} ${pct} procent, ${b} ${100 - pct} procent`}
                onChange={(e) => wijzig((d) => void (d.verdeling !== 'optimaal' && (d.verdeling[post.id] = Number(e.target.value) / 100)))}
                className="w-full accent-primary disabled:opacity-60"
              />
            </MetVeld>
          )
        })}
        {!vast && <p className="text-xs text-gray-500">De schuiven tonen de verdeling die de berekening nu kiest. Kies &quot;Zelf kiezen&quot; om ze aan te passen.</p>}
      </div>
    </Section>
  )
}
