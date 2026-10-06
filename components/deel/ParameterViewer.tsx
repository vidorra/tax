'use client'

import { ExternalLink, GitCompare, History, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { Disclosure } from '@/components/ui/Disclosure'
import { Select } from '@/components/ui/Select'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { YearPicker } from '@/components/ui/YearPicker'
import { cn } from '@/components/ui/cn'
import { formatDatum, formatEuro, formatPct } from '@/components/ui/format'
import type { Bron, BlokNaam, Status, TaxYearParams } from '@/lib/tax/types'
import { BLOK_NAMEN } from '@/lib/tax/types'
import { BESCHIKBARE_JAREN, CONCEPT_JAREN, STANDAARD_JAAR, laagsteStatus } from '@/lib/tax/years'
import { diff, statusVan } from '@/lib/tax/years/diff'
import { WAARSCHUWING_PREFIX, validateYear } from '@/lib/tax/years/validate'
import { jaarLabel, params } from './jaren'

const BLOK_LABEL: Record<BlokNaam, string> = {
  box1: 'Box 1',
  heffingskortingen: 'Heffingskortingen',
  ondernemer: 'Ondernemer',
  inkomensvoorziening: 'Inkomensvoorzieningen (lijfrente en AOV)',
  eigenWoning: 'Eigen woning',
  box2: 'Box 2',
  box3: 'Box 3',
  zvw: 'Zvw',
  pga: 'Persoonsgebonden aftrek',
  loon: 'Loon en reisaftrek',
  toeslagen: 'Toeslagen',
  arbeidsrelatie: 'Arbeidsrelatie',
  schenken: 'Schenken',
  overig: 'Overig',
}

/** Sleutels die geen bedrag zijn (aantallen, termijnen, factoren). Alleen het laatste padsegment telt. */
const GEEN_BEDRAG = /(uren|jaren|maanden|weken|leeftijd|keer|dagen|km|factor|tcf|multiplier|jaarnummer|terug|vooruit|tijdvak|verlaagdao|opdrachtgevers)/i
/** Bedragen met centen. */
const BEDRAG_CENTEN = /(uurprijs|kmbedrag|kilometertarief|^tot5$|^tot11$|^tot17$|standaardpremie)/i
/** Percentages, ook als de waarde toevallig een geheel getal is. */
const PERCENTAGE = /(pct|tarief|deel$|^laag$|^hoog$|dividendbelasting)/i

const ALLE_JAREN = BESCHIKBARE_JAREN()

/** Leesbare weergave van een parameterwaarde: percentages als %, bedragen als €. */
export function formatWaarde(pad: string, x: unknown): string {
  if (x === undefined) return '(ontbreekt)'
  if (x === null) return 'geen'
  if (typeof x === 'boolean') return x ? 'ja' : 'nee'
  if (typeof x === 'string') {
    if (x === '[]') return 'leeg'
    return /^\d{4}-\d{2}-\d{2}$/.test(x) ? formatDatum(x) : x
  }
  if (typeof x !== 'number') return String(x)
  if (!Number.isFinite(x)) return 'geen maximum'
  const sleutel = (pad.split('.').pop() ?? pad).replace(/\[\d+\]/g, '')
  if (BEDRAG_CENTEN.test(sleutel)) return formatEuro(x, { decimalen: 2 })
  if (GEEN_BEDRAG.test(sleutel)) return x.toLocaleString('nl-NL', { maximumFractionDigits: 5 })
  if (PERCENTAGE.test(sleutel) && Math.abs(x) <= 1) return formatPct(x, 4)
  if (Number.isInteger(x)) return formatEuro(x)
  if (Math.abs(x) < 1) return formatPct(x, 4)
  return formatEuro(x, { decimalen: 2 })
}

/** Alle paden binnen een waarde-object, relatief aan het blok. */
function platBlok(waarde: unknown): Array<{ pad: string; waarde: unknown }> {
  const uit: Array<{ pad: string; waarde: unknown }> = []
  const loop = (pad: string, x: unknown) => {
    if (typeof x === 'function') return
    if (Array.isArray(x)) {
      if (x.length === 0) uit.push({ pad, waarde: '[]' })
      x.forEach((v, i) => loop(`${pad}[${i}]`, v))
      return
    }
    if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) loop(pad ? `${pad}.${k}` : k, v)
      return
    }
    uit.push({ pad, waarde: x })
  }
  loop('', waarde)
  return uit
}

function BronLink({ bron, klein }: { bron: Bron; klein?: boolean }) {
  if (!bron.url) return <span className={cn('text-gray-500', klein ? 'text-[11px]' : 'text-xs')}>{bron.titel}</span>
  return (
    <a
      href={bron.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1 text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline', klein ? 'text-[11px]' : 'text-xs')}
    >
      {bron.titel}
      <ExternalLink aria-hidden="true" className="h-3 w-3 flex-shrink-0" />
      <span className="sr-only">(opent in nieuw venster)</span>
    </a>
  )
}

function Rij({ pad, waarde, status, toonStatus }: { pad: string; waarde: unknown; status: Status | ''; toonStatus: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">
      <code className="min-w-0 break-all font-mono text-xs text-gray-600">{pad}</code>
      <span className="flex items-center gap-2">
        {toonStatus && status && status !== 'definitief' && <StatusBadge status={status} klein tooltipKant="rechts" />}
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-900">{formatWaarde(pad, waarde)}</span>
      </span>
    </div>
  )
}

function BlokKaart({ p, naam, open, onOpen }: { p: TaxYearParams; naam: BlokNaam; open: boolean; onOpen: (o: boolean) => void }) {
  const blok = p[naam] as { waarde: unknown; status: Status; bron?: Bron; toelichting?: string; veldStatus?: Record<string, Status>; veldBron?: Record<string, Bron> }
  const rijen = useMemo(() => platBlok(blok.waarde), [blok.waarde])
  const groepen = useMemo(() => {
    const g = new Map<string, Array<{ pad: string; waarde: unknown }>>()
    for (const r of rijen) {
      const veld = r.pad.split(/[.[]/)[0]
      if (!g.has(veld)) g.set(veld, [])
      g.get(veld)!.push(r)
    }
    return [...g.entries()]
  }, [rijen])
  const afwijkend = Object.entries(blok.veldStatus ?? {}).filter(([, s]) => s && s !== blok.status)

  return (
    <Disclosure
      open={open}
      onOpenChange={onOpen}
      as="h3"
      titel={BLOK_LABEL[naam]}
      subtitel={`${rijen.length} waarden${afwijkend.length > 0 ? `, ${afwijkend.length} met een eigen status` : ''}`}
      rechts={<StatusBadge status={blok.status} tooltip={false} klein />}
    >
      {open && (
        <div className="space-y-3">
          {blok.bron && (
            <p className="text-xs text-gray-500">
              Bron: <BronLink bron={blok.bron} /> <span className="text-gray-500">({formatDatum(blok.bron.datum)})</span>
            </p>
          )}
          {blok.toelichting && <p className="text-sm leading-relaxed text-gray-700">{blok.toelichting}</p>}
          <div className="divide-y divide-gray-100">
            {groepen.map(([veld, items]) => {
              const status = statusVan(p, `${naam}.${veld}`)
              const veldBron = blok.veldBron?.[veld]
              const kop = (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-800">{veld}</span>
                  {status !== blok.status && status && <StatusBadge status={status} klein tooltipKant="links" />}
                </span>
              )
              const inhoud = (
                <>
                  {veldBron && (
                    <p className="pb-1">
                      <BronLink bron={veldBron} klein />
                    </p>
                  )}
                  {items.map((r) => (
                    <Rij key={r.pad} pad={r.pad} waarde={r.waarde} status={status} toonStatus={items.length === 1 && status !== blok.status} />
                  ))}
                </>
              )
              if (items.length === 1 && !veldBron) {
                return (
                  <div key={veld} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <code className="break-all font-mono text-xs text-gray-600">{items[0].pad}</code>
                      {status !== blok.status && status && <StatusBadge status={status} klein tooltipKant="links" />}
                    </span>
                    <span className="whitespace-nowrap text-sm tabular-nums text-gray-900">{formatWaarde(items[0].pad, items[0].waarde)}</span>
                  </div>
                )
              }
              return items.length > 12 ? (
                <div key={veld} className="py-1">
                  <Disclosure variant="kaal" titel={kop} subtitel={`${items.length} waarden`} as="h4">
                    {inhoud}
                  </Disclosure>
                </div>
              ) : (
                <div key={veld} className="py-2">
                  <div className="mb-1">{kop}</div>
                  <div className="pl-3">{inhoud}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Disclosure>
  )
}

/** Keuze 'jaar' of 'jaar|variant' voor de diff. */
function parseKeuze(k: string): { jaar: number; variant: string } {
  const [j, v] = k.split('|')
  return { jaar: Number(j), variant: v ?? '' }
}

const KEUZES = ALLE_JAREN.flatMap((j) => [
  { value: String(j), label: `${j}${CONCEPT_JAREN.includes(j) ? ' (concept)' : ''}` },
  ...params(j).varianten.map((v) => ({ value: `${j}|${v.id}`, label: `${j}: ${v.label}` })),
])

export function ParameterViewer() {
  const [jaar, setJaar] = useState(STANDAARD_JAAR)
  const [variant, setVariant] = useState('')
  const [open, setOpen] = useState<Set<BlokNaam>>(new Set())
  const [a, setA] = useState(String(STANDAARD_JAAR))
  const [b, setB] = useState(ALLE_JAREN.includes(STANDAARD_JAAR + 1) ? String(STANDAARD_JAAR + 1) : String(STANDAARD_JAAR))

  const v = params(jaar).varianten.some((x) => x.id === variant) ? variant : ''
  const p = params(jaar, v)
  const gekozenVariant = params(jaar).varianten.find((x) => x.id === v)
  const problemen = useMemo(() => validateYear(p), [p])
  const fouten = problemen.filter((x) => !x.startsWith(WAARSCHUWING_PREFIX))
  const waarschuwingen = problemen.filter((x) => x.startsWith(WAARSCHUWING_PREFIX)).map((x) => x.slice(WAARSCHUWING_PREFIX.length))
  const changelog = [...p.changelog].sort((x, y) => y.datum.localeCompare(x.datum))
  const ka = parseKeuze(a)
  const kb = parseKeuze(b)
  const verschillen = useMemo(() => diff(params(ka.jaar, ka.variant), params(kb.jaar, kb.variant)), [ka.jaar, ka.variant, kb.jaar, kb.variant])

  const alleOpen = open.size === BLOK_NAMEN.length

  return (
    <div className="space-y-6">
      <section aria-labelledby="keuze-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <h2 id="keuze-titel" className="sr-only">
          Jaar kiezen
        </h2>
        <div className="space-y-4">
          <YearPicker jaren={ALLE_JAREN.map((j) => ({ jaar: j, status: params(j).status }))} value={jaar} onChange={setJaar} />
          {params(jaar).varianten.length > 0 && (
            <ChipGroup<string>
              label="Variant"
              value={v}
              onChange={setVariant}
              kolommen={2}
              options={[{ value: '', label: 'Standaard' }, ...params(jaar).varianten.map((x) => ({ value: x.id, label: x.label }))]}
            />
          )}
          {gekozenVariant && (
            <Alert variant="info" titel={gekozenVariant.label}>
              <span className="mr-2 inline-flex align-middle">
                <StatusBadge status={gekozenVariant.status} klein />
              </span>
              {gekozenVariant.toelichting}
              {gekozenVariant.bron && (
                <span className="mt-1 block">
                  <BronLink bron={gekozenVariant.bron} />
                </span>
              )}
            </Alert>
          )}
          {CONCEPT_JAREN.includes(jaar) && (
            <Alert variant="let-op" titel="Conceptjaar">
              De parameters van {jaar} zijn een concept: deels voorstel, deels door ons geschat. Gebruik ze alleen om vooruit te kijken.
            </Alert>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-gray-500">Jaar</dt>
              <dd className="font-medium text-gray-900">{jaarLabel(jaar, v)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Status</dt>
              <dd>
                <StatusBadge status={p.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Laagste status blokken</dt>
              <dd>
                <StatusBadge status={laagsteStatus(p)} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Bijgewerkt</dt>
              <dd className="text-gray-900">{formatDatum(p.bijgewerkt)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="controle-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
          <h2 id="controle-titel" className="text-base font-medium text-gray-900">
            Controle (validateYear)
          </h2>
        </div>
        {problemen.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">Geen problemen gevonden: de waarden van dit jaar zijn onderling consistent.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {fouten.map((f) => (
              <li key={f}>
                <Alert variant="let-op">{f}</Alert>
              </li>
            ))}
            {waarschuwingen.map((w) => (
              <li key={w}>
                <Alert variant="info">{w}</Alert>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="blokken-titel" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="blokken-titel" className="text-lg font-semibold text-gray-900">
            Parameters per blok
          </h2>
          <Button variant="secundair" grootte="sm" onClick={() => setOpen(alleOpen ? new Set() : new Set(BLOK_NAMEN))}>
            {alleOpen ? 'Alles inklappen' : 'Alles uitklappen'}
          </Button>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
          <h3 className="font-medium text-gray-900">Indexatie</h3>
          <div className="mt-1 divide-y divide-gray-100">
            {platBlok(p.indexatie).map((r) => (
              <Rij key={r.pad} pad={r.pad} waarde={r.waarde} status="" toonStatus={false} />
            ))}
          </div>
        </div>
        {BLOK_NAMEN.map((naam) => (
          <BlokKaart
            key={`${jaar}-${v}-${naam}`}
            p={p}
            naam={naam}
            open={open.has(naam)}
            onOpen={(o) =>
              setOpen((s) => {
                const nieuw = new Set(s)
                if (o) nieuw.add(naam)
                else nieuw.delete(naam)
                return nieuw
              })
            }
          />
        ))}
      </section>

      <section aria-labelledby="changelog-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <History aria-hidden="true" className="h-4 w-4 text-primary" />
          <h2 id="changelog-titel" className="text-base font-medium text-gray-900">
            Wijzigingen
          </h2>
        </div>
        {changelog.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Geen wijzigingen vastgelegd.</p>
        ) : (
          <ol className="mt-4 space-y-4 border-l-2 border-gray-200 pl-4">
            {changelog.map((c, i) => (
              <li key={`${c.datum}-${i}`} className="relative">
                <span aria-hidden="true" className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary" />
                <time dateTime={c.datum} className="text-xs font-medium text-gray-500">
                  {formatDatum(c.datum)}
                </time>
                <p className="text-sm leading-relaxed text-gray-800">{c.wat}</p>
                {c.bron && <BronLink bron={c.bron} />}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="diff-titel" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <GitCompare aria-hidden="true" className="h-4 w-4 text-primary" />
          <h2 id="diff-titel" className="text-base font-medium text-gray-900">
            Verschillen tussen twee jaren
          </h2>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select label="Van" value={a} onChange={setA} options={KEUZES} />
          <Select label="Naar" value={b} onChange={setB} options={KEUZES} />
        </div>
        <p className="mt-3 text-sm text-gray-700">
          {verschillen.length} {verschillen.length === 1 ? 'parameter verschilt' : 'parameters verschillen'}.
        </p>
        {verschillen.length > 0 && (
          <ul className="mt-2 divide-y divide-gray-100">
            {verschillen.map((r) => (
              <li key={r.pad} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <code className="min-w-0 break-all font-mono text-xs text-gray-600">{r.pad}</code>
                <span className="flex flex-wrap items-center justify-end gap-2 text-sm tabular-nums">
                  <span className="text-gray-500 line-through decoration-gray-300">{formatWaarde(r.pad, r.oud)}</span>
                  <span className="sr-only">wordt</span>
                  <span className="font-medium text-gray-900">{formatWaarde(r.pad, r.nieuw)}</span>
                  {r.statusNieuw && r.statusNieuw !== 'definitief' && <StatusBadge status={r.statusNieuw} klein tooltipKant="rechts" />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
