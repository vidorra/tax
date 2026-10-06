'use client'

/**
 * Ronde 2 (A4): JSON-import op het overzicht. `JsonImportKnop` tekent de knop "Importeren (JSON)" en het paneel (in
 * dezelfde flex-rij als de andere knoppen, met `basis-full` en `order-last`, zodat het onder de knoppen valt), en na
 * afloop de melding met Ongedaan maken. Overzicht zelf heeft er geen state voor.
 *
 * Per jaar: Toevoegen, Vervangen of Overslaan (standaard: nieuw jaar Toevoegen, bestaand jaar Overslaan). Schakelaars
 * voor de bedragen van de accountant, de vinkjes en VIA-bedragen, en de persoonlijke gegevens (uit). Alleen de gekozen
 * jaren en onderdelen gaan naar de server; die doet alles of niets en bewaart 30 dagen een herstelpunt.
 */
import { FileJson, Upload, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import type { JaarOverzicht } from '@/lib/dossier/opslag'
import type { ActiefHerstelpunt, HerstelVoorstel, JsonImportJaar, JsonImportResultaat, JsonImportVoorstel, JsonJaarActie } from '@/lib/import/types'
import { DOSSIER_STATUS_INFO } from '@/lib/dossier/status'
import { bouwVerzoek, herstelpuntTekst, JSON_IMPORT_MAX_BYTES, knopTekst, mogelijkeActies, standaardKeuzes, statusOpmerking, teImporteren, type JsonBron, type JsonKeuzes } from '@/lib/import/json-keuzes'
import { opsomming } from '@/lib/import/ongedaan'
import { Alert, Button, Card, ChipGroup, Toggle, cn, formatDatum, formatEuro, kondigAan } from '@/components/ui'
import { importApi } from '../api'
import { ImportMelding } from './ImportMelding'

const ACTIE_LABEL: Record<JsonJaarActie, string> = { toevoegen: 'Toevoegen', vervangen: 'Vervangen', overslaan: 'Overslaan' }
const MISLUKT = 'Importeren is niet gelukt. Er is niets veranderd. Probeer het opnieuw.'

function tel(n: number, een: string, meer: string): string {
  return `${n} ${n === 1 ? een : meer}`
}

function JaarRij({ j, actie, onActie }: { j: JsonImportJaar; actie: JsonJaarActie; onActie: (a: JsonJaarActie) => void }) {
  const [fouten, setFouten] = useState(false)
  const id = useId().replace(/:/g, '')
  const statusBestand = j.bestand.status ? DOSSIER_STATUS_INFO[j.bestand.status].label : null
  const statusDossier = j.dossier?.status ? DOSSIER_STATUS_INFO[j.dossier.status].label : null
  const opmerking = j.mogelijk ? statusOpmerking(j.jaar, actie, j.bestand.status, j.dossier?.status) : null
  const kenmerk = !j.mogelijk ? 'Kan de tool niet berekenen · Wordt overgeslagen' : j.bestaat ? `Staat al in je dossier${j.dossierNieuwer ? ' (nieuwer)' : ''}` : 'Nieuw'
  const inhoud = [tel(j.bestand.personen, 'persoon', 'personen'), j.bestand.ondernemingen > 0 && tel(j.bestand.ondernemingen, 'onderneming', 'ondernemingen'), tel(j.bestand.posities, 'bezitting', 'bezittingen')].filter(Boolean).join(' · ')
  const ib = (n: number) => `${n < 0 ? 'terug' : 'te betalen'} ${formatEuro(Math.abs(n))}`
  return (
    <li className="space-y-2 border-b border-gray-100 py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm">
          <span className="font-semibold tabular-nums text-gray-900">{j.jaar}</span>
          <span className="text-gray-700"> · {kenmerk}</span>
        </p>
        {j.mogelijk && (
          <ChipGroup<JsonJaarActie>
            label={`Wat doen we met ${j.jaar}?`}
            labelVerborgen
            value={actie}
            onChange={onActie}
            options={mogelijkeActies(j).map((a) => ({ value: a, label: ACTIE_LABEL[a] }))}
            kolommen={2}
            className="w-full sm:w-auto sm:min-w-[16rem]"
          />
        )}
      </div>
      {j.mogelijk ? (
        <div className="space-y-0.5 text-xs text-gray-600">
          <p>{inhoud}</p>
          <p>
            {[
              `In het bestand: ${statusBestand ?? 'geen status'}`,
              j.bestand.bijgewerkt ? `bijgewerkt op ${formatDatum(j.bestand.bijgewerkt)}` : null,
              j.bestand.teBetalenIB !== undefined ? ib(j.bestand.teBetalenIB) : null,
              j.berekend && j.berekend.teBetalenIB !== j.bestand.teBetalenIB ? `met de regels van nu ${ib(j.berekend.teBetalenIB)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {j.dossier && (
            <p>
              {[`In je dossier: ${statusDossier ?? 'zonder status'}`, `bijgewerkt op ${formatDatum(j.dossier.bijgewerkt)}`, j.dossier.teBetalenIB !== undefined ? ib(j.dossier.teBetalenIB) : null].filter(Boolean).join(' · ')}
            </p>
          )}
          {j.dossierNieuwer && <p className={cn(actie === 'vervangen' && 'font-medium text-amber-900')}>De versie in je dossier is nieuwer dan die in het bestand.</p>}
          {opmerking && <p className={cn(actie === 'vervangen' && j.dossier?.status && j.dossier.status !== 'concept' && 'font-medium text-amber-900')}>{opmerking}</p>}
        </div>
      ) : (
        <div>
          <button
            type="button"
            aria-expanded={fouten}
            aria-controls={`${id}-fouten`}
            onClick={() => setFouten((f) => !f)}
            className="min-h-[44px] text-sm font-medium text-primary transition-colors hover:text-primary-dark"
          >
            {tel(j.fouten.length, 'fout', 'fouten')} {fouten ? 'verbergen' : 'bekijken'}
          </button>
          <ul id={`${id}-fouten`} hidden={!fouten} className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-700">
            {j.fouten.map((f) => (
              <li key={f} className="break-words">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export function JsonImportKnop({ jaren, herstelpunt = null }: { jaren: JaarOverzicht[]; herstelpunt?: ActiefHerstelpunt | null }) {
  const router = useRouter()
  const basis = useId().replace(/:/g, '')
  const paneelId = `json-import-${basis}`
  const knopId = `${paneelId}-knop`
  const kop = useRef<HTMLHeadingElement>(null)
  const kiezer = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [bestandNaam, setBestandNaam] = useState<string | null>(null)
  const [voorstel, setVoorstel] = useState<JsonImportVoorstel | null>(null)
  const [bron, setBron] = useState<JsonBron | null>(null)
  const [keuzes, setKeuzes] = useState<JsonKeuzes | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<{ melding: string; fouten?: string[] } | null>(null)
  const [resultaat, setResultaat] = useState<JsonImportResultaat | null>(null)
  const [herstel, setHerstel] = useState<{ voorstel?: HerstelVoorstel; bezig: boolean; melding?: string; fout?: string }>({ bezig: false })

  useEffect(() => {
    if (open) kop.current?.focus()
  }, [open])

  // Focus na een handeling op een element dat pas na de volgende render bestaat (de melding na de import, de regel na
  // ongedaan maken). Een setTimeout is te vroeg: router.refresh() kan de render uitstellen. Daarom na elke commit
  // proberen tot het element er is, hooguit drie seconden.
  const focusDoel = useRef<{ id: string; tot: number } | null>(null)
  const [, setFocusTik] = useState(0)
  useEffect(() => {
    const doel = focusDoel.current
    if (!doel) return
    if (Date.now() > doel.tot) {
      focusDoel.current = null
      return
    }
    const el = document.getElementById(doel.id)
    if (!el) return
    focusDoel.current = null
    el.focus()
  })
  const focusNa = (id: string) => {
    focusDoel.current = { id, tot: Date.now() + 3000 }
    setFocusTik((n) => n + 1)
  }

  function reset() {
    setBestandNaam(null)
    setVoorstel(null)
    setBron(null)
    setKeuzes(null)
    setFout(null)
  }

  function sluit() {
    setOpen(false)
    reset()
    window.setTimeout(() => document.getElementById(knopId)?.focus(), 0)
  }

  function openPaneel() {
    setHerstel({ bezig: false })
    setOpen(true)
  }

  async function kies(f: File) {
    reset()
    setBestandNaam(f.name)
    if (f.size > JSON_IMPORT_MAX_BYTES) {
      setFout({ melding: 'Dit bestand is groter dan 5 MB. Kies het bestand dat je bij Alles exporteren of Download JSON hebt gekregen.' })
      return
    }
    let tekst: string
    try {
      tekst = await f.text()
    } catch {
      setFout({ melding: 'Het bestand kon niet worden gelezen. Probeer het opnieuw.' })
      return
    }
    const bestaand = jaren.map((j) => ({ jaar: j.jaar, bijgewerkt: j.updatedAt, status: j.status, ...(j.samenvatting ? { teBetalenIB: j.samenvatting.teBetalenIB } : {}) }))
    // Valideren en opnieuw rekenen (met de rekenkern) laadt pas nu, zodat het overzicht licht blijft.
    let leesJsonExport: typeof import('@/lib/import/json').leesJsonExport
    try {
      ;({ leesJsonExport } = await import('@/lib/import/json'))
    } catch {
      setFout({ melding: 'Het bestand kon niet worden gelezen. Probeer het opnieuw.' })
      return
    }
    const r = leesJsonExport(tekst, { bestaand })
    setVoorstel(r.voorstel)
    setBron(r.bron)
    setKeuzes(standaardKeuzes(r.voorstel))
    if (r.voorstel.fouten.length > 0) kondigAan(r.voorstel.fouten.join(' '))
    else kondigAan(`${f.name} gelezen: ${tel(r.voorstel.jaren.length, 'jaar', 'jaren')}.`)
  }

  async function importeer() {
    if (!voorstel || !bron || !keuzes) return
    setBezig(true)
    setFout(null)
    const r = await importApi.importeer(bouwVerzoek(voorstel, bron, keuzes))
    setBezig(false)
    if (!r.ok || !r.data) {
      setFout({ melding: r.status === 0 ? (r.fout ?? MISLUKT) : `${MISLUKT}${r.fout && r.fout !== MISLUKT ? ` ${r.fout}` : ''}`, fouten: r.fouten })
      return
    }
    setResultaat(r.data)
    setHerstel({ bezig: false })
    setOpen(false)
    reset()
    kondigAan(klaarTekst(r.data))
    router.refresh()
    focusNa(`${paneelId}-klaar`)
  }

  function klaarTekst(r: JsonImportResultaat): string {
    return [...r.meldingen, r.herstelpuntTot ? `Ongedaan maken kan tot ${formatDatum(r.herstelpuntTot)}.` : ''].filter(Boolean).join(' ')
  }

  // Het herstelpunt van de import van net, of anders dat van de server (blijft na herladen staan tot de datum verstreken is).
  const herstelpuntId = resultaat?.herstelpuntId ?? herstelpunt?.herstelpuntId ?? null

  async function ongedaan(bevestigd: boolean) {
    if (!herstelpuntId || herstel.bezig) return
    setHerstel((h) => ({ ...h, bezig: true, fout: undefined }))
    if (!bevestigd) {
      const v = await importApi.herstelVoorstel(herstelpuntId)
      if (!v.ok || !v.data) return setHerstel({ bezig: false, fout: v.fout ?? 'Ongedaan maken is niet gelukt. Probeer het opnieuw.' })
      if (v.data.voorstel.jaren.some((j) => j.gewijzigdNaImport)) {
        setHerstel({ bezig: false, voorstel: v.data.voorstel })
        // De knop Ongedaan maken maakt plaats voor de vraag: de focus naar de bevestiging.
        focusNa(`${paneelId}-bevestig`)
        return
      }
    }
    const r = await importApi.herstel(herstelpuntId)
    if (!r.ok || !r.data) return setHerstel((h) => ({ ...h, bezig: false, fout: r.fout ?? 'Ongedaan maken is niet gelukt. Er is niets veranderd.' }))
    const melding = r.data.resultaat.meldingen.join(' ') || 'De import is ongedaan gemaakt.'
    setResultaat(null)
    setHerstel({ bezig: false, melding })
    kondigAan(melding)
    router.refresh()
    focusNa(`${paneelId}-hersteld`)
  }

  function annuleerHerstel() {
    setHerstel({ bezig: false })
    focusNa(`${paneelId}-ongedaan`)
  }

  function sluitMelding() {
    setResultaat(null)
    // Kan de import nog ongedaan worden gemaakt, dan blijft dat als regel staan; anders terug naar de knop.
    focusNa(herstelpunt ? `${paneelId}-herstel` : knopId)
  }

  const aantal = voorstel && keuzes ? teImporteren(voorstel, keuzes).length : 0
  const heeftAccountant = voorstel?.jaren.some((j) => j.mogelijk && j.heeft.accountant) ?? false
  const heeftStaat = voorstel?.jaren.some((j) => j.mogelijk && j.heeft.aangiftestaat) ?? false
  const gewijzigd = herstel.voorstel?.jaren.filter((j) => j.gewijzigdNaImport).map((j) => String(j.jaar)) ?? []

  return (
    <>
      <Button id={knopId} variant="secundair" aria-expanded={open} aria-controls={paneelId} onClick={() => (open ? sluit() : openPaneel())}>
        <Upload aria-hidden="true" className="h-4 w-4" />
        Importeren (JSON)
      </Button>

      {(resultaat || (herstelpunt && !herstel.melding)) && !open && (
        <div id={resultaat ? `${paneelId}-klaar` : `${paneelId}-herstel`} tabIndex={-1} className="order-last basis-full focus:outline-none">
          {gewijzigd.length > 0 ? (
            <Alert variant="let-op" role="alert">
              <p>Je hebt {opsomming(gewijzigd)} na de import nog aangepast. Ongedaan maken zet ook die wijzigingen terug. Doorgaan?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button id={`${paneelId}-bevestig`} grootte="sm" onClick={() => void ongedaan(true)} aria-disabled={herstel.bezig || undefined}>
                  {herstel.bezig ? 'Bezig met ongedaan maken' : 'Ongedaan maken'}
                </Button>
                <Button variant="secundair" grootte="sm" onClick={annuleerHerstel}>
                  Annuleren
                </Button>
              </div>
            </Alert>
          ) : resultaat ? (
            <ImportMelding
              tekst={klaarTekst(resultaat)}
              ongedaanId={`${paneelId}-ongedaan`}
              onOngedaan={resultaat.herstelpuntId ? () => void ongedaan(false) : undefined}
              bezig={herstel.bezig}
              onSluit={sluitMelding}
            />
          ) : (
            herstelpunt && <ImportMelding tekst={herstelpuntTekst(herstelpunt)} ongedaanId={`${paneelId}-ongedaan`} onOngedaan={() => void ongedaan(false)} bezig={herstel.bezig} rol={null} />
          )}
          {herstel.fout && (
            <Alert variant="fout" role="alert" className="mt-2">
              {herstel.fout}
            </Alert>
          )}
        </div>
      )}
      {!resultaat && herstel.melding && !open && (
        <p id={`${paneelId}-hersteld`} tabIndex={-1} role="status" className="order-last basis-full text-sm text-gray-700 focus:outline-none">
          {herstel.melding}
        </p>
      )}

      {open && (
        <Card as="section" id={paneelId} aria-labelledby={`${paneelId}-kop`} className="order-last basis-full space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id={`${paneelId}-kop`} ref={kop} tabIndex={-1} className="text-base font-medium text-gray-900 focus:outline-none">
              Importeren uit een export
            </h2>
            <Button variant="kaal" grootte="sm" onClick={sluit}>
              <X aria-hidden="true" className="h-4 w-4" />
              Sluiten
            </Button>
          </div>
          <p className="text-sm text-gray-700">Lees een bestand in dat je eerder met deze tool hebt geëxporteerd: het hele dossier of één jaar. Er verandert niets tot je bevestigt.</p>

          <input
            ref={kiezer}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void kies(f)
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant="secundair" grootte="sm" onClick={() => kiezer.current?.click()}>
              <FileJson aria-hidden="true" className="h-4 w-4" />
              {bestandNaam ? 'Ander bestand kiezen' : 'Kies een bestand'}
            </Button>
            {bestandNaam && (
              <span className="min-w-0 text-sm text-gray-700">
                <span className="[overflow-wrap:anywhere]">{bestandNaam}</span>
                {voorstel && voorstel.fouten.length === 0 && <span className="text-gray-500"> · {voorstel.formaat === 'ibcalculator-dossier-export' ? `hele dossier, ${tel(voorstel.jaren.length, 'jaar', 'jaren')}` : 'één jaar'}</span>}
              </span>
            )}
          </div>

          {voorstel && voorstel.fouten.length > 0 && (
            <Alert variant="fout" role="alert">
              {voorstel.fouten.join(' ')}
            </Alert>
          )}

          {voorstel && keuzes && voorstel.jaren.length > 0 && (
            <>
              <ul aria-label="Jaren in het bestand">
                {voorstel.jaren.map((j) => (
                  <JaarRij key={j.jaar} j={j} actie={keuzes.acties[j.jaar] ?? j.standaard} onActie={(a) => setKeuzes({ ...keuzes, acties: { ...keuzes.acties, [j.jaar]: a } })} />
                ))}
              </ul>

              {(heeftAccountant || heeftStaat || voorstel.ookBeschikbaar.gegevens) && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-900">Ook overnemen</p>
                  {heeftAccountant && <Toggle label="Bedragen van je accountant" checked={keuzes.accountant} onChange={(accountant) => setKeuzes({ ...keuzes, accountant })} />}
                  {heeftStaat && <Toggle label="Vinkjes en vooraf ingevulde bedragen uit Aangifte invullen" checked={keuzes.aangiftestaat} onChange={(aangiftestaat) => setKeuzes({ ...keuzes, aangiftestaat })} />}
                  {voorstel.ookBeschikbaar.gegevens && (
                    <Toggle
                      label="Persoonlijke gegevens (adres en samenlevingsvorm)"
                      description="Vervangt wat er nu in je dossier staat."
                      checked={keuzes.gegevens}
                      onChange={(gegevens) => setKeuzes({ ...keuzes, gegevens })}
                    />
                  )}
                </div>
              )}

              {fout && (
                <Alert variant="fout" role="alert">
                  <p>{fout.melding}</p>
                  {fout.fouten && fout.fouten.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                      {fout.fouten.slice(0, 12).map((f) => (
                        <li key={f} className="break-words">
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </Alert>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void importeer()} disabled={aantal === 0 || bezig} aria-describedby={aantal === 0 ? `${paneelId}-niets` : undefined} aria-busy={bezig}>
                    {bezig ? 'Bezig met importeren' : knopTekst(aantal)}
                  </Button>
                  <Button variant="kaal" onClick={sluit}>
                    Annuleren
                  </Button>
                </div>
                {aantal === 0 && (
                  <p id={`${paneelId}-niets`} className="text-sm text-gray-600">
                    Kies minstens één jaar om te importeren.
                  </p>
                )}
              </div>
            </>
          )}
          {fout && !voorstel && (
            <Alert variant="fout" role="alert">
              {fout.melding}
            </Alert>
          )}
        </Card>
      )}
    </>
  )
}
