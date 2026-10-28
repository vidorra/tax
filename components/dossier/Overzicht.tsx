'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BookOpen, Download, FilePlus2, GitCompare, Link2, LogOut, Trash2, Users } from 'lucide-react'
import type { Status } from '@/lib/tax/types'
import type { JaarOverzicht } from '@/lib/dossier/opslag'
import { Alert, Button, ButtonLink, Card, ChipGroup, Field, INVOER_KLASSE, Section, Select, StatusBadge, Toggle, cn, formatDatum, formatEuro, knopKlassen, veldIds } from '@/components/ui'
import { api } from './api'
import { BackupKaart } from './BackupKaart'
import { Disclaimer } from './Disclaimer'
import { DossierStatusLabel } from './DossierStatusLabel'
import { grensKort } from './grenzen-tekst'
import { JaarControleRegel } from './controles/JaarControleRegel'
import { JsonImportKnop } from './import/JsonImportPaneel'
import type { OpenTerugvragen } from '@/lib/dossier/terugvragen'
import type { ActiefHerstelpunt } from '@/lib/import/types'
import { standaardNieuwJaar, vandaagAmsterdam } from '@/lib/dossier/nieuw-jaar-keuze'
import { TerugvraagKaart } from './bronbelasting/TerugvraagKaart'

type Bron = 'leeg' | 'vorig-jaar' | 'voorbeeld-2024'

/** Ronde 2 (A3): te betalen IB na de aanslag- en teruggaafgrens als die er is (zoals het grote bedrag in de editor). */
const teBetalenIB = (s: { teBetalenIB: number; teBetalenIBNaGrenzen?: number }) => s.teBetalenIBNaGrenzen ?? s.teBetalenIB

export interface OverzichtProps {
  jaren: JaarOverzicht[]
  beschikbaar: Array<{ jaar: number; status: Status; concept: boolean }>
  voorbeeldJaar: number
  /** Ronde 2 (A5): openstaande verzoeken om bronbelasting terug te vragen, over alle jaren; null zonder. */
  terugvragen?: OpenTerugvragen | null
  /** De laatste JSON-import die nog ongedaan kan worden gemaakt; null zonder. */
  herstelpunt?: ActiefHerstelpunt | null
  /** yyyy-mm-dd (Europe/Amsterdam), voor het voorgekozen nieuwe jaar. */
  vandaag?: string
  /** Beheerder: link naar Accounts en de back-upkaart (een back-up bevat alle accounts). */
  beheerder?: boolean
}

export function Overzicht(props: OverzichtProps) {
  const { jaren, beschikbaar, voorbeeldJaar } = props
  const router = useRouter()
  const inDossier = new Set(jaren.map((j) => j.jaar))
  const vrij = beschikbaar.filter((b) => !inDossier.has(b.jaar))
  // Een nieuwe gebruiker begint bij het jaar waarover hij nu aangifte doet, niet bij een conceptjaar (lib/dossier/nieuw-jaar-keuze.ts).
  const [nieuwJaar, setNieuwJaar] = useState<string>(() => String(standaardNieuwJaar(vrij, inDossier, props.vandaag ?? vandaagAmsterdam()) ?? ''))
  const [bron, setBron] = useState<Bron>('leeg')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [bevestiging, setBevestiging] = useState('')
  const [ookAccount, setOokAccount] = useState(false)
  const [verwijderOpen, setVerwijderOpen] = useState(false)

  const kopieMogelijk = nieuwJaar !== '' && inDossier.has(Number(nieuwJaar) - 1)
  const statusVan = (jaar: number) => beschikbaar.find((b) => b.jaar === jaar)?.status ?? 'definitief'

  async function maak() {
    setBezig(true)
    setFout(null)
    const jaar = bron === 'voorbeeld-2024' ? voorbeeldJaar : Number(nieuwJaar)
    const r = await api<{ jaar: JaarOverzicht }>('/api/dossier/jaren', { method: 'POST', body: { jaar, bron } })
    setBezig(false)
    if (!r.ok) return setFout(r.fout)
    router.push(`/dossier/${jaar}/`)
  }

  async function verwijderAlles() {
    setBezig(true)
    setFout(null)
    const r = await api<{ ok: boolean; accountVerwijderd: boolean }>('/api/dossier/verwijder-alles', { method: 'POST', body: { bevestiging, ookAccount } })
    setBezig(false)
    if (!r.ok) return setFout(r.fout)
    setBevestiging('')
    setVerwijderOpen(false)
    if (r.data?.accountVerwijderd) {
      router.replace('/dossier/setup/')
      return
    }
    router.refresh()
  }

  async function uitloggen() {
    await api('/api/auth/logout', { method: 'POST' })
    router.replace('/dossier/login/')
    router.refresh()
  }

  const bevestigIds = veldIds('verwijder-bevestiging')

  return (
    <div className="space-y-6">
      {fout && (
        <Alert variant="let-op" role="alert">
          {fout}
        </Alert>
      )}

      {props.terugvragen && <TerugvraagKaart open={props.terugvragen} />}
      {jaren.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-700">Je dossier is nog leeg. Begin met een jaar hieronder, of lees een bestand in dat je eerder hebt geëxporteerd. Je kunt ook starten met de voorbeeldaangifte van {voorbeeldJaar} om te zien hoe het werkt.</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Jaren in je dossier">
          {jaren.map((j) => {
            const paramsStatus = j.samenvatting?.paramsStatus ?? statusVan(j.jaar)
            return (
              <li key={j.jaar}>
                <Card className="flex h-full flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold tabular-nums text-gray-900">
                      <Link href={`/dossier/${j.jaar}/`} className="transition-colors hover:text-primary">
                        {j.jaar}
                      </Link>
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      {paramsStatus !== 'definitief' && <StatusBadge status={paramsStatus} klein tooltipKant="rechts" />}
                      <DossierStatusLabel status={j.status} />
                    </div>
                  </div>
                  {j.variant && <p className="mt-1 text-xs text-gray-500">Variant: {j.variant}</p>}
                  {j.samenvatting ? (
                    <dl className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-600">{teBetalenIB(j.samenvatting) < 0 ? 'Terug inkomstenbelasting' : 'Te betalen inkomstenbelasting'}</dt>
                        <dd className="font-medium tabular-nums text-gray-900">{formatEuro(Math.abs(teBetalenIB(j.samenvatting)))}</dd>
                      </div>
                      {grensKort(j.samenvatting) && <div className="-mt-0.5 pl-3 text-xs text-gray-600">{grensKort(j.samenvatting)}</div>}
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-600">{j.samenvatting.teBetalenZvw < 0 ? 'Terug Zvw' : 'Te betalen Zvw'}</dt>
                        <dd className="font-medium tabular-nums text-gray-900">{formatEuro(Math.abs(j.samenvatting.teBetalenZvw))}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">Nog geen berekening opgeslagen.</p>
                  )}
                  {j.parametersGewijzigd && <p className="mt-2 text-xs text-amber-800">De belastingregels van dit jaar zijn bijgewerkt sinds je laatste opslag.</p>}
                  <JaarControleRegel jaar={j} />
                  <p className="mt-3 text-xs text-gray-500">Bijgewerkt op {formatDatum(j.updatedAt.slice(0, 10))}</p>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    <ButtonLink href={`/dossier/${j.jaar}/`} grootte="sm">
                      Openen<span className="sr-only"> {j.jaar}</span>
                    </ButtonLink>
                    {/* Ronde 2 (A3): zonder prefetch, zodat het overzicht de pagina pas laadt als je erop klikt. */}
                    <Link href={`/dossier/${j.jaar}/aangifte/`} prefetch={false} className={knopKlassen('secundair', 'sm')}>
                      Aangifte invullen<span className="sr-only"> {j.jaar}</span>
                    </Link>
                    <ButtonLink href={`/dossier/${j.jaar}/planning/`} variant="secundair" grootte="sm">
                      Planning<span className="sr-only"> {j.jaar}</span>
                    </ButtonLink>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Section icon={<FilePlus2 />} title="Nieuw jaar" subtitle="Leeg beginnen, het vorige jaar kopiëren of de voorbeeldaangifte laden.">
        <div className="space-y-4">
          <ChipGroup<Bron>
            label="Beginnen met"
            value={bron}
            onChange={setBron}
            kolommen={3}
            options={[
              { value: 'leeg', label: 'Leeg' },
              { value: 'vorig-jaar', label: 'Kopie vorig jaar', disabled: !kopieMogelijk && bron !== 'vorig-jaar' },
              { value: 'voorbeeld-2024', label: `Voorbeeld ${voorbeeldJaar}`, disabled: inDossier.has(voorbeeldJaar) },
            ]}
            hint={
              bron === 'vorig-jaar'
                ? 'Neemt personen, ondernemingen en vermogen over. De eindwaarden van vorig jaar worden de beginwaarden; voorlopige aanslagen en jaarbedragen beginnen leeg.'
                : bron === 'voorbeeld-2024'
                  ? `Een verzonnen zzp-huishouden in ${voorbeeldJaar}: twee eenmanszaken, een eigen woning, een kind en beleggingen. Handig om de tool te leren kennen.`
                  : undefined
            }
          />
          {bron !== 'voorbeeld-2024' && (
            <Select
              label="Belastingjaar"
              value={nieuwJaar}
              onChange={setNieuwJaar}
              placeholder={vrij.length === 0 ? 'Alle jaren staan al in je dossier' : 'Kies een jaar'}
              options={vrij.map((b) => ({ value: String(b.jaar), label: `${b.jaar}${b.status !== 'definitief' ? ` (${b.status})` : ''}${b.concept ? ', concept' : ''}` }))}
            />
          )}
          {bron === 'vorig-jaar' && !kopieMogelijk && nieuwJaar !== '' && <p className="text-sm text-gray-600">Er is geen dossier voor {Number(nieuwJaar) - 1} om te kopiëren.</p>}
          <Button onClick={maak} disabled={bezig || (bron !== 'voorbeeld-2024' && nieuwJaar === '') || (bron === 'vorig-jaar' && !kopieMogelijk) || (bron === 'voorbeeld-2024' && inDossier.has(voorbeeldJaar))}>
            {bezig ? 'Bezig' : 'Jaar toevoegen'}
          </Button>
        </div>
      </Section>

      {props.beheerder && <BackupKaart />}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/dossier/vergelijk/" variant="secundair">
          <GitCompare aria-hidden="true" className="h-4 w-4" />
          Jaren vergelijken
        </ButtonLink>
        <ButtonLink href="/dossier/koppelingen/" variant="secundair">
          <Link2 aria-hidden="true" className="h-4 w-4" />
          Koppelingen
        </ButtonLink>
        {props.beheerder && (
          <ButtonLink href="/beheer/" variant="secundair">
            <Users aria-hidden="true" className="h-4 w-4" />
            Accounts
          </ButtonLink>
        )}
        <ButtonLink href="/handleiding/" variant="secundair">
          <BookOpen aria-hidden="true" className="h-4 w-4" />
          Handleiding
        </ButtonLink>
        {/* Download van een JSON-bestand, geen paginanavigatie: een gewone link is hier juist. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/dossier/export/" download className={cn('inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:border-primary hover:text-primary')}>
          <Download aria-hidden="true" className="h-4 w-4" />
          Alles exporteren (JSON)
        </a>
        <JsonImportKnop jaren={jaren} herstelpunt={props.herstelpunt ?? null} />
        <Button variant="secundair" onClick={uitloggen}>
          <LogOut aria-hidden="true" className="h-4 w-4" />
          Uitloggen
        </Button>
        <Button variant="kaal" onClick={() => setVerwijderOpen((o) => !o)} aria-expanded={verwijderOpen} aria-controls="verwijder-alles" className="text-red-700 hover:bg-red-50 hover:text-red-800">
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Alles verwijderen
        </Button>
      </div>

      {verwijderOpen && (
        <Card id="verwijder-alles" className="border-red-200">
          <h2 className="text-base font-medium text-gray-900">Alles verwijderen</h2>
          <p className="mt-1 text-sm text-gray-700">Dit verwijdert alle jaren, berekeningen en accountantsregels definitief. Exporteer eerst als je een kopie wilt houden. Back-ups die al gemaild zijn, blijven in je mailbox staan: verwijder die zelf als je ook die kopieën kwijt wilt.</p>
          <div className="mt-4 space-y-4">
            <Field ids={bevestigIds} label="Typ VERWIJDER om te bevestigen">
              <input id={bevestigIds.invoer} type="text" autoComplete="off" value={bevestiging} onChange={(e) => setBevestiging(e.target.value)} className={cn(INVOER_KLASSE, 'border-gray-200 px-3.5')} />
            </Field>
            <Toggle label="Ook mijn account verwijderen" description="Daarna kun je opnieuw een account maken." checked={ookAccount} onChange={setOokAccount} />
            <Button onClick={verwijderAlles} disabled={bezig || bevestiging !== 'VERWIJDER'} className="bg-red-700 hover:bg-red-800">
              Definitief verwijderen
            </Button>
          </div>
        </Card>
      )}

      <Disclaimer />
    </div>
  )
}
