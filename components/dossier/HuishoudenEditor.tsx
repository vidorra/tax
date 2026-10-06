'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { CircleX, Save } from 'lucide-react'
import type { HuishoudenInvoer, PersoonId, PersoonInvoer, Status } from '@/lib/tax/types'
import type { DossierStatus } from '@/lib/dossier/status'
import type { JaarOverzicht } from '@/lib/dossier/opslag'
import type { VeldId } from '@/lib/dossier/veld'
import type { Controle } from '@/lib/controles/types'
import { verborgenMeldingen, zonderVerborgenMeldingen } from '@/lib/controles'
import { SALDI_SECTIE } from '@/lib/controles/regels/doorrol'
import { vulIds, willekeurigeId } from '@/lib/dossier/ids'
import { leesbareFout } from '@/lib/dossier/foutmelding'
import { Alert, Button, Card, ChipGroup, MobileResultBar, ResultPanel, Select, StatusBadge, formatEuro, kondigAan } from '@/components/ui'
import { OPEN_VERZOEK_UITKLAP } from '@/components/ui/Disclosure'
import { api } from './api'
import { useBerekening } from './useBerekening'
import { ResultaatInhoud, teBetalenNaGrenzen } from './ResultaatInhoud'
import { HuishoudenSectie } from './secties/HuishoudenSectie'
import { OndernemingSectie } from './secties/OndernemingSectie'
import { AanslagSectie, LoonSectie, PensioenSectie } from './secties/PersoonInkomenSecties'
import { Box2Sectie, PgaSectie, VerdelingSectie, VermogenSectie, WoningSectie } from './secties/HuishoudenPostenSecties'
import { persoonNaam } from './secties/types'
import { DoorrolKaart } from './DoorrolKaart'
import { meldOnopgeslagen } from './onopgeslagen'
import { grensKort } from './grenzen-tekst'
import { useControles } from './controles/useControles'
import { ControlePaneel, CONTROLES_ID } from './controles/ControlePaneel'
import { ControleTeller } from './controles/ControleTeller'
import { StatusKeuze } from './controles/StatusKeuze'
import { PersoonVeldProvider, VeldControlesProvider } from './controles/veld-context'
import { SectieBadges } from './controles/SectieBadges'
import type { ControleActies } from './controles/ControleItem'
import { useSpringNaar } from './springen/useSpringNaar'
import { SpringNaarMelding } from './springen/SpringNaarMelding'
import { RegelingZoeker } from './zoeken/RegelingZoeker'

export interface EditorProps {
  jaar: number
  invoer: HuishoudenInvoer
  status: DossierStatus
  variant: string | null
  versie: number
  updatedAt: string
  parametersGewijzigd: boolean
  varianten: Array<{ id: string; label: string; status: Status }>
  jaarStatus: Status
  concept: boolean
  /** Er is een dossier voor het jaar ervoor; alleen dan staat de kaart om saldi opnieuw over te nemen er. */
  vorigJaarBestaat?: boolean
  /** Ronde 2 (A3): ISO-datum van vandaag (van de server), voor de controles. */
  vandaag?: string
  /** Ronde 2 (A3): moment van indienen van de laatste opslag (`JaarOverzicht.ingediend`). */
  ingediend?: { op: string; gewijzigdNa: boolean } | null
  /** Ronde 2 (A3): invoer van vorig jaar, voor de controles op beginbalans en saldi. */
  vorigInvoer?: HuishoudenInvoer | null
  /** Ronde 2 (A3): `?veld=` van de pagina: na het laden naar dit veld springen. */
  springNaarVeld?: VeldId | null
}

function tijd(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

/** Ronde 2 (A3): is er nog (bijna) niets ingevuld? Dan zegt het blok Controles "Vul eerst je gegevens in." */
function invoerLeeg(i: HuishoudenInvoer): boolean {
  return (
    i.personen.every((p) => (p.ondernemingen?.length ?? 0) === 0 && (p.loon?.length ?? 0) === 0 && !p.resultaatOverigWerk) &&
    (i.box3?.posities?.length ?? 0) === 0 &&
    !i.eigenWoning &&
    (i.box2?.length ?? 0) === 0
  )
}

const volgendFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

const SMAL = '(max-width: 399px)'
/** Ronde 2 (A3): een smal scherm (360 px): met de foutknop past "Bekijk berekening" dan niet naast het bedrag. */
function useSmal(): boolean {
  return useSyncExternalStore(
    (opWijziging) => {
      const m = window.matchMedia(SMAL)
      m.addEventListener('change', opWijziging)
      return () => m.removeEventListener('change', opWijziging)
    },
    () => window.matchMedia(SMAL).matches,
    () => false,
  )
}

/** De melding als opslaan niet lukt; de tabrij (JaarNav) springt erheen. */
const OPSLAAN_FOUT_ID = 'opslaan-fout'

export function HuishoudenEditor(props: EditorProps) {
  const router = useRouter()
  const [invoer, setInvoer] = useState<HuishoudenInvoer>(props.invoer)
  const [status, setStatus] = useState<DossierStatus>(props.status)
  const [opgeslagenStatus, setOpgeslagenStatus] = useState<DossierStatus>(props.status)
  const [ingediend, setIngediend] = useState(props.ingediend ?? null)
  const [variant, setVariant] = useState<string | null>(props.variant)
  const [versie, setVersie] = useState(props.versie)
  const [opgeslagen, setOpgeslagen] = useState(props.updatedAt)
  const [gewijzigd, setGewijzigd] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<{ melding: string; fouten?: string[] } | null>(null)
  const [serverMelding, setServerMelding] = useState<string | null>(null)
  const [paramsGewijzigd, setParamsGewijzigd] = useState(props.parametersGewijzigd)
  const [actief, setActief] = useState<PersoonId>('A')
  const [vandaag] = useState(() => props.vandaag ?? new Date().toISOString().slice(0, 10))

  const wijzig = useCallback((fn: (d: HuishoudenInvoer) => void) => {
    setInvoer((vorig) => {
      const d = structuredClone(vorig)
      fn(d)
      // Ronde 2: een nieuw lijstitem (werkgever, onderneming, investering, leningdeel, box 2-belang) krijgt direct een
      // vaste, willekeurige id; bestaande id's blijven staan (lib/dossier/ids.ts).
      return vulIds(d, willekeurigeId)
    })
    setGewijzigd(true)
  }, [])

  const persoon = invoer.personen.find((p) => p.id === actief) ?? invoer.personen[0]
  const wijzigPersoon = useCallback(
    (fn: (p: PersoonInvoer) => void) =>
      wijzig((d) => {
        const p = d.personen.find((x) => x.id === persoon.id)
        if (p) fn(p)
      }),
    [wijzig, persoon.id],
  )

  const { resultaat, fout: rekenFout } = useBerekening(invoer, variant)
  const variantStatus = useMemo(() => (variant ? (props.varianten.find((v) => v.id === variant)?.status ?? props.jaarStatus) : props.jaarStatus), [variant, props.varianten, props.jaarStatus])

  // Ronde 2 (A3): controles live op de invoer, met de aangiftestaat van de pagina (negeringen, controles.streng).
  const ctl = useControles({ jaar: props.jaar, invoer, resultaat, variant, status, ingediend, gewijzigd, vorigInvoer: props.vorigInvoer ?? null, vandaag })
  const { uitkomst, streng, maakStreng, staat } = ctl
  const fouten = uitkomst.telling.fouten
  const verborgen = useMemo(() => verborgenMeldingen(uitkomst), [uitkomst])
  const getoond = useMemo(() => (resultaat ? zonderVerborgenMeldingen(resultaat, verborgen) : null), [resultaat, verborgen])

  const spring = useSpringNaar({ invoer, actief: persoon.id, kiesPersoon: setActief })
  const smal = useSmal()
  const foutknop = streng && fouten > 0
  // Opgeslagen als Gecontroleerd, maar er staat weer een fout open (bijvoorbeeld na Terugzetten van een negering):
  // opslaan zet de status terug naar Concept, ook zonder gewijzigde invoer.
  const statusBijwerken = !gewijzigd && opgeslagenStatus === 'gecontroleerd' && status === 'gecontroleerd' && uitkomst.blokkeertGecontroleerd

  useEffect(() => {
    if (!gewijzigd) return
    const waarschuw = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', waarschuw)
    return () => window.removeEventListener('beforeunload', waarschuw)
  }, [gewijzigd])

  async function bewaar(): Promise<boolean> {
    setBezig(true)
    setFout(null)
    setServerMelding(null)
    // Ronde 2 (A3): een negering die net is gezet, moet op de server staan vóór die de status beoordeelt.
    if (staat) await staat.flush()
    const r = await api<{ jaar: JaarOverzicht; melding?: string }>(`/api/dossier/jaren/${props.jaar}`, {
      method: 'PUT',
      body: { invoer, status, variant, versie },
    })
    setBezig(false)
    if (!r.ok || !r.data) {
      setFout({ melding: r.fout ?? 'Opslaan is niet gelukt.', fouten: r.fouten })
      return false
    }
    setVersie(r.data.jaar.versie)
    setOpgeslagen(r.data.jaar.updatedAt)
    setParamsGewijzigd(false)
    setGewijzigd(false)
    setStatus(r.data.jaar.status)
    setOpgeslagenStatus(r.data.jaar.status)
    setIngediend(r.data.jaar.ingediend ?? null)
    if (r.data.melding) {
      setServerMelding(r.data.melding)
      kondigAan(r.data.melding)
    } else {
      kondigAan('Opgeslagen.')
    }
    return true
  }

  // Ronde 2 (A3): niet-opgeslagen invoer melden aan de navigatie (JaarNav, knop terug).
  const bewaarRef = useRef(bewaar)
  bewaarRef.current = bewaar
  useEffect(() => {
    meldOnopgeslagen({ gewijzigd, bewaar: () => bewaarRef.current(), foutId: OPSLAAN_FOUT_ID })
  }, [gewijzigd])
  useEffect(() => () => meldOnopgeslagen(null), [])

  // Ronde 2 (A3): `?veld=` (vanuit Export, de invulhulp of Planning): na het laden naar het veld, daarna uit de adresbalk.
  const springRef = useRef(spring)
  springRef.current = spring
  useEffect(() => {
    const veld = props.springNaarVeld
    if (!veld) return
    const t = window.setTimeout(() => {
      void springRef.current.springNaar(veld)
      const url = new URL(window.location.href)
      url.searchParams.delete('veld')
      window.history.replaceState(window.history.state, '', url.toString())
    }, 80)
    return () => window.clearTimeout(t)
  }, [props.springNaarVeld])

  const bekijkControles = useCallback(async () => {
    maakStreng('paneel')
    const el = document.getElementById(CONTROLES_ID)
    if (!el) return
    el.dispatchEvent(new CustomEvent(OPEN_VERZOEK_UITKLAP))
    await volgendFrame()
    const rustig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }, [maakStreng])

  const acties: ControleActies = {
    naar: (c: Controle, veld?: string) => {
      const doel = veld ?? c.veld
      if (doel) void spring.springNaar(doel, { sectie: c.sectie })
      else if (c.sectie) void spring.springNaarSectie(c.sectie)
    },
    los: (c: Controle) => {
      const o = c.oplossing
      if (!o) return
      if (o.pas) {
        wijzig(o.pas)
        kondigAan(`${o.label}: gedaan. Sla op om het te bewaren.`)
      } else if (o.actie === 'saldi-opnieuw-overnemen') {
        void spring.springNaarSectie(SALDI_SECTIE).then(() => {
          document.getElementById(SALDI_SECTIE)?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click()
        })
      } else if (o.actie === 'naar-invulhulp') {
        router.push(`/dossier/${props.jaar}/aangifte/`)
      } else if (o.actie === 'naar-planning') {
        router.push(`/dossier/${props.jaar}/planning/`)
      }
    },
  }

  const persoonProps = { persoon, wijzigPersoon, jaar: props.jaar, huishouden: { invoer, wijzig, resultaat } }
  const leeg = invoerLeeg(invoer)
  const paneel = <ControlePaneel uitkomst={uitkomst} streng={streng} acties={acties} staat={staat} onOpen={() => maakStreng('paneel')} leeg={leeg} />
  const grens = resultaat ? grensKort({ teBetalenIB: resultaat.totaal.teBetalenIB, teBetalenIBNaGrenzen: resultaat.totaal.teBetalenIBNaGrenzen }) : null
  const toelichting = resultaat ? [grens ?? `Zvw ${formatEuro(resultaat.totaal.teBetalenZvw)}`, gewijzigd ? 'niet opgeslagen' : null].filter(Boolean).join(' · ') : undefined

  return (
    <div>
      <Card className="mb-6" padding="klein">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <StatusKeuze
            status={status}
            onStatus={(s) => {
              setStatus(s)
              setGewijzigd(true)
            }}
            fouten={fouten}
            streng={streng}
            onWilGecontroleerd={() => maakStreng('status')}
            onBekijkControles={() => void bekijkControles()}
          />
          {props.varianten.length > 0 && (
            <Select
              label="Parameters"
              value={variant ?? ''}
              onChange={(v) => {
                setVariant(v || null)
                setGewijzigd(true)
              }}
              options={[{ value: '', label: 'Standaard' }, ...props.varianten.map((v) => ({ value: v.id, label: v.label }))]}
              wrapperClassName="sm:w-64"
            />
          )}
          <div>
            <p aria-hidden="true" className="mb-1.5 text-sm font-medium text-gray-700">
              Controles
            </p>
            <ControleTeller telling={uitkomst.telling} streng={streng} onKlik={() => void bekijkControles()} />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-3 sm:justify-end">
            <p className="text-sm text-gray-600" aria-live="polite">
              {gewijzigd ? (
                <span className="font-medium text-amber-800">Niet opgeslagen wijzigingen</span>
              ) : statusBijwerken ? (
                <span className="font-medium text-amber-800">Sla op om de status bij te werken</span>
              ) : (
                `Opgeslagen op ${tijd(opgeslagen)}`
              )}
            </p>
            <Button onClick={() => void bewaar()} disabled={bezig || !(gewijzigd || statusBijwerken)}>
              <Save aria-hidden="true" className="h-4 w-4" />
              {bezig ? 'Bezig met opslaan' : 'Opslaan'}
            </Button>
          </div>
        </div>
        {serverMelding && (
          <Alert variant="let-op" className="mt-3">
            {serverMelding}
          </Alert>
        )}
        {variantStatus !== 'definitief' && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <StatusBadge status={variantStatus} klein tooltipKant="links" />
            Niet alle cijfers van {props.jaar} zijn definitief; de uitkomst kan nog veranderen.
          </p>
        )}
        {opgeslagenStatus === 'ingediend' && ingediend?.gewijzigdNa && !gewijzigd && <p className="mt-3 text-sm text-amber-800">Gewijzigd na indienen.</p>}
      </Card>

      {props.vorigJaarBestaat !== false && (
        <div id={SALDI_SECTIE} className="scroll-mt-24">
          <DoorrolKaart
            jaar={props.jaar}
            versie={versie}
            gewijzigd={gewijzigd}
            persoonNamen={Object.fromEntries(invoer.personen.map((p) => [p.id, persoonNaam(p)]))}
            onOvergenomen={(d) => {
              setInvoer(d.invoer)
              setVersie(d.versie)
              setOpgeslagen(d.updatedAt)
              setParamsGewijzigd(false)
              setGewijzigd(false)
            }}
          />
        </div>
      )}

      {props.concept && (
        <Alert variant="let-op" className="mb-6">
          De parameters van {props.jaar} zijn een concept op basis van aangekondigde plannen. Gebruik de uitkomst alleen als richting.
        </Alert>
      )}
      {paramsGewijzigd && (
        <Alert variant="info" className="mb-6">
          De belastingregels van {props.jaar} zijn bijgewerkt sinds je laatste opslag. De berekening hieronder gebruikt de nieuwe regels; sla op om ook de bewaarde uitkomst bij te werken.
        </Alert>
      )}
      {fout && (
        // Vast id: de knop "Opslaan en terug" in de tabrij springt hierheen als opslaan niet lukt (JaarNav).
        <div id={OPSLAAN_FOUT_ID} tabIndex={-1} className="mb-6 scroll-mt-24 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Alert variant="let-op" role="alert" titel={fout.melding}>
            {fout.fouten && fout.fouten.length > 0 && (
              <ul className="mt-1 space-y-1 text-sm">
                {fout.fouten.slice(0, 12).map((f) => {
                  const l = leesbareFout(f, invoer)
                  return (
                    <li key={f} className="flex flex-wrap items-center gap-x-2">
                      <span>{l.tekst}</span>
                      {l.veld && (
                        <Button variant="kaal" grootte="sm" onClick={() => void spring.springNaar(l.veld!)}>
                          Naar het veld<span className="sr-only">: {l.tekst}</span>
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <VeldControlesProvider open={uitkomst.open} streng={streng}>
          <div className="min-w-0 space-y-6">
            <RegelingZoeker invoer={invoer} onSpring={(veld) => void spring.springNaar(veld)} onKiezer={(id, optie) => void spring.openKiezer(id, optie)} />
            <HuishoudenSectie invoer={invoer} wijzig={wijzig} />

            {invoer.personen.length > 1 && (
              <Card padding="klein">
                <ChipGroup<PersoonId>
                  label="Gegevens invullen voor"
                  kolommen={2}
                  value={persoon.id}
                  onChange={setActief}
                  options={invoer.personen.map((p) => ({ value: p.id, label: persoonNaam(p) }))}
                />
              </Card>
            )}
            <PersoonVeldProvider persoon={persoon.id}>
              <OndernemingSectie key={`o-${persoon.id}`} {...persoonProps} resultaat={resultaat?.personen.find((p) => p.id === persoon.id) ?? null} />
              <LoonSectie key={`l-${persoon.id}`} {...persoonProps} />
              <PensioenSectie key={`p-${persoon.id}`} {...persoonProps} />
              <AanslagSectie key={`a-${persoon.id}`} {...persoonProps} />
            </PersoonVeldProvider>

            <WoningSectie invoer={invoer} wijzig={wijzig} resultaat={resultaat} />
            <VermogenSectie invoer={invoer} wijzig={wijzig} resultaat={resultaat} />
            <PgaSectie invoer={invoer} wijzig={wijzig} />
            <Box2Sectie invoer={invoer} wijzig={wijzig} resultaat={resultaat} />
            <VerdelingSectie invoer={invoer} wijzig={wijzig} gekozen={resultaat?.verdeling ?? null} />
          </div>
        </VeldControlesProvider>

        <div className="min-w-0">
          <ResultPanel titel={`Uitkomst ${props.jaar}`} live className="lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            {getoond ? (
              <ResultaatInhoud resultaat={getoond} invoer={invoer} controles={paneel} />
            ) : (
              <div className="space-y-5">
                <Alert variant="let-op">{rekenFout}</Alert>
                {paneel}
              </div>
            )}
          </ResultPanel>
        </div>
      </div>

      <SectieBadges open={uitkomst.open} streng={streng} />
      <SpringNaarMelding melding={spring.melding} onSluit={spring.sluitMelding} />
      <MobileResultBar
        label={resultaat && teBetalenNaGrenzen(resultaat) < 0 ? 'Terug IB' : 'Te betalen IB'}
        bedrag={resultaat ? Math.abs(teBetalenNaGrenzen(resultaat)) : null}
        toelichting={toelichting}
        leegTekst="Controleer je invoer"
        knopLabel={foutknop && smal ? 'Berekening' : undefined}
        links={
          foutknop ? (
            <button
              type="button"
              onClick={() => void bekijkControles()}
              aria-controls={CONTROLES_ID}
              className="flex min-h-[44px] flex-col items-start justify-center rounded-xl border border-red-200 bg-red-50 px-2 py-1 text-left text-[11px] font-medium leading-tight text-red-900 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex items-center gap-1 text-sm">
                <CircleX aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 text-red-700" />
                {fouten}
              </span>
              <span>{fouten === 1 ? 'fout' : 'fouten'} open</span>
            </button>
          ) : undefined
        }
      />
    </div>
  )
}
