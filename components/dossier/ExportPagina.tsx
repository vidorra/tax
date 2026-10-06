'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { FileJson, FileSpreadsheet, FileText, ScrollText } from 'lucide-react'
import type { HuishoudenInvoer, OndernemingInvoer, PersoonId, Status } from '@/lib/tax/types'
import type { AccountantRegels } from '@/lib/dossier/accountant'
import type { HuishoudenGegevens } from '@/lib/rapport/model'
import { berekenDossier } from '@/lib/dossier/bereken'
import { getJaar } from '@/lib/tax/years'
import { DOSSIER_STATUS_INFO, type DossierStatus } from '@/lib/dossier/status'
import { lokaalTijdstip, pastBij, rapportBestandsnaam, rapportInvoer, rapportPersonen, type RapportKeuze } from '@/lib/rapport/export'
import { standIngevuld } from '@/lib/rapport/afleiden'
import { Alert, Button, ChipGroup, Section, STATUS_INFO, formatDatum } from '@/components/ui'
import { persoonNaam } from './secties/types'
import { download, maakPdf } from './pdf'
import { Disclaimer } from './Disclaimer'
import { GegevensKaart } from './GegevensKaart'
import { veldHref } from '@/lib/dossier/veld'
import { rapportControles } from '@/lib/rapport/controles'
import type { Controle } from '@/lib/controles/types'
import { useControles } from './controles/useControles'
import { ControlePaneel } from './controles/ControlePaneel'
import type { ControleActies } from './controles/ControleItem'
import { startJaarExport } from './import/jaarExport'

export interface ExportPaginaProps {
  jaar: number
  invoer: HuishoudenInvoer
  variant: string | null
  variantLabel: string | null
  status: DossierStatus
  paramsStatus: Status
  vandaag: string
  /** Bedragen uit het rapport van de accountant voor dit jaar (pagina Accountant); null als er geen zijn. */
  accountant: AccountantRegels | null
  /** Adres en samenlevingsvorm zoals opgeslagen bij het laden van de pagina; de kaart hieronder houdt ze bij. */
  gegevens: HuishoudenGegevens | null
  /** Versie van de tool voor de verantwoording, bijvoorbeeld '0.1.0 (a1b2c3d)'. */
  toolVersie: string
  /** Onderdelen die niet geladen konden worden; het rapport komt er dan zonder. */
  laadFouten?: string[]
  /**
   * Melding als de persoonlijke gegevens niet geladen konden worden. Die staat dan in plaats van de zin over
   * het adres, tot de kaart hieronder de gegevens alsnog laadt of opslaat.
   */
  gegevensFout?: string | null
  /** Ronde 2 (A3): moment van indienen (`JaarOverzicht.ingediend`), voor de controles. */
  ingediend?: { op: string; gewijzigdNa: boolean } | null
  /** Ronde 2 (A3): invoer van vorig jaar, voor de controles op beginbalans en saldi. */
  vorigInvoer?: HuishoudenInvoer | null
}

type Bezig = 'rapport-pdf' | 'rapport-xlsx' | 'uitleg' | null

/** Aantal ingevulde accountantsbedragen voor deze personen. */
function aantalAccountant(regels: AccountantRegels | null, personen: PersoonId[]): number {
  if (!regels) return 0
  return personen.reduce((n, id) => n + Object.values(regels[id] ?? {}).filter((v) => typeof v === 'number').length, 0)
}

/** Is er voor hoofdstuk 5 echt iets ingevuld: een balans of een winst- en verliesrekening? */
function jaarrekeningIngevuld(j: OndernemingInvoer['jaarrekening']): boolean {
  return !!j && (standIngevuld(j.begin) || standIngevuld(j.eind) || (j.winstEnVerlies?.length ?? 0) > 0 || (j.onttrekkingen?.length ?? 0) > 0)
}

export function ExportPagina({
  jaar,
  invoer,
  variant,
  variantLabel,
  status,
  paramsStatus,
  vandaag,
  accountant,
  gegevens: beginGegevens,
  toolVersie,
  laadFouten = [],
  gegevensFout = null,
  ingediend = null,
  vorigInvoer = null,
}: ExportPaginaProps) {
  const router = useRouter()
  const [bezig, setBezig] = useState<Bezig>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState<string | null>(null)
  const [keuze, setKeuze] = useState<RapportKeuze>(invoer.personen[0]?.id ?? 'A')
  const [gegevens, setGegevens] = useState<HuishoudenGegevens | null>(beginGegevens)
  const [gegevensMelding, setGegevensMelding] = useState<string | null>(gegevensFout)
  const resultaat = useMemo(() => {
    try {
      const v = variant ?? undefined
      return berekenDossier({ ...invoer, variant: v }, { variant: v })
    } catch {
      return null
    }
  }, [invoer, variant])

  // Ronde 2 (A3): de controles van de opgeslagen invoer. De export openen maakt het jaar streng (controles-streng met
  // door 'export'); open fouten geven in een concept een CONCEPT-download, bij Ingediend de kopregel in de verantwoording.
  const { uitkomst, maakStreng, staat } = useControles({ jaar, invoer, resultaat, variant, status, ingediend, gewijzigd: false, vorigInvoer, vandaag })
  useEffect(() => {
    maakStreng('export')
  }, [maakStreng])
  const concept = uitkomst.exportConcept
  const acties: ControleActies = {
    naar: (c: Controle, veld?: string) => {
      const doel = veld ?? c.veld
      void (async () => {
        // Een negering die net is gezet, eerst opslaan; daarna naar het veld op de invoerpagina, met de knop terug.
        await staat?.flush()
        if (doel) router.push(veldHref(jaar, doel, 'export'))
        else if (c.sectie) router.push(`/dossier/${jaar}/?terug=export#${c.sectie}`)
      })()
    },
  }

  if (!resultaat) return <Alert variant="let-op">De berekening lukt niet met de opgeslagen invoer. Controleer de invoer van dit jaar.</Alert>

  const naam = (id: PersoonId) => persoonNaam(invoer.personen.find((p) => p.id === id) ?? { id })
  const geldigeKeuze: RapportKeuze = invoer.personen.some((p) => p.id === keuze) || keuze === 'beide' ? keuze : invoer.personen[0].id
  const gekozen = rapportPersonen(invoer, geldigeKeuze)
  const partners = invoer.fiscaalPartner && invoer.personen.length === 2
  // Bij één persoon van twee gaat in Excel alleen diens invoer mee, met de gezamenlijke posten uit het rapport.
  const anderen = invoer.personen.filter((p) => !gekozen.includes(p.id))
  const zonderJaarrekening = invoer.personen
    .filter((p) => gekozen.includes(p.id))
    // Alleen een omschrijving (meegenomen uit vorig jaar) telt niet als jaarrekening: het gaat om balans of winst en verlies.
    .flatMap((p) => p.ondernemingen.filter((o) => !jaarrekeningIngevuld(o.jaarrekening)).map((o) => o.naam))
  const metOnderneming = invoer.personen.some((p) => gekozen.includes(p.id) && p.ondernemingen.length > 0)
  const accountantAantal = aantalAccountant(accountant, gekozen)

  async function rapport(soort: 'pdf' | 'xlsx') {
    if (!resultaat || bezig) return
    setBezig(soort === 'pdf' ? 'rapport-pdf' : 'rapport-xlsx')
    setFout(null)
    setKlaar(null)
    try {
      const v = variant ?? undefined
      const metVariant = { ...invoer, variant: v }
      // De rapportbouw en de renderers laden pas bij een klik, net als jsPDF.
      const { bouwRapporten } = await import('@/lib/rapport/rapporten')
      const docs = bouwRapporten(metVariant, resultaat, getJaar(jaar, v), geldigeKeuze, {
        vandaag: lokaalTijdstip(new Date()),
        dossierStatus: status,
        gegevens: gegevens ?? undefined,
        accountant: accountant ?? undefined,
        toolVersie,
        naam,
        controles: rapportControles(uitkomst),
      })
      const bestand = rapportBestandsnaam(jaar, docs.map((d) => d.naam), soort, { concept })
      if (soort === 'pdf') {
        const { maakRapportPdf } = await import('./rapport-pdf')
        download(await maakRapportPdf(docs), bestand)
      } else {
        const { maakRapportXlsx } = await import('./rapport-xlsx')
        download(await maakRapportXlsx(docs, { invoer: rapportInvoer(metVariant, resultaat, geldigeKeuze) }), bestand)
      }
      setKlaar(`Gedownload: ${bestand}`)
    } catch (e) {
      console.error('[rapport] maken mislukt', e)
      setFout(soort === 'pdf' ? 'Het maken van het rapport als PDF is niet gelukt. Probeer het opnieuw.' : 'Het maken van het rapport als Excel-bestand is niet gelukt. Probeer het opnieuw.')
    } finally {
      setBezig(null)
    }
  }

  async function uitleg() {
    if (!resultaat || bezig) return
    setBezig('uitleg')
    setFout(null)
    setKlaar(null)
    try {
      const blob = await maakPdf({
        jaar,
        variantLabel,
        dossierStatus: DOSSIER_STATUS_INFO[status].label.toLowerCase(),
        paramsStatus: STATUS_INFO[paramsStatus].label.toLowerCase(),
        invoer,
        resultaat,
        naam: (id) => persoonNaam(invoer.personen.find((p) => p.id === id) ?? { id }),
        datum: formatDatum(vandaag),
      })
      const bestand = `rekenuitleg-${jaar}.pdf`
      download(blob, bestand)
      setKlaar(`Gedownload: ${bestand}`)
    } catch {
      setFout('Het maken van de rekenuitleg is niet gelukt. Probeer het opnieuw.')
    } finally {
      setBezig(null)
    }
  }

  function json() {
    if (!resultaat) return
    // De aangiftestaat uit de provider als die geladen is; anders haalt startJaarExport hem bij de server.
    const geladen = staat?.laden === 'klaar' ? staat.staat : undefined
    startJaarExport({ jaar, variant, status, vandaag, invoer, resultaat, accountant, staat: geladen, onFout: setFout })
  }

  const keuzes = [
    ...invoer.personen.map((p) => ({ value: p.id as RapportKeuze, label: persoonNaam(p) })),
    ...(invoer.personen.length > 1 ? [{ value: 'beide' as RapportKeuze, label: partners ? 'Beide partners' : 'Beide personen' }] : []),
  ]

  return (
    <div className="space-y-6">
      {fout && (
        <Alert variant="let-op" role="alert">
          {fout}
        </Alert>
      )}

      <ControlePaneel variant="poort" uitkomst={uitkomst} streng acties={acties} staat={staat} ingediend={status === 'ingediend'} jaar={jaar} />
      <Section icon={<FileText />} title="Fiscaal rapport" subtitle="In de opbouw van het rapport van een accountant: één rapport per persoon, met een verantwoording van de cijfers">
        <div className="space-y-5">
          {keuzes.length > 1 ? (
            <ChipGroup<RapportKeuze>
              label="Rapport voor"
              value={keuze}
              onChange={(k) => {
                setKeuze(k)
                setKlaar(null)
              }}
              options={keuzes}
              hint={
                keuze === 'beide'
                  ? 'Twee rapporten achter elkaar in één PDF, elk met een eigen voorblad en paginanummering. In Excel krijgt ieder een eigen tabblad.'
                  : partners
                    ? 'Zoals je accountant het doet: een rapport voor deze persoon, met de gezamenlijke posten en de verdeling tussen jullie.'
                    : 'Een rapport voor deze persoon, zoals je accountant het doet.'
              }
            />
          ) : (
            <p className="text-sm text-gray-700">Rapport voor {naam(gekozen[0])}.</p>
          )}

          <ul className="space-y-1.5 text-sm text-gray-700">
            {gegevensMelding ? (
              <li className="text-amber-800">{gegevensMelding}</li>
            ) : (
              <li>
                {gegevens?.adres ? 'Je adres staat op het voorblad.' : 'Er is geen adres ingevuld; op het voorblad staat alleen je naam.'}{' '}
                {gegevens?.samenlevingsvorm
                  ? pastBij(gegevens.samenlevingsvorm, invoer.fiscaalPartner)
                    ? 'Je samenlevingsvorm staat in hoofdstuk 1.'
                    : 'Je samenlevingsvorm past niet bij de keuze voor fiscaal partnerschap van dit jaar en staat daarom niet in het rapport.'
                  : null}
              </li>
            )}
            <li>
              {accountantAantal > 0 ? (
                <>
                  {accountantAantal === 1 ? 'Eén bedrag' : `${accountantAantal} bedragen`} van je accountant {accountantAantal === 1 ? 'staat' : 'staan'} in de verantwoording naast de berekening.
                </>
              ) : (
                <>
                  Er zijn geen bedragen van je accountant ingevuld. Vul ze in bij de{' '}
                  <Link href={`/dossier/${jaar}/accountant/`} className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline">
                    Accountantscheck
                  </Link>{' '}
                  als je de verschillen in het rapport wilt zien.
                </>
              )}
            </li>
            {metOnderneming && (
              <li>
                {zonderJaarrekening.length === 0 ? (
                  'Voor hoofdstuk 5 (winstaangifte) is een jaarrekening ingevuld: de balans, de privémutaties en de winst- en verliesrekening komen erin voor zover je ze hebt ingevuld.'
                ) : (
                  <>
                    Voor {zonderJaarrekening.join(' en ')} is geen jaarrekening ingevuld. Hoofdstuk 5 toont dan alleen de winst, de oudedagsreserve en het eindvermogen. Vul de balans in bij de{' '}
                    <Link href={`/dossier/${jaar}/`} className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline">
                      onderneming
                    </Link>{' '}
                    of neem hem over uit Moneybird.
                  </>
                )}
              </li>
            )}
            {laadFouten.map((f) => (
              <li key={f} className="text-amber-800">
                {f}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void rapport('pdf')} disabled={bezig !== null} aria-busy={bezig === 'rapport-pdf'}>
              <FileText aria-hidden="true" className="h-4 w-4" />
              {bezig === 'rapport-pdf' ? 'Rapport wordt gemaakt' : concept ? 'Concept downloaden (PDF)' : 'Fiscaal rapport (PDF)'}
            </Button>
            <Button variant="secundair" onClick={() => void rapport('xlsx')} disabled={bezig !== null} aria-busy={bezig === 'rapport-xlsx'}>
              <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
              {bezig === 'rapport-xlsx' ? 'Rapport wordt gemaakt' : concept ? 'Concept downloaden (Excel)' : 'Fiscaal rapport (Excel)'}
            </Button>
          </div>
          {concept && <p className="text-sm text-gray-700">Zonder CONCEPT downloaden kan zodra de fouten zijn opgelost of bewust genegeerd.</p>}
          <p role="status" className="text-sm text-gray-600">
            {klaar ??
              `Het rapport wordt in je browser gemaakt; er gaat niets naar een andere dienst. ${
                anderen.length === 0
                  ? `Het Excel-bestand heeft naast het rapport ook elk bedrag met zijn herkomst, ${invoer.personen.length > 1 ? 'de invoer van jullie allebei' : 'je invoer'} en de rekenparameters.`
                  : `Het Excel-bestand heeft naast het rapport ook elk bedrag met zijn herkomst, de rekenparameters en de invoer van ${naam(gekozen[0])} met de gezamenlijke posten uit het rapport. De persoonlijke invoer van ${anderen.map((p) => persoonNaam(p)).join(' en ')}, zoals loon en ondernemingen, staat er niet in.`
              }`}
          </p>
        </div>
      </Section>

      <GegevensKaart
        onGegevens={(g) => {
          setGegevens(g)
          setGegevensMelding(null)
        }}
      />

      <Section icon={<ScrollText />} title="Rekenuitleg" subtitle="Per persoon de berekening regel voor regel met uitleg, daarna het huishouden en de meldingen">
        <p className="mb-4 text-sm text-gray-700">Handig om na te gaan hoe een bedrag tot stand komt. Ook deze PDF wordt in je browser gemaakt.</p>
        <Button variant="secundair" onClick={() => void uitleg()} disabled={bezig !== null} aria-busy={bezig === 'uitleg'}>
          <FileText aria-hidden="true" className="h-4 w-4" />
          {bezig === 'uitleg' ? 'Rekenuitleg wordt gemaakt' : 'Rekenuitleg (PDF)'}
        </Button>
      </Section>

      <Section icon={<FileJson />} title="JSON van dit jaar" subtitle="De volledige invoer en de samenvatting van de uitkomst">
        <p className="mb-4 text-sm text-gray-700">Handig als back-up of om in te lezen in een ander hulpmiddel. Je vinkjes, vooraf ingevulde bedragen en genegeerde controles gaan mee. Het hele dossier exporteren en een bestand inlezen doe je op het overzicht.</p>
        <Button variant="secundair" onClick={json}>
          <FileJson aria-hidden="true" className="h-4 w-4" />
          Download JSON
        </Button>
      </Section>
      <Disclaimer />
    </div>
  )
}
