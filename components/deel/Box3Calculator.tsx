'use client'

import { Landmark, Plus, Scale, Trash2, Users } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { Disclosure } from '@/components/ui/Disclosure'
import { MobileResultBar } from '@/components/ui/MobileResultBar'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ResultBedrag, ResultPanel } from '@/components/ui/ResultPanel'
import { Section } from '@/components/ui/Section'
import { StatLijst, StatRow } from '@/components/ui/StatRow'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Toggle } from '@/components/ui/Toggle'
import { UitlegLijst } from '@/components/ui/UitlegLijst'
import { WaarschuwingLijst } from '@/components/ui/WaarschuwingLijst'
import { formatEuro, formatPct } from '@/components/ui/format'
import { berekenBox3 } from '@/lib/tax/modules/box3'
import type { Box3Context } from '@/lib/tax/modules/box3'
import type { Box3Categorie, Box3Invoer, Box3Params, PersoonId, Status } from '@/lib/tax/types'
import { BESCHIKBARE_JAREN, CONCEPT_JAREN, STANDAARD_JAAR, veldStatus } from '@/lib/tax/years'
import { JaarKeuze } from './JaarKeuze'
import { CalculatorGrid, DataTabel, Disclaimer } from './Opbouw'
import { jaarLabel, params } from './jaren'

type Categorie = Extract<Box3Categorie, 'bankNL' | 'bankBuitenland' | 'beleggingen' | 'crypto' | 'overig'>

interface PositieRij {
  id: string
  categorie: Categorie
  begin: number | null
  eind: number | null
  stortingen: number | null
  onttrekkingen: number | null
  opbrengsten: number | null
}

const CATEGORIEEN: Array<{ value: Categorie; label: string }> = [
  { value: 'bankNL', label: 'Bank NL' },
  { value: 'bankBuitenland', label: 'Bank buitenland' },
  { value: 'beleggingen', label: 'Beleggingen' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'overig', label: 'Overig' },
]

const KANAAL: Record<Box3Params['tegenbewijs']['kanaal'], string> = {
  'owr-formulier': 'met het formulier Opgaaf werkelijk rendement (OWR)',
  aangifte: 'in je aangifte inkomstenbelasting',
  geen: 'niet mogelijk',
}

/** Het jaar met twee voorstellen en het conceptjaar voor de vooruitblik (uit het jaarregister, niet vast in de code). */
const VARIANT_JAAR = BESCHIKBARE_JAREN().find((j) => params(j).varianten.length > 0)
const CONCEPT_JAAR = CONCEPT_JAREN[0]
/** Eerste jaar waarin cryptoplatforms gegevens doorgeven (DAC8). */
const DAC8_VANAF = BESCHIKBARE_JAREN().find((j) => params(j).box3.waarde.dac8Rapportage)

const n = (x: number | null | undefined): number => x ?? 0
const som = (r: Record<PersoonId, number>): number => r.A + r.B

function rij(id: string, categorie: Categorie): PositieRij {
  return { id, categorie, begin: null, eind: null, stortingen: null, onttrekkingen: null, opbrengsten: null }
}

export function Box3Calculator() {
  const [jaar, setJaar] = useState(STANDAARD_JAAR)
  const [variant, setVariant] = useState('')
  const [partner, setPartner] = useState(false)
  const [posities, setPosities] = useState<PositieRij[]>([rij('pos-1', 'bankNL'), rij('pos-2', 'beleggingen')])
  const [schuldBegin, setSchuldBegin] = useState<number | null>(null)
  const [schuldEind, setSchuldEind] = useState<number | null>(null)
  const [rente, setRente] = useState<number | null>(null)
  const teller = useRef(2)

  const v = params(jaar).varianten.length > 0 ? variant : ''
  const p = params(jaar, v)
  const b3 = p.box3.waarde

  const invoer: Box3Invoer = useMemo(
    () => ({
      posities: posities
        .filter((x) => x.begin !== null || x.eind !== null)
        .map((x) => ({
          id: x.id,
          omschrijving: CATEGORIEEN.find((c) => c.value === x.categorie)!.label,
          categorie: x.categorie,
          eigenaar: 'A' as const,
          waardeBegin: n(x.begin),
          waardeEind: x.eind ?? undefined,
          stortingen: x.stortingen ?? undefined,
          onttrekkingen: x.onttrekkingen ?? undefined,
          directeOpbrengsten: x.opbrengsten ?? undefined,
        })),
      schulden:
        schuldBegin !== null || schuldEind !== null
          ? [{ id: 'schuld', omschrijving: 'Schulden', eigenaar: 'A' as const, waardeBegin: n(schuldBegin), waardeEind: schuldEind ?? undefined, betaaldeRente: rente ?? undefined }]
          : [],
    }),
    [posities, schuldBegin, schuldEind, rente],
  )

  const reken = useMemo(() => {
    return (j: number, variantId = '') => {
      const pj = params(j, variantId)
      const ctx: Box3Context = { params: pj, jaar: j, fiscaalPartner: partner, aandeelA: partner ? 0.5 : 1, personen: partner ? ['A', 'B'] : ['A'] }
      const forfait = berekenBox3({ ...invoer, tegenbewijs: false }, ctx)
      const met = berekenBox3({ ...invoer, tegenbewijs: true }, ctx)
      const loont = met.gekozen === 'werkelijk'
      const gekozen = loont ? met : forfait
      return {
        p: pj,
        forfait,
        met,
        loont,
        gekozen,
        belastingForfait: som(forfait.belasting),
        belasting: som(gekozen.belasting),
        voordeelForfait: som(forfait.voordeel),
      }
    }
  }, [invoer, partner])

  const r = useMemo(() => reken(jaar, v), [reken, jaar, v])
  const varianten = useMemo(
    () => (VARIANT_JAAR ? [{ id: '', label: 'Belastingplan' }, ...params(VARIANT_JAAR).varianten.map((x) => ({ id: x.id, label: x.label }))].map((x) => ({ ...x, ...reken(VARIANT_JAAR, x.id) })) : []),
    [reken],
  )
  const concept = useMemo(() => (CONCEPT_JAAR ? reken(CONCEPT_JAAR) : null), [reken])

  const heeftInvoer = invoer.posities.length > 0
  const metWaarde = posities.filter((x) => x.begin !== null)
  const allesBekend = metWaarde.length > 0 && metWaarde.every((x) => x.eind !== null)
  const werkelijk = r.met.werkelijkRendement ?? r.forfait.werkelijkRendement
  const besparing = r.belastingForfait - r.belasting
  const statusBank: Status = veldStatus(p, 'box3', 'forfaitBank')
  const statusOverig: Status = veldStatus(p, 'box3', 'forfaitOverig')

  function wijzig(id: string, veld: Partial<PositieRij>) {
    setPosities((ps) => ps.map((x) => (x.id === id ? { ...x, ...veld } : x)))
  }
  function voegToe() {
    teller.current += 1
    setPosities((ps) => [...ps, rij(`pos-${teller.current}`, 'crypto')])
  }

  const invoerBlok = (
    <>
      <Section icon={<Users />} title="Jaar en huishouden">
        <div className="space-y-5">
          <JaarKeuze jaar={jaar} onJaar={setJaar} variant={v} onVariant={setVariant} />
          <Toggle
            label="Fiscaal partner"
            description="Met een fiscaal partner verdubbelt het heffingsvrij vermogen. We verdelen de grondslag gelijk."
            checked={partner}
            onChange={setPartner}
          />
        </div>
      </Section>

      <Section
        icon={<Landmark />}
        title="Bezittingen"
        subtitle={`Waarde op 1 januari ${jaar}, de peildatum. Tel vermogen van minderjarige kinderen mee.`}
        actie={
          <Button variant="kaal" grootte="sm" onClick={voegToe} disabled={posities.length >= 12}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Rekening
          </Button>
        }
      >
        <ol className="space-y-4">
          {posities.map((x, i) => (
            <li key={x.id} className="rounded-xl border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-gray-900">Bezitting {i + 1}</h3>
                {posities.length > 1 && (
                  <Button variant="kaal" grootte="sm" onClick={() => setPosities((ps) => ps.filter((y) => y.id !== x.id))} aria-label={`Bezitting ${i + 1} verwijderen`}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="space-y-4">
                <ChipGroup<Categorie> label="Soort" labelVerborgen value={x.categorie} onChange={(categorie) => wijzig(x.id, { categorie })} options={CATEGORIEEN} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoneyInput label={`1 januari ${jaar}`} value={x.begin} onChange={(begin) => wijzig(x.id, { begin })} />
                  <MoneyInput label={`1 januari ${jaar + 1}`} value={x.eind} onChange={(eind) => wijzig(x.id, { eind })} hint="Optioneel, nodig voor tegenbewijs." />
                </div>
                <Disclosure variant="kaal" titel="Stortingen, opnames en opbrengsten" subtitel="Voor het werkelijk rendement">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <MoneyInput label="Gestort" value={x.stortingen} onChange={(stortingen) => wijzig(x.id, { stortingen })} />
                    <MoneyInput label="Opgenomen" value={x.onttrekkingen} onChange={(onttrekkingen) => wijzig(x.id, { onttrekkingen })} />
                    <MoneyInput label="Rente en dividend" value={x.opbrengsten} onChange={(opbrengsten) => wijzig(x.id, { opbrengsten })} />
                  </div>
                </Disclosure>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={<Scale />} title="Schulden" subtitle={`Alleen het deel boven de schuldendrempel van ${formatEuro(b3.schuldendrempel)} per persoon telt.`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <MoneyInput label={`1 januari ${jaar}`} value={schuldBegin} onChange={setSchuldBegin} hint="Geen hypotheek van je eigen woning." />
          <MoneyInput label={`1 januari ${jaar + 1}`} value={schuldEind} onChange={setSchuldEind} />
          <MoneyInput label="Betaalde rente" value={rente} onChange={setRente} />
        </div>
      </Section>
    </>
  )

  const resultaat = (
    <>
      <ResultPanel titel={`Box 3 in ${jaarLabel(jaar, v)}`} kopExtra={p.box3.status !== 'definitief' ? <StatusBadge status={p.box3.status} tooltipKant="rechts" /> : undefined} live>
        <ResultBedrag
          label="Box 3-belasting"
          bedrag={heeftInvoer ? r.belasting : null}
          leegTekst="Vul je bezittingen in"
          toelichting={heeftInvoer && r.loont ? `Met tegenbewijs, ${formatEuro(besparing)} minder dan het forfait` : undefined}
        />
        <StatLijst className="mt-5" aria-label="Forfaitair stelsel">
          <StatRow label="Rendementsgrondslag" bedrag={r.forfait.rendementsgrondslag} />
          <StatRow label="Heffingsvrij vermogen" bedrag={b3.heffingsvrijVermogen * (partner ? 2 : 1)} variant="min" status={p.box3.status} />
          <StatRow label="Forfaitair voordeel" bedrag={r.voordeelForfait} variant="subtotaal" status={statusBank !== 'definitief' ? statusBank : statusOverig} />
          <StatRow label={`Belasting (${formatPct(b3.tarief, 0)})`} bedrag={r.belastingForfait} />
          {werkelijk !== null && <StatRow label="Werkelijk rendement" bedrag={werkelijk} toelichting="Zonder heffingsvrij vermogen en schuldendrempel" />}
          <StatRow label="Te betalen" bedrag={r.belasting} variant="totaal" />
        </StatLijst>
        <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
          {!b3.tegenbewijs.beschikbaar || b3.tegenbewijs.kanaal === 'geen' ? (
            <>Tegenbewijs met het werkelijk rendement is in {jaar} niet mogelijk.</>
          ) : !allesBekend ? (
            <>Vul bij elke bezitting de waarde op 1 januari {jaar + 1} in, dan zie je of tegenbewijs loont.</>
          ) : r.loont ? (
            <>
              Tegenbewijs loont: je bespaart <strong className="font-semibold tabular-nums">{formatEuro(besparing)}</strong>. Dat doe je {KANAAL[b3.tegenbewijs.kanaal]}.
            </>
          ) : (
            <>Tegenbewijs loont niet: je werkelijk rendement is niet lager dan het forfaitaire voordeel.</>
          )}
        </div>
        <Disclaimer className="mt-4" />
      </ResultPanel>
      <MobileResultBar
        label={`Box 3-belasting ${jaar}`}
        bedrag={heeftInvoer ? r.belasting : null}
        toelichting={heeftInvoer ? (r.loont ? 'Met tegenbewijs' : `Voordeel ${formatEuro(r.voordeelForfait)}`) : undefined}
        leegTekst="Vul je bezittingen in"
      />
    </>
  )

  const details = (
    <>
      <WaarschuwingLijst waarschuwingen={r.gekozen.waarschuwingen} />

      {VARIANT_JAAR && varianten.length > 1 && (
        <section aria-labelledby="varianten-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="varianten-titel" className="text-base font-medium text-gray-900">
              {VARIANT_JAAR}: twee voorstellen naast elkaar
            </h2>
            <StatusBadge status="voorstel" />
          </div>
          <p className="mt-1 text-xs text-gray-500">Hetzelfde vermogen, gerekend met het Belastingplan en met de brief die daarna is verschenen.</p>
          <DataTabel
            className="mt-3"
            bijschrift={`Box 3 in ${VARIANT_JAAR} volgens beide voorstellen`}
            kop={['', ...varianten.map((x) => x.label)]}
            rijen={[
              ['Heffingsvrij vermogen', ...varianten.map((x) => formatEuro(x.p.box3.waarde.heffingsvrijVermogen * (partner ? 2 : 1)))],
              ['Forfait overige bezittingen', ...varianten.map((x) => formatPct(x.p.box3.waarde.forfaitOverig))],
              ['Forfaitair voordeel', ...varianten.map((x) => formatEuro(x.voordeelForfait))],
              ['Belasting forfaitair', ...varianten.map((x) => formatEuro(x.belastingForfait))],
              [<strong key="b">Te betalen</strong>, ...varianten.map((x) => <strong key={x.id}>{formatEuro(x.belasting)}</strong>)],
            ]}
          />
        </section>
      )}

      {concept && CONCEPT_JAAR && (
        <section aria-labelledby="concept-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="concept-titel" className="text-base font-medium text-gray-900">
              Vooruitblik {CONCEPT_JAAR}: belasting over het werkelijke resultaat
            </h2>
            <StatusBadge status="voorstel" />
          </div>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-700">
            <p>
              Dit is een wetsvoorstel, nog niet aangenomen. Vanaf {CONCEPT_JAAR} betaal je dan {formatPct(concept.p.box3.waarde.tarief, 0)} over wat je vermogen echt oplevert,
              boven een heffingsvrij resultaat van {formatEuro(concept.p.box3.waarde.regime2028?.heffingsvrijResultaat ?? 0)} per persoon. Spaarrente telt elk jaar, crypto
              over de waardeverandering, aandelen en fondsen pas bij verkoop.
            </p>
            <p>
              Met je invoer van nu kom je dan op ongeveer <strong className="font-semibold tabular-nums">{formatEuro(concept.belasting)}</strong>. Beleggingen tellen hier
              alleen mee met hun rente en dividend, omdat we geen verkoop kennen.
            </p>
          </div>
        </section>
      )}

      <section aria-labelledby="letop-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <h2 id="letop-titel" className="text-base font-medium text-gray-900">
          Goed om te weten
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>
            Vlak voor 1 januari beleggingen omzetten in spaargeld, of een schuld aangaan, levert meestal niets op. Gebeurt dat binnen {b3.arbitrageMaanden} maanden rond de
            peildatum, dan kijkt de Belastingdienst door de wissel heen.
          </li>
          {DAC8_VANAF && (
            <li>
              Vanaf {DAC8_VANAF} geven cryptoplatforms je saldi en transacties door aan de Belastingdienst (DAC8). Geef je crypto dus volledig op, ook bij buitenlandse
              platforms.
            </li>
          )}
          <li>Vermogen op naam van een minderjarig kind telt mee bij de ouder met het gezag. Het kind heeft geen eigen heffingsvrij vermogen.</li>
          <li>Het vermogen telt ook mee voor het kindgebonden budget en de zorgtoeslag, en via het rendement voor je toetsingsinkomen.</li>
        </ul>
      </section>

      <Disclosure titel="Zo is het berekend" subtitel="Per categorie het rendement en de verdeling" defaultOpen={false}>
        <UitlegLijst regels={r.gekozen.uitleg} aria-label="Berekening box 3" />
      </Disclosure>
    </>
  )

  return <CalculatorGrid invoer={invoerBlok} resultaat={resultaat} details={details} />
}
