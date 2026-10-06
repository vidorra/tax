'use client'

import { memo } from 'react'
import type { ReactNode } from 'react'
import { Alert } from '@/components/ui/Alert'
import { cn } from '@/components/ui/cn'
import { formatEuro, formatPct } from '@/components/ui/format'
import { ResultBedrag, ResultPanel } from '@/components/ui/ResultPanel'
import { StatLijst, StatRow } from '@/components/ui/StatRow'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { WaarschuwingLijst } from '@/components/ui/WaarschuwingLijst'
import { SITE } from '@/lib/site'
import { alleWaarschuwingen, type JaarUitkomst } from '@/lib/calculator/berekening'
import { PERSOON_NAAM } from './gedeeld'

type Soort = 'euro' | 'pct'

interface Rij {
  id: string
  label: ReactNode
  toelichting?: ReactNode
  soort: Soort
  waarde: (u: JaarUitkomst) => number | null
  nadruk?: 'subtotaal'
}

const teBetalen = (u: JaarUitkomst) => (u.resultaat ? u.resultaat.totaal.teBetalenIB + u.resultaat.totaal.teBetalenZvw : null)

function rijen(hoofd: JaarUitkomst, partner: boolean, metKinderen: boolean): Rij[] {
  const r = hoofd.resultaat
  const lijst: Rij[] = [
    { id: 'ib', label: 'Te betalen inkomstenbelasting', soort: 'euro', waarde: (u) => u.resultaat?.totaal.teBetalenIB ?? null },
    { id: 'zvw', label: 'Te betalen Zvw-bijdrage', soort: 'euro', waarde: (u) => u.resultaat?.totaal.teBetalenZvw ?? null },
    {
      id: 'lasten',
      label: 'Totaal fiscale lasten',
      toelichting: 'IB en Zvw over het hele jaar, vóór loonheffing en voorlopige aanslag',
      soort: 'euro',
      waarde: (u) => (u.resultaat ? u.resultaat.totaal.verschuldigdIB + u.resultaat.totaal.verschuldigdZvw : null),
      nadruk: 'subtotaal',
    },
  ]
  if (hoofd.omzet > 0) lijst.push({ id: 'druk', label: 'IB + Zvw als % van de omzet', soort: 'pct', waarde: (u) => u.resultaat?.totaal.drukOpOmzet ?? null })
  lijst.push({ id: 'netto', label: 'Netto over', toelichting: 'Winst en loon min IB en Zvw', soort: 'euro', waarde: (u) => u.nettoOver })
  for (const p of r?.personen ?? []) {
    if (p.marginaleDruk === undefined) continue
    const id = p.id
    lijst.push({
      id: `md-${id}`,
      label: partner ? `Marginale druk ${PERSOON_NAAM[id].toLowerCase()}` : 'Marginale druk',
      toelichting: 'Van de volgende € 1.000 winst, inclusief Zvw en toeslagen',
      soort: 'pct',
      waarde: (u) => u.resultaat?.personen.find((x) => x.id === id)?.marginaleDruk ?? null,
    })
  }
  const iack = r ? r.personen.reduce((s, p) => s + p.heffingskortingen.iack, 0) : 0
  if (metKinderen || iack > 0) {
    lijst.push({ id: 'iack', label: 'Combinatiekorting', toelichting: 'Per jaar, zit al in de inkomstenbelasting', soort: 'euro', waarde: (u) => (u.resultaat ? u.resultaat.personen.reduce((s, p) => s + p.heffingskortingen.iack, 0) : null) })
  }
  if (metKinderen) {
    lijst.push({ id: 'kot', label: 'Kinderopvangtoeslag per maand', soort: 'euro', waarde: (u) => (u.resultaat ? u.resultaat.toeslagen.kot.totaal / 12 : null) })
    lijst.push({ id: 'kb', label: 'Kinderbijslag per jaar', soort: 'euro', waarde: (u) => u.resultaat?.toeslagen.kinderbijslag ?? null })
  }
  return lijst
}

function weergave(w: number | null, soort: Soort): string {
  if (w === null) return '–'
  return soort === 'pct' ? formatPct(w, 1) : formatEuro(w)
}

function verschil(a: number | null, b: number | null, soort: Soort): string {
  if (a === null || b === null) return '–'
  const d = b - a
  if (soort === 'pct') {
    const pp = Math.round(d * 1000) / 10
    if (pp === 0) return '0'
    return `${pp > 0 ? '+' : '−'}${Math.abs(pp).toLocaleString('nl-NL')} pp`
  }
  if (Math.round(d) === 0) return formatEuro(0)
  return formatEuro(d, { teken: true })
}

function JaarKop({ u }: { u: JaarUitkomst }) {
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="tabular-nums">{u.jaar}</span>
      {(u.status !== 'definitief' || u.concept) && <StatusBadge status={u.concept ? 'geschat' : u.status} label={u.concept ? 'Concept' : undefined} tooltip={false} klein />}
    </span>
  )
}

function VergelijkTabel({ lijst, a, b }: { lijst: Rij[]; a: JaarUitkomst; b: JaarUitkomst }) {
  return (
    <div>
      <p className="sr-only">
        Vergelijking {a.jaar} en {b.jaar} met dezelfde invoer
      </p>
      <div aria-hidden="true" className="grid grid-cols-3 gap-2 border-b border-gray-200 pb-2 text-right text-[11px] font-medium uppercase tracking-wide text-gray-500">
        <JaarKop u={a} />
        <JaarKop u={b} />
        <span className="self-start">Verschil</span>
      </div>
      <dl>
        {lijst.map((r) => {
          const wa = r.waarde(a)
          const wb = r.waarde(b)
          return (
            <div key={r.id} className={cn('py-2', r.nadruk ? 'border-t border-gray-300' : 'border-t border-gray-100 first:border-t-0')}>
              <dt className={cn('text-xs leading-snug', r.nadruk ? 'font-medium text-gray-900' : 'text-gray-700')}>{r.label}</dt>
              <dd className={cn('mt-0.5 grid grid-cols-3 gap-2 text-right text-sm tabular-nums', r.nadruk ? 'font-medium text-gray-900' : 'text-gray-800')}>
                <span>
                  <span className="sr-only">{a.jaar}: </span>
                  {weergave(wa, r.soort)}
                </span>
                <span>
                  <span className="sr-only">{b.jaar}: </span>
                  {weergave(wb, r.soort)}
                </span>
                <span className="text-gray-600">
                  <span className="sr-only">verschil: </span>
                  {verschil(wa, wb, r.soort)}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

interface Props {
  hoofd: JaarUitkomst
  volgend: JaarUitkomst | null
  partner: boolean
  metKinderen: boolean
  bezig: boolean
}

export const Resultaat = memo(function Resultaat({ hoofd, volgend, partner, metKinderen, bezig }: Props) {
  const r = hoofd.resultaat
  const lijst = rijen(hoofd, partner, metKinderen)
  const meldingen = r ? alleWaarschuwingen(r) : []
  const top = meldingen.filter((w) => w.ernst !== 'info').slice(0, 3)
  const bedrag = teBetalen(hoofd)
  const heeftVoorheffing = r ? r.totaal.teBetalenIB + r.totaal.teBetalenZvw !== r.totaal.verschuldigdIB + r.totaal.verschuldigdZvw : false

  return (
    <ResultPanel
      titel={
        <>
          Uitkomst {hoofd.jaar}
          {hoofd.variantLabel && <span className="mt-0.5 block text-xs font-normal text-gray-500">Variant: {hoofd.variantLabel}</span>}
        </>
      }
      kopExtra={hoofd.concept ? <StatusBadge status="geschat" label="Concept" tooltipKant="rechts" /> : hoofd.status !== 'definitief' ? <StatusBadge status={hoofd.status} tooltipKant="rechts" /> : undefined}
    >
      <div aria-busy={bezig} className={cn('transition-opacity', bezig && 'opacity-70')}>
        {hoofd.fout ? (
          <Alert variant="let-op" titel="Deze invoer kunnen we niet doorrekenen">
            {hoofd.fout}
          </Alert>
        ) : (
          <>
            <ResultBedrag
              label={bedrag !== null && bedrag < 0 ? 'Terug te krijgen (IB en Zvw)' : 'Te betalen IB en Zvw'}
              bedrag={bedrag === null ? null : Math.abs(bedrag)}
              toelichting={heeftVoorheffing ? 'Na aftrek van loonheffing en voorlopige aanslag' : 'Over het hele jaar'}
              className="mb-5"
            />
            {volgend ? (
              <VergelijkTabel lijst={lijst} a={hoofd} b={volgend} />
            ) : (
              <StatLijst aria-label={`Uitkomst ${hoofd.jaar}`}>
                {lijst.map((rij) => (
                  <StatRow key={rij.id} label={rij.label} toelichting={rij.toelichting} bedrag={weergave(rij.waarde(hoofd), rij.soort)} variant={rij.nadruk === 'subtotaal' ? 'subtotaal' : 'standaard'} />
                ))}
              </StatLijst>
            )}
            {volgend?.fout && (
              <p className="mt-3 text-xs text-gray-600">
                {volgend.jaar} kunnen we niet doorrekenen: {volgend.fout}
              </p>
            )}
            {volgend?.variantLabel && <p className="mt-2 text-xs text-gray-500">{volgend.jaar} met de variant {volgend.variantLabel}.</p>}
            {top.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-medium text-gray-900">Belangrijkste meldingen</h3>
                <WaarschuwingLijst waarschuwingen={top} />
                {meldingen.length > top.length && (
                  <a href="#uitleg" className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:text-primary-dark hover:underline">
                    Alle {meldingen.length} meldingen bij de uitleg
                  </a>
                )}
              </div>
            )}
          </>
        )}
        <p className="mt-5 text-xs text-gray-500">{SITE.disclaimer}.</p>
      </div>
    </ResultPanel>
  )
})
