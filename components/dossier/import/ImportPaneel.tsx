'use client'

/**
 * Ronde 2 (A4): het paneel van de broker-import (geladen bij de eerste klik op "Importeer uit een bestand", zie
 * BestandImport). Eén paneel onder de knop, geen stappen die verdwijnen en geen modaal venster: bestanden kiezen of
 * neerzetten, per bestand het herkende formaat (of de kolommen zelf koppelen), per rekening een samenvatting met wat er
 * verandert, en Overnemen. Overnemen zet de bedragen in de editor (nog niet opgeslagen); BestandImport toont daarna de
 * melding met Ongedaan maken.
 *
 * Privacy: het bestand wordt in de browser gelezen en blijft daar. Een rekeningnummer gaat direct door de HMAC
 * (lib/import/sleutel.ts) met een geheim per huishouden en wordt nergens bewaard; voorloopregels (Coinbase: naam)
 * komen nergens in. Alleen wat je overneemt, komt in de invoer.
 */
import { CircleX, FileCheck2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { BrokerFormaat, BrokerOngedaan, CsvBestand, KolomKoppeling as Koppeling, PresetUitkomst } from '@/lib/import/types'
import { IMPORT_GRENZEN } from '@/lib/import/types'
import { bestandHash, isCsvFout, kopHash, leesCsv } from '@/lib/import/csv'
import { BROKERS, FAMILIE, PRESETS, herkenPreset, presetVan, type BrokerFamilie } from '@/lib/import/presets'
import { metRekening } from '@/lib/import/presets/hulp'
import { koppelingFout, leesGeneriek, leesOnthouden, stelKoppelingVoor, teOnthouden } from '@/lib/import/generiek'
import { datumTekst, kanOvernemen, maakVoorstel, pasVoorstelToe, type RekeningKeuzes } from '@/lib/import/voorstel'
import { familieUitSleutel, nieuweRekeningSleutel, rekeningSleutel } from '@/lib/import/sleutel'
import { opsomming } from '@/lib/import/ongedaan'
import { Button, Select, cn, kondigAan } from '@/components/ui'
import { importApi } from '../api'
import type { Wijzig } from '../secties/types'
import { KolomKoppeling } from './KolomKoppeling'
import { RekeningSamenvatting } from './RekeningSamenvatting'

const MAX_BESTANDEN = IMPORT_GRENZEN.maxBestanden
const KOPPELING_OPSLAG = 'ib-import-koppeling:'

type Formaat = BrokerFormaat

interface Gelezen {
  id: string
  naam: string
  /** De tekst blijft alleen in het geheugen, om opnieuw te lezen met een ander formaat of scheidingsteken. */
  tekst: string | null
  fout?: string
  csv?: CsvBestand
  herkend: Formaat | null
  formaat: Formaat
  koppeling?: Koppeling
  onthouden: boolean
  uitkomst?: PresetUitkomst
  /** Rekeningsleutel uit het rekeningnummer in het bestand (HMAC); zonder nummer kiest de gebruiker de rekening. */
  sleutel?: string
  anderFormaat: boolean
}

function vandaag(): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function leesKoppeling(kopSleutel: string): Koppeling | null {
  try {
    const ruw = window.localStorage.getItem(KOPPELING_OPSLAG + kopSleutel)
    return ruw ? leesOnthouden(JSON.parse(ruw)) : null
  } catch {
    return null
  }
}

function bewaarKoppeling(k: Koppeling, aan: boolean): void {
  try {
    if (aan) window.localStorage.setItem(KOPPELING_OPSLAG + k.kopSleutel, JSON.stringify(teOnthouden(k)))
    else window.localStorage.removeItem(KOPPELING_OPSLAG + k.kopSleutel)
  } catch {
    // Zonder localStorage (privévenster) onthouden we niets; de import werkt gewoon.
  }
}

const FORMAAT_OPTIES: Array<{ value: Formaat; label: string }> = [...PRESETS.map((p) => ({ value: p.formaat, label: p.naam })), { value: 'generiek', label: 'Kolommen zelf koppelen' }]

/** Eén regel over het bestand: periode en aantal regels, of de peildatum. */
function bestandRegel(g: Gelezen): string | null {
  if (!g.uitkomst || !g.csv) return null
  const u = g.uitkomst
  const regels = `${g.csv.regels.length} ${g.csv.regels.length === 1 ? 'regel' : 'regels'}`
  if (u.gebeurtenissen.length > 0 && u.dekking) return `${datumTekst(u.dekking.van)} tot en met ${datumTekst(u.dekking.tot)}, ${regels}`
  const stand = u.standen[0]
  if (stand?.datum) return `Stand op ${datumTekst(stand.datum)}, ${regels}`
  if (u.standen.length > 0) return `Stand, ${regels}`
  return `In ${g.naam} staan geen regels die we kunnen gebruiken.`
}

export interface ImportPaneelProps {
  id: string
  invoer: HuishoudenInvoer
  wijzig: Wijzig
  /** Na Overnemen: wat er ongedaan te maken is en de namen van de bezittingen. */
  onOvergenomen: (ongedaan: BrokerOngedaan, namen: string[]) => void
  onSluit: () => void
}

export function ImportPaneel({ id: paneelId, invoer, wijzig, onOvergenomen, onSluit }: ImportPaneelProps) {
  const jaar = invoer.jaar
  const kopId = `${paneelId}-kop`
  const [bestanden, setBestanden] = useState<Gelezen[]>([])
  const [keuzes, setKeuzes] = useState<Record<string, RekeningKeuzes>>({})
  const [rekeningKeuze, setRekeningKeuze] = useState<Partial<Record<BrokerFamilie, string>>>({})
  const [bezig, setBezig] = useState(false)
  const [sleep, setSleep] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  /** Bestanden die niet zijn gelezen (boven het maximum, of al gekozen), zichtbaar bij de kiesknop. */
  const [nietGelezen, setNietGelezen] = useState<string | null>(null)
  const kop = useRef<HTMLHeadingElement>(null)
  const kiezer = useRef<HTMLInputElement>(null)
  const geheim = useRef<Promise<string | null> | null>(null)
  const nieuweSleutels = useRef<Partial<Record<BrokerFamilie, string>>>({})

  useEffect(() => {
    kop.current?.focus()
  }, [])

  const haalGeheim = () => {
    geheim.current ??= importApi.geheim().then((r) => (r.ok && r.data?.geheim ? r.data.geheim : null))
    return geheim.current
  }

  async function verwerk(naam: string, tekst: string, opties: { formaat?: Formaat; koppeling?: Koppeling; scheiding?: CsvBestand['scheiding']; onthouden?: boolean } = {}): Promise<Omit<Gelezen, 'id' | 'anderFormaat'>> {
    const csv = leesCsv(naam, tekst, { scheiding: opties.scheiding, decimaal: opties.koppeling?.decimaal })
    if (isCsvFout(csv)) return { naam, tekst, fout: csv.tekst, herkend: null, formaat: 'generiek', onthouden: false }
    const herkend = herkenPreset(csv)?.formaat ?? null
    const formaat = opties.formaat ?? herkend ?? 'generiek'
    const bestand = { naam, hash: bestandHash(csv), regels: csv.regels.length }
    if (formaat === 'generiek') {
      const kopSleutel = kopHash(csv.kop)
      const opgeslagen = opties.koppeling?.kopSleutel === kopSleutel ? null : leesKoppeling(kopSleutel)
      const basisK = opties.koppeling?.kopSleutel === kopSleutel ? opties.koppeling : (opgeslagen ?? stelKoppelingVoor(csv))
      const koppeling: Koppeling = { ...basisK, scheiding: csv.scheiding }
      const onthouden = opties.onthouden ?? Boolean(opgeslagen)
      const uitkomst = koppelingFout(koppeling) ? undefined : { ...leesGeneriek(csv, koppeling, { jaar }), bestand }
      return { naam, tekst, csv, herkend, formaat, koppeling, onthouden, uitkomst }
    }
    const preset = presetVan(formaat)
    if (!preset) return { naam, tekst, fout: 'Het bestand kon niet worden gelezen. Probeer het opnieuw of exporteer het opnieuw bij je bank of broker.', herkend, formaat, onthouden: false }
    let uitkomst: PresetUitkomst
    try {
      uitkomst = { ...preset.lees(csv, { jaar }), bestand }
    } catch {
      return { naam, tekst, csv, fout: `${naam} past niet bij ${preset.naam}. Kies een ander formaat.`, herkend, formaat, onthouden: false }
    }
    // Het nummer bestaat alleen in deze functie: het wordt direct de HMAC-sleutel en verder nergens bewaard.
    let sleutel: string | undefined
    let nummer: string | null = null
    try {
      nummer = preset.rekeningnummer?.(csv) ?? null
    } catch {
      nummer = null
    }
    if (nummer) {
      const g = await haalGeheim()
      if (g) sleutel = await rekeningSleutel(FAMILIE[formaat], nummer, g).catch(() => undefined)
    }
    return { naam, tekst, csv, herkend, formaat, onthouden: false, uitkomst, ...(sleutel ? { sleutel } : {}) }
  }

  async function voegToe(lijst: FileList | File[]) {
    const alle = [...lijst]
    const ruimte = Math.max(0, MAX_BESTANDEN - bestanden.length)
    const nieuw = alle.slice(0, ruimte)
    const teVeel = alle.slice(ruimte).map((f) => f.name)
    const teVeelTekst = teVeel.length
      ? `Je kunt ${MAX_BESTANDEN} bestanden tegelijk inlezen. ${opsomming(teVeel)} ${teVeel.length === 1 ? 'is' : 'zijn'} niet gelezen. Haal eerst een bestand weg, of exporteer bij je bank of broker één overzicht over het hele jaar.`
      : null
    setNietGelezen(teVeelTekst)
    if (teVeelTekst) kondigAan(teVeelTekst)
    if (nieuw.length === 0) return
    setBezig(true)
    setMelding(null)
    const gelezen: Gelezen[] = []
    for (const f of nieuw) {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      if (f.size > IMPORT_GRENZEN.maxBytes) {
        gelezen.push({ id, naam: f.name, tekst: null, fout: `${f.name} is groter dan ${IMPORT_GRENZEN.maxBytes / 1024 / 1024} MB. Kies een kortere periode.`, herkend: null, formaat: 'generiek', onthouden: false, anderFormaat: false })
        continue
      }
      let tekst: string
      try {
        tekst = await f.text()
      } catch {
        gelezen.push({ id, naam: f.name, tekst: null, fout: 'Het bestand kon niet worden gelezen. Probeer het opnieuw of exporteer het opnieuw bij je bank of broker.', herkend: null, formaat: 'generiek', onthouden: false, anderFormaat: false })
        continue
      }
      gelezen.push({ id, anderFormaat: false, ...(await verwerk(f.name, tekst)) })
    }
    // Hetzelfde bestand twee keer gekozen: één keer tellen.
    const hashes = new Set(bestanden.map((b) => b.uitkomst?.bestand?.hash).filter(Boolean))
    const uniek = gelezen.filter((g) => !g.uitkomst?.bestand || !hashes.has(g.uitkomst.bestand.hash))
    const dubbel = gelezen.filter((g) => !uniek.includes(g)).map((g) => g.naam)
    if (dubbel.length > 0) setNietGelezen([teVeelTekst, `${opsomming(dubbel)} had je al gekozen; we tellen ${dubbel.length === 1 ? 'het' : 'ze'} één keer.`].filter(Boolean).join(' '))
    setBestanden((b) => [...b, ...uniek])
    setBezig(false)
    const goed = uniek.filter((g) => !g.fout)
    const fout = uniek.filter((g) => g.fout)
    kondigAan(
      [
        goed.length ? `${goed.length === 1 ? 'Eén bestand' : `${goed.length} bestanden`} gelezen: ${goed.map((g) => (g.formaat === 'generiek' ? `${g.naam}, kolommen koppelen` : `${g.naam}, ${presetVan(g.formaat)?.naam}`)).join('; ')}.` : '',
        fout.map((g) => g.fout).join(' '),
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  async function vervang(id: string, opties: Parameters<typeof verwerk>[2], anderFormaat?: boolean) {
    const g = bestanden.find((b) => b.id === id)
    if (!g?.tekst) return
    const nieuw = await verwerk(g.naam, g.tekst, opties)
    setBestanden((lijst) => lijst.map((b) => (b.id === id ? { ...b, ...nieuw, anderFormaat: anderFormaat ?? b.anderFormaat, sleutel: nieuw.sleutel } : b)))
    if (nieuw.koppeling && nieuw.onthouden) bewaarKoppeling(nieuw.koppeling, true)
  }

  // Rekeningen zonder nummer: per broker een bestaande rekening (uit eerdere imports) of een nieuwe.
  const bestaandeRekeningen = (f: BrokerFamilie) => {
    const per = new Map<string, string[]>()
    for (const p of invoer.box3.posities) {
      const s = p.herkomst?.sleutel
      if (!s || familieUitSleutel(s) !== f) continue
      per.set(s, [...(per.get(s) ?? []), p.omschrijving.trim() || 'Bezitting'])
    }
    return [...per.entries()].map(([sleutel, namen]) => ({ value: sleutel, label: opsomming(namen) }))
  }
  const nieuweSleutel = (f: BrokerFamilie) => (nieuweSleutels.current[f] ??= nieuweRekeningSleutel(f))
  const sleutelZonderNummer = (f: BrokerFamilie) => {
    const gekozen = rekeningKeuze[f]
    if (gekozen) return gekozen
    const bestaand = bestaandeRekeningen(f)
    return bestaand.length === 1 ? bestaand[0].value : nieuweSleutel(f)
  }
  const families = [...new Set(bestanden.filter((g) => g.uitkomst && !g.sleutel && !g.fout).map((g) => FAMILIE[g.formaat]))]

  const uitkomsten = bestanden.filter((g) => g.uitkomst && !g.fout).map((g) => metRekening(g.uitkomst!, g.sleutel ?? sleutelZonderNummer(FAMILIE[g.formaat])))
  const sleutelLijst = uitkomsten.map((u) => u.rekening).join('|')
  const voorstellen = useMemo(
    () => (uitkomsten.length ? maakVoorstel(uitkomsten, { invoer, jaar, keuzes, vandaag: vandaag() }) : []),
    // uitkomsten volgt uit bestanden en de gekozen rekeningen (sleutelLijst)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bestanden, sleutelLijst, invoer, jaar, keuzes],
  )
  const kan = kanOvernemen(voorstellen)

  function neemOver() {
    if (!kan.kan) return
    const { invoer: nieuw, ongedaan } = pasVoorstelToe(invoer, voorstellen)
    if (ongedaan.posities.length === 0) {
      setMelding('Er verandert niets.')
      return
    }
    wijzig((d) => {
      d.box3.posities = nieuw.box3.posities
    })
    onOvergenomen(
      ongedaan,
      ongedaan.posities.map((p) => p.naImport.omschrijving),
    )
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setSleep(false)
    if (e.dataTransfer.files?.length) void voegToe(e.dataTransfer.files)
  }

  return (
        <section id={paneelId} aria-labelledby={kopId} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 id={kopId} ref={kop} tabIndex={-1} className="text-base font-medium text-gray-900 focus:outline-none">
              Importeren uit een bestand
            </h3>
            <Button variant="kaal" grootte="sm" onClick={onSluit}>
              <X aria-hidden="true" className="h-4 w-4" />
              Sluiten
            </Button>
          </div>

          <input
            ref={kiezer}
            type="file"
            multiple
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              if (e.target.files?.length) void voegToe(e.target.files)
              e.target.value = ''
            }}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setSleep(true)
            }}
            onDragLeave={() => setSleep(false)}
            onDrop={onDrop}
            className={cn('rounded-xl sm:border-2 sm:border-dashed sm:p-4', sleep ? 'sm:border-primary sm:bg-primary/5' : 'sm:border-gray-300')}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="hidden text-sm text-gray-700 sm:inline">Sleep je exportbestanden hierheen of</span>
              <Button
                id={`${paneelId}-kies`}
                variant="secundair"
                grootte="sm"
                onClick={() => kiezer.current?.click()}
                disabled={bezig || bestanden.length >= MAX_BESTANDEN}
                aria-describedby={bestanden.length >= MAX_BESTANDEN ? `${paneelId}-max` : undefined}
              >
                <FileCheck2 aria-hidden="true" className="h-4 w-4" />
                {bestanden.length > 0 ? 'Nog een bestand kiezen' : 'Kies bestanden'}
              </Button>
              <span className="text-xs text-gray-500">Eén of meer CSV-bestanden (hooguit {MAX_BESTANDEN}), bijvoorbeeld je portefeuille op een peildatum en het rekeningoverzicht van het jaar.</span>
            </div>
            {bestanden.length >= MAX_BESTANDEN && (
              <p id={`${paneelId}-max`} className="mt-2 text-sm text-gray-700">
                Je hebt het maximum van {MAX_BESTANDEN} bestanden gekozen. Haal er een weg om een ander bestand te kiezen.
              </p>
            )}
          </div>
          {nietGelezen && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="min-w-0">{nietGelezen}</p>
              <Button variant="kaal" grootte="sm" onClick={() => setNietGelezen(null)} aria-label="Melding sluiten" className="text-amber-900">
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="text-xs text-gray-600">Het bestand wordt in je browser gelezen. Alleen wat je overneemt, komt in je dossier.</p>
          {bezig && (
            <p role="status" className="text-sm text-gray-600">
              Bezig met lezen
            </p>
          )}

          {bestanden.length > 0 && (
            <ul className="space-y-3" aria-label="Gekozen bestanden">
              {bestanden.map((g) => {
                const regel = bestandRegel(g)
                return (
                  <li key={g.id} className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0 text-sm">
                        <p className="flex items-start gap-1.5">
                          {g.fout ? <CircleX aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-700" /> : <FileCheck2 aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />}
                          <span>
                            <span className="font-medium text-gray-900 [overflow-wrap:anywhere]">{g.naam}</span>
                            {!g.fout && <span className="text-gray-600"> · {g.formaat === 'generiek' ? 'kolommen zelf koppelen' : `Herkend: ${presetVan(g.formaat)?.naam}`}</span>}
                          </span>
                        </p>
                        {g.fout ? (
                          <p role="alert" className="mt-1 text-red-800">
                            <span className="sr-only">Fout: </span>
                            {g.fout}
                          </p>
                        ) : (
                          regel && <p className="mt-0.5 pl-[22px] text-xs text-gray-500">{regel}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {g.tekst && g.csv && (
                          <Button variant="kaal" grootte="sm" aria-expanded={g.anderFormaat} onClick={() => setBestanden((l) => l.map((b) => (b.id === g.id ? { ...b, anderFormaat: !b.anderFormaat } : b)))}>
                            Ander formaat
                          </Button>
                        )}
                        <Button
                          variant="kaal"
                          grootte="sm"
                          onClick={() => {
                            setBestanden((l) => l.filter((b) => b.id !== g.id))
                            // De knop verdwijnt met het bestand: de focus naar de kiesknop, niet naar de body.
                            window.setTimeout(() => document.getElementById(`${paneelId}-kies`)?.focus(), 0)
                          }}
                          className="text-gray-600"
                        >
                          <X aria-hidden="true" className="h-4 w-4" />
                          <span>
                            Weghalen<span className="sr-only"> {g.naam}</span>
                          </span>
                        </Button>
                      </div>
                    </div>
                    {g.anderFormaat && (
                      <Select<Formaat> label={`Formaat van ${g.naam}`} value={g.formaat} onChange={(f) => void vervang(g.id, { formaat: f }, false)} options={FORMAAT_OPTIES} wrapperClassName="max-w-sm" />
                    )}
                    {g.formaat === 'generiek' && g.csv && g.koppeling && (
                      <KolomKoppeling
                        bestand={g.csv}
                        koppeling={g.koppeling}
                        jaar={jaar}
                        onthouden={g.onthouden}
                        onChange={(k) => void vervang(g.id, { formaat: 'generiek', koppeling: k, scheiding: g.csv!.scheiding, onthouden: g.onthouden })}
                        onScheiding={(s) => void vervang(g.id, { formaat: 'generiek', koppeling: g.koppeling, scheiding: s, onthouden: g.onthouden })}
                        onOnthouden={(aan) => {
                          bewaarKoppeling(g.koppeling!, aan)
                          setBestanden((l) => l.map((b) => (b.id === g.id ? { ...b, onthouden: aan } : b)))
                        }}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {families.map((f) => {
            const bestaand = bestaandeRekeningen(f)
            if (bestaand.length === 0) return null
            const waarde = sleutelZonderNummer(f)
            return (
              <Select
                key={f}
                label={f === 'generiek' ? 'Bij welke rekening hoort dit bestand?' : `Welke ${BROKERS[f].naam}-rekening is dit?`}
                hint="In het bestand staat geen rekeningnummer. Kies de rekening die je eerder hebt ingelezen, of een nieuwe."
                value={bestaand.some((b) => b.value === waarde) ? waarde : 'nieuw'}
                onChange={(w) => setRekeningKeuze((r) => ({ ...r, [f]: w === 'nieuw' ? nieuweSleutel(f) : w }))}
                options={[...bestaand, { value: 'nieuw', label: 'Nieuwe rekening' }]}
                wrapperClassName="max-w-md"
              />
            )
          })}

          {voorstellen.map((v) => (
            <RekeningSamenvatting key={v.rekening} voorstel={v} invoer={invoer} keuzes={keuzes[v.rekening] ?? {}} onKeuzes={(k) => setKeuzes((alle) => ({ ...alle, [v.rekening]: k }))} />
          ))}

          {bestanden.length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={neemOver} disabled={!kan.kan || bezig} aria-describedby={!kan.kan && kan.reden ? `${paneelId}-reden` : undefined}>
                  Overnemen in je bezittingen
                </Button>
                <Button variant="kaal" onClick={onSluit}>
                  Sluiten zonder overnemen
                </Button>
              </div>
              {voorstellen.length > 0 && !kan.kan && kan.reden && (
                <p id={`${paneelId}-reden`} className="text-sm text-gray-600">
                  {kan.reden}
                </p>
              )}
              {voorstellen.length === 0 && <p className="text-sm text-gray-600">Er is nog geen bestand dat we kunnen gebruiken.</p>}
              {melding && (
                <p role="status" className="text-sm text-gray-700">
                  {melding}
                </p>
              )}
            </div>
          )}
        </section>
  )
}
