'use client'

/**
 * Ronde 2 (A1): inhoud van de pagina Aangifte invullen (/dossier/[jaar]/aangifte/). Per scherm van de online aangifte,
 * in de volgorde en met de woorden van de Belastingdienst, wat je moet invullen, aanvinken of controleren. Rekent met de
 * opgeslagen invoer; invoeren gebeurt alleen op Invoer en resultaat (Aanpassen springt daarheen, na `flush()`).
 *
 * De aangiftestaat (vinkjes, VIA-bedragen, keuzes, eindcontrole) komt uit de AangifteStaatProvider die page.tsx om
 * JaarKop en deze component zet; na elke wijziging schrijft deze pagina de telling per persoon
 * (`samenvatting-invulhulp`), waaruit `laadJaarPagina` de badge in de tabrij rekent. Openen zet `controles.streng`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId } from '@/lib/tax/types'
import { berekenDossier } from '@/lib/dossier/bereken'
import { getJaar } from '@/lib/tax/years'
import type { DossierStatus } from '@/lib/dossier/status'
import { openPerErnst } from '@/lib/controles'
import { veldHref } from '@/lib/dossier/veld'
import type { Controle } from '@/lib/controles/types'
import { bouwInvulhulp, schermTitel } from '@/lib/invulhulp/opbouw'
import { beginFilter, invoerIsLeeg, opslagMoment, vindRij } from '@/lib/invulhulp/pagina'
import type { InvulhulpOpbouw, Scherm, Veld } from '@/lib/invulhulp/types'
import { persoonNaam } from '@/lib/invulhulp/waarden'
import {
  allesAfvinken,
  eindcontrole,
  inFilter,
  kiesVerschil,
  klopt,
  ongedaan,
  persoonVoorScherm,
  samenBij,
  schermStatus,
  schermTelling,
  schermenVan,
  standaardZichtbaar,
  telling,
  tellingGelijk,
  vink,
  wijktAf,
  zetNotitie,
  type InvulhulpFilter,
} from '@/lib/invulhulp/voortgang'
import { Alert, Button, ButtonLink, Card, ChipGroup, Disclosure, MobileResultBar, kondigAan } from '@/components/ui'
import { useAangifteStaatContext } from '../useAangifteStaat'
import { AangifteScherm, type RijActies } from './AangifteScherm'
import { ControlePaneel, CONTROLES_ID } from '../controles/ControlePaneel'
import type { ControleActies } from '../controles/ControleItem'
import { aantalTekst } from '../controles/niveau'
import { useControles } from '../controles/useControles'
import { Eindcontrole } from './Eindcontrole'
import { foutBijScherm, gaNaar, kopId } from './hulp'
import { OnderdelenNav, type Onderdeel } from './OnderdelenNav'
import { VoortgangPaneel } from './VoortgangPaneel'

export interface AangifteInvullenProps {
  jaar: number
  invoer: HuishoudenInvoer
  variant: string | null
  status: DossierStatus
  ingediend?: { op: string; gewijzigdNa: boolean } | null
  /** Tijdstip van de laatste opslag van de invoer (ISO). */
  bijgewerkt: string
  /** ISO-datum van vandaag, van de server. */
  vandaag: string
  /** Over de indeling: de aangifte opent nog, of de volgorde komt van een ander jaar. Alleen getoond als er rijen zijn. */
  melding?: string | null
  /** Invoer van vorig jaar (van de server), voor de controles op beginbalans en saldi; null als er geen is. */
  vorigInvoer?: HuishoudenInvoer | null
}

/** Een rij in de invulhulp uit een link als /dossier/2025/aangifte/#sleutel. */
function rijUitHref(href: string | undefined, jaar: number): string | null {
  const m = href ? new RegExp(`^/dossier/${jaar}/aangifte/#(.+)$`).exec(href) : null
  return m ? decodeURIComponent(m[1]) : null
}

/** Berekende regels die de eindcontrole zelf toont (met het bedrag van het programma ernaast). */
const IN_EINDCONTROLE = new Set(['te-betalen-ib', 'terug-ib', 'te-betalen-zvw', 'terug-zvw'])

const FILTER_LABEL: Record<InvulhulpFilter, { lang: string; kort: string }> = {
  alles: { lang: 'Alles', kort: 'Alles' },
  'te-doen': { lang: 'Nog te doen', kort: 'Te doen' },
  verschillen: { lang: 'Verschillen', kort: 'Verschil' },
}

const nu = () => new Date().toISOString()

export function AangifteInvullen({ jaar, invoer, variant, status, ingediend, bijgewerkt, vandaag, melding, vorigInvoer }: AangifteInvullenProps) {
  const router = useRouter()
  const s = useAangifteStaatContext()
  const v = variant ?? undefined
  const params = useMemo(() => getJaar(jaar, v), [jaar, v])
  const resultaat = useMemo<HuishoudenResultaat | null>(() => {
    try {
      return berekenDossier({ ...invoer, variant: v }, { variant: v })
    } catch {
      return null
    }
  }, [invoer, v])
  const opbouw = useMemo<InvulhulpOpbouw | null>(() => {
    if (!resultaat) return null
    try {
      return bouwInvulhulp({ jaar, invoer, resultaat, params })
    } catch {
      return null
    }
  }, [jaar, invoer, resultaat, params])

  const personen = invoer.personen
  const [persoon, setPersoon] = useState<PersoonId>(personen[0]?.id ?? 'A')
  const bewerkbaar = s.laden === 'klaar'
  const voortgang = s.staat.invulhulp
  const vgs = voortgang?.velden?.[persoon]
  const [filterKeuze, setFilterKeuze] = useState<InvulhulpFilter | null>(() => (bewerkbaar && opbouw ? beginFilter(opbouw, voortgang, persoon) : null))
  const filter = filterKeuze ?? 'alles'
  const [vast, setVast] = useState<ReadonlySet<string>>(() => new Set())
  const [doel, setDoel] = useState<{ id: string; focus?: string } | null>(null)

  // Filter bij het openen: pas als de staat er is ("Nog te doen" als er al iets is afgevinkt).
  useEffect(() => {
    if (filterKeuze === null && bewerkbaar && opbouw) setFilterKeuze(beginFilter(opbouw, voortgang, persoon))
  }, [filterKeuze, bewerkbaar, opbouw, voortgang, persoon])

  // Openen van de invulhulp maakt de controles streng (één keer; een tweede keer verandert niets).
  const strengGezet = useRef(false)
  useEffect(() => {
    if (!bewerkbaar || !opbouw || strengGezet.current || s.staat.controles?.streng) return
    strengGezet.current = true
    s.wijzig([{ soort: 'controles-streng', waarde: { op: nu(), door: 'invulhulp' } }], { direct: true })
  }, [bewerkbaar, opbouw, s])

  // De telling per persoon in de staat, voor de badge in de tabrij en het overzicht.
  useEffect(() => {
    if (!bewerkbaar || !opbouw) return
    const wijzigingen = personen.flatMap((p) => {
      const t = telling(opbouw, voortgang, p.id)
      const bestaand = s.staat.samenvatting?.invulhulp?.[p.id]
      if (tellingGelijk(bestaand, t)) return []
      if (!bestaand && t.afgevinkt === 0 && t.gewijzigd === 0 && t.verschillen === 0) return []
      return [{ soort: 'samenvatting-invulhulp' as const, persoon: p.id, waarde: t }]
    })
    if (wijzigingen.length) s.wijzig(wijzigingen)
  }, [bewerkbaar, opbouw, voortgang, personen, s])

  // Dezelfde controles als op Invoer en Export (met vorig jaar), uit de hook van onderdeel controles.
  const { uitkomst, streng } = useControles({
    jaar,
    invoer,
    resultaat,
    variant,
    status,
    ingediend: ingediend ?? null,
    gewijzigd: false,
    vorigInvoer: vorigInvoer ?? null,
    vandaag,
  })
  const open = useMemo(() => uitkomst?.open ?? [], [uitkomst])
  const fouten = useMemo(() => open.filter((c) => c.ernst === 'fout'), [open])

  // Springen naar een rij of scherm (#sleutel, vanuit de controles of een gedeelde link).
  const spring = useCallback(
    (sleutel: string) => {
      if (!opbouw) return
      const r = vindRij(opbouw, sleutel)
      if (!r) return
      const p = persoonVoorScherm(opbouw, r.scherm)
      setPersoon(p)
      if (r.veld) setVast((oud) => new Set(oud).add(r.veld!.sleutel))
      setDoel(r.veld ? { id: r.veld.sleutel } : { id: r.scherm.sleutel, focus: kopId(r.scherm.sleutel) })
    },
    [opbouw],
  )
  useEffect(() => {
    const lees = () => {
      const h = window.location.hash.slice(1)
      if (h) spring(decodeURIComponent(h))
    }
    lees()
    window.addEventListener('hashchange', lees)
    return () => window.removeEventListener('hashchange', lees)
  }, [spring])
  useEffect(() => {
    if (!doel) return
    if (gaNaar(doel.id, doel.focus)) setDoel(null)
  }, [doel, persoon, vast])

  const kiesFilter = (f: InvulhulpFilter) => {
    setFilterKeuze(f)
    setVast(new Set())
  }
  const kiesPersoon = (p: PersoonId) => {
    setPersoon(p)
    setVast(new Set())
  }
  const houdVast = (...sleutels: string[]) => setVast((oud) => new Set([...oud, ...sleutels]))

  const naar = useCallback(
    async (href: string) => {
      await s.flush()
      router.push(href)
    },
    [s, router],
  )

  const acties: RijActies = {
    klopt: (veld: Veld) => {
      houdVast(veld.sleutel)
      s.wijzig(
        klopt(veld, {
          personen: [persoon],
          huidig: vgs?.[veld.sleutel],
          op: nu(),
        }),
        { direct: true },
      )
      kondigAan(`Gecontroleerd: ${veld.label}.`)
    },
    ongedaan: (veld) => {
      houdVast(veld.sleutel)
      s.wijzig(ongedaan(veld, { personen: [persoon], huidig: vgs?.[veld.sleutel] }), { direct: true })
      kondigAan(`Ongedaan gemaakt: ${veld.label}.`)
    },
    vink: (veld, aan) => {
      houdVast(veld.sleutel)
      s.wijzig(
        vink(veld, aan, {
          personen: [persoon],
          huidig: vgs?.[veld.sleutel],
          op: nu(),
        }),
      )
    },
    via: (veld, bedrag) => {
      houdVast(veld.sleutel)
      s.wijzig(
        wijktAf(veld, bedrag, {
          personen: [persoon],
          huidig: vgs?.[veld.sleutel],
        }),
      )
    },
    keuze: (veld, keuze) => {
      houdVast(veld.sleutel)
      s.wijzig(
        kiesVerschil(veld, keuze, {
          personen: [persoon],
          huidig: vgs?.[veld.sleutel],
        }),
      )
    },
    notitie: (veld, tekst) =>
      s.wijzig(
        zetNotitie(veld, tekst, {
          personen: [persoon],
          huidig: vgs?.[veld.sleutel],
        }),
      ),
    allesAfvinken: (scherm: Scherm) => {
      const w = allesAfvinken(scherm, vgs, { personen: [persoon], op: nu() })
      if (w.length === 0) return
      houdVast(...w.flatMap((x) => (x.soort === 'veld' ? [x.sleutel] : [])))
      s.wijzig(w, { direct: true })
      kondigAan(`${w.length} ${w.length === 1 ? 'rij' : 'rijen'} afgevinkt op ${scherm.titel}.`)
    },
    naar: (href) => void naar(href),
    naarScherm: (sleutel) => void gaNaar(sleutel, kopId(sleutel)),
  }

  // --- Lege en foutstatussen ------------------------------------------------------------------------------------
  if (invoerIsLeeg(invoer)) {
    return (
      <Card>
        <p className="text-sm leading-relaxed text-gray-700">
          Er is nog niets ingevuld voor {jaar}. Vul eerst je gegevens in bij Invoer en resultaat. Daarna zie je hier per scherm van de aangifte wat je moet invullen.
        </p>
        <ButtonLink href={`/dossier/${jaar}/`} grootte="sm" className="mt-4">
          Naar de invoer
        </ButtonLink>
      </Card>
    )
  }
  if (!resultaat || !opbouw) {
    return (
      <Alert variant="let-op">
        <p>De berekening lukt niet met de opgeslagen invoer. Controleer de invoer van dit jaar.</p>
        <ButtonLink href={`/dossier/${jaar}/`} grootte="sm" variant="secundair" className="mt-3">
          Naar de invoer
        </ButtonLink>
      </Alert>
    )
  }

  // --- Schermen van de gekozen persoon ----------------------------------------------------------------------------
  const metPartner = personen.length > 1
  const naamVan = (id: PersoonId) => persoonNaam(personen.find((p) => p.id === id))
  const huidigeNaam = naamVan(persoon)
  const schermen = schermenVan(opbouw, persoon).map((sc) =>
    sc.id === 'overzicht'
      ? {
          ...sc,
          rubrieken: sc.rubrieken.map((r) => ({
            ...r,
            velden: r.velden.filter((x) => !IN_EINDCONTROLE.has(x.id)),
          })),
        }
      : sc,
  )
  const tellingen = Object.fromEntries(personen.map((p) => [p.id, telling(opbouw, voortgang, p.id)])) as Record<PersoonId, ReturnType<typeof telling>>
  const t = tellingen[persoon] ?? {
    afgevinkt: 0,
    totaal: 0,
    verschillen: 0,
    gewijzigd: 0,
  }
  const tel = (f: InvulhulpFilter) =>
    schermen.reduce(
      (n, sc) =>
        n +
        sc.rubrieken.reduce((m, r) => m + r.velden.filter((x) => standaardZichtbaar(x, vgs?.[x.sleutel]) && x.rij !== 'berekend' && inFilter(x, vgs?.[x.sleutel], f)).length, 0),
      0,
    )
  const aantallen = {
    'te-doen': tel('te-doen'),
    verschillen: tel('verschillen'),
  }
  const pr = resultaat.personen.find((p) => p.id === persoon)
  const programma = voortgang?.programma?.[persoon]
  const foutenVan = (sc: Scherm): Controle[] => (streng ? fouten.filter((c) => foutBijScherm(sc, c)) : [])

  const onderdelen: Onderdeel[] = schermen.map((sc) => {
    const st = schermTelling(sc, vgs)
    let status = schermStatus(st, foutenVan(sc).length > 0)
    if (sc.id === 'overzicht' && pr) {
      const e = eindcontrole(pr, programma)
      status = e.ib.gelijk === false || e.zvw.gelijk === false ? 'aandacht' : e.ib.gelijk === true ? 'klaar' : 'niet-begonnen'
    }
    return { sleutel: sc.sleutel, titel: schermTitel(sc), status, telling: st }
  })
  const overzicht = schermen.find((sc) => sc.id === 'overzicht')
  const klaar = t.totaal > 0 && t.afgevinkt >= t.totaal && fouten.length === 0
  const moment = opslagMoment(bijgewerkt)
  const samenElders = !metPartner || persoon === samenBij(opbouw) ? null : opbouw.schermen.some((sc) => sc.persoon === 'samen') ? naamVan(samenBij(opbouw)) : null

  const perErnst = openPerErnst(uitkomst)
  const controleActies: ControleActies = {
    naar: (c: Controle, veld?: string) => {
      const rij = c.invulhulpSleutel ?? rijUitHref(c.href, jaar)
      if (rij && !veld) return spring(rij)
      const doel = veld ?? c.veld
      if (doel) void naar(veldHref(jaar, doel, 'aangifte'))
      else if (c.sectie) void naar(`/dossier/${jaar}/?terug=aangifte#${c.sectie}`)
      else if (c.href) void naar(c.href)
    },
    href: (c: Controle, veld?: string) => (veld || c.invulhulpSleutel || rijUitHref(c.href, jaar) || c.veld || c.sectie ? null : (c.href ?? null)),
  }
  const controlesKort = streng && (
    <section id={CONTROLES_ID} tabIndex={-1} aria-labelledby="controles-titel" className="mt-5 scroll-mt-6 border-t border-gray-100 pt-4 outline-none">
      <h3 id="controles-titel" className="text-sm font-medium text-gray-900">
        Controles
      </h3>
      {perErnst.fout.length + perErnst['let-op'].length > 0 && (
        <p className="mt-1 text-xs text-gray-600">
          {[perErnst.fout.length > 0 ? aantalTekst('fout', perErnst.fout.length) : null, perErnst['let-op'].length > 0 ? aantalTekst('let-op', perErnst['let-op'].length) : null].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="mt-2">
        <ControlePaneel variant="compact" uitkomst={uitkomst} streng acties={controleActies} staat={s} jaar={jaar} />
      </div>
    </section>
  )

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {melding && (
            <Alert variant="info" className="print:hidden">
              <p>{melding}</p>
            </Alert>
          )}
          {s.laden === 'fout' && (
            <Alert variant="let-op" titel="Vinkjes niet geladen">
              <p>Je vinkjes en vooraf ingevulde bedragen konden niet worden geladen. Je kunt de bedragen wel kopiëren, maar afvinken wordt pas bewaard als het laden lukt.</p>
              <Button variant="secundair" grootte="sm" className="mt-3" onClick={s.opnieuwLaden}>
                Opnieuw laden
              </Button>
            </Alert>
          )}

          <Card padding="klein" className="space-y-4 print:hidden">
            <div>
              <a
                href="#onderdelen-titel"
                onClick={(e) => {
                  e.preventDefault()
                  gaNaar('onderdelen-titel')
                }}
                className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-[44px] focus:items-center focus:text-sm focus:font-medium focus:text-primary max-lg:hidden"
              >
                Naar de lijst met onderdelen
              </a>
              {metPartner ? (
                <ChipGroup
                  label="Aangifte van"
                  value={persoon}
                  onChange={kiesPersoon}
                  options={personen.map((p) => {
                    const tp = tellingen[p.id]
                    return {
                      value: p.id,
                      label: naamVan(p.id),
                      beschrijving: tp ? `${tp.afgevinkt} van ${tp.totaal}` : undefined,
                    }
                  })}
                />
              ) : (
                <p className="text-sm text-gray-700">
                  Aangifte van <span className="font-medium text-gray-900">{huidigeNaam}</span>
                </p>
              )}
            </div>
            <ChipGroup
              label="Toon"
              value={filter}
              onChange={kiesFilter}
              options={(['alles', 'te-doen', 'verschillen'] as const).map((f) => ({ value: f, label: FILTER_LABEL[f].lang }))}
              render={(o) => {
                const f = o.value as InvulhulpFilter
                const n = f === 'alles' ? null : aantallen[f]
                return (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="sm:hidden">{FILTER_LABEL[f].kort}</span>
                    <span className="hidden sm:inline">{FILTER_LABEL[f].lang}</span>
                    {n !== null && <span className="tabular-nums">{n}</span>}
                  </span>
                )
              }}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
              {moment && (
                <p>
                  <span className="sm:hidden">
                    Opslag van {moment.kort}, {moment.tijd}
                  </span>
                  <span className="hidden sm:inline">
                    Gebaseerd op je opslag van {moment.datum}, {moment.tijd}. Pas je iets aan bij Invoer en resultaat, sla dan eerst op.
                  </span>
                </p>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-primary transition-colors hover:text-primary-dark sm:min-h-[32px]"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                Afdrukken
              </button>
            </div>
          </Card>

          {streng && fouten.length > 0 && (
            <Alert
              variant="fout"
              titel={`Er ${fouten.length === 1 ? 'staat' : 'staan'} nog ${fouten.length} ${fouten.length === 1 ? 'fout' : 'fouten'} open`}
              className="print:hidden"
            >
              <p>Los die eerst op, anders neem je bedragen over die nog veranderen.</p>
              <button
                type="button"
                onClick={() => gaNaar('controles')}
                className="mt-1 inline-flex min-h-[44px] items-center font-medium text-red-900 underline underline-offset-2 transition-colors hover:text-red-700"
              >
                Naar de controles
              </button>
            </Alert>
          )}

          {samenElders && <p className="text-sm text-gray-600">De gezamenlijke schermen (zoals woningen, bezittingen en verdelen) staan bij de aangifte van {samenElders}.</p>}

          <Disclosure titel={`Onderdelen (${onderdelen.length})`} className="lg:hidden print:hidden">
            <OnderdelenNav onderdelen={onderdelen} onKies={(sl) => gaNaar(sl, kopId(sl))} />
          </Disclosure>

          {schermen.map((sc, i) => {
            const volgende = schermen[i + 1]
            const extra =
              sc.id === 'overzicht' && pr ? (
                <Eindcontrole
                  jaar={jaar}
                  persoonNaam={huidigeNaam}
                  metNaam={metPartner}
                  resultaat={pr}
                  params={params}
                  programma={programma}
                  bewerkbaar={bewerkbaar}
                  ingediend={status === 'ingediend'}
                  onProgramma={(waarde) => s.wijzig([{ soort: 'programma', persoon, waarde }])}
                  onNaar={(href) => void naar(href)}
                />
              ) : undefined
            return (
              <AangifteScherm
                key={sc.sleutel}
                jaar={jaar}
                scherm={sc}
                persoonLabel={metPartner && sc.persoon !== 'samen' ? huidigeNaam : undefined}
                vgs={vgs}
                filter={filter}
                vast={vast}
                bewerkbaar={bewerkbaar}
                fouten={foutenVan(sc)}
                volgende={
                  volgende
                    ? {
                        sleutel: volgende.sleutel,
                        titel: schermTitel(volgende),
                      }
                    : null
                }
                extra={extra}
                acties={acties}
              />
            )
          })}

          <p className="text-xs leading-relaxed text-gray-500">
            De tool rekent met wat je hebt ingevuld en volgt de aangifte zo goed mogelijk. Kijk de vooraf ingevulde gegevens altijd zelf na. Indicatieve berekening, geen advies.
          </p>
        </div>

        <aside className="min-w-0" aria-label="Voortgang">
          <VoortgangPaneel persoonNaam={huidigeNaam} telling={t} klaar={klaar} onNaarOverzicht={overzicht ? () => gaNaar(overzicht.sleutel, kopId(overzicht.sleutel)) : undefined}>
            {controlesKort}
            <div className="mt-5 hidden border-t border-gray-100 pt-4 lg:block">
              <h3 id="onderdelen-titel" tabIndex={-1} className="mb-2 text-sm font-medium text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                Onderdelen
              </h3>
              <OnderdelenNav onderdelen={onderdelen} onKies={(sl) => gaNaar(sl, kopId(sl))} />
            </div>
          </VoortgangPaneel>
        </aside>
      </div>

      <MobileResultBar
        className="print:hidden"
        label="Ingevuld en gecontroleerd"
        bedrag={null}
        waarde={`${t.afgevinkt} van ${t.totaal}`}
        doelId="voortgang"
        knopLabel="Bekijk voortgang"
        links={
          streng && fouten.length > 0 ? (
            <button
              type="button"
              onClick={() => gaNaar('controles')}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-800 transition-colors hover:bg-red-100"
            >
              {fouten.length} {fouten.length === 1 ? 'fout' : 'fouten'}
            </button>
          ) : undefined
        }
      />
    </>
  )
}
