'use client'

import { useMemo, useState } from 'react'
import type { HuishoudenInvoer, HuishoudenResultaat, Status } from '@/lib/tax/types'
import { berekenDossier } from '@/lib/dossier/bereken'
import { vergelijkJaren } from '@/lib/tax/modules/planning/jaarvergelijking'
import { Alert, Card, Select, StatusBadge, Toggle, cn, formatEuro } from '@/components/ui'
import { Disclaimer } from './Disclaimer'

export interface VergelijkJaar {
  jaar: number
  variant: string | null
  invoer: HuishoudenInvoer
  varianten: Array<{ id: string; label: string; status: Status }>
  status: Status
}

interface Keuze {
  jaar: number
  variant: string
}

function reken(j: VergelijkJaar | undefined, variant: string): HuishoudenResultaat | null {
  if (!j) return null
  try {
    const v = variant || undefined
    return berekenDossier({ ...j.invoer, variant: v }, { variant: v, zonderMarginaleDruk: true })
  } catch {
    return null
  }
}

function KeuzeVelden({ label, jaren, keuze, onChange }: { label: string; jaren: VergelijkJaar[]; keuze: Keuze; onChange: (k: Keuze) => void }) {
  const j = jaren.find((x) => x.jaar === keuze.jaar)
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium text-gray-900">{label}</legend>
      <Select label="Jaar" value={String(keuze.jaar)} onChange={(v) => onChange({ jaar: Number(v), variant: jaren.find((x) => x.jaar === Number(v))?.variant ?? '' })} options={jaren.map((x) => ({ value: String(x.jaar), label: String(x.jaar) }))} />
      {j && j.varianten.length > 0 && (
        <Select label="Parameters" value={keuze.variant} onChange={(v) => onChange({ ...keuze, variant: v })} options={[{ value: '', label: 'Standaard' }, ...j.varianten.map((v) => ({ value: v.id, label: v.label }))]} />
      )}
    </fieldset>
  )
}

export function Vergelijk({ jaren }: { jaren: VergelijkJaar[] }) {
  const laatste = jaren[jaren.length - 1]
  const metVarianten = jaren.find((j) => j.varianten.length > 0)
  const startA: Keuze = jaren.length >= 2 ? { jaar: jaren[jaren.length - 2].jaar, variant: jaren[jaren.length - 2].variant ?? '' } : metVarianten ? { jaar: metVarianten.jaar, variant: '' } : { jaar: laatste?.jaar ?? 0, variant: '' }
  const startB: Keuze = jaren.length >= 2 ? { jaar: laatste.jaar, variant: laatste.variant ?? '' } : metVarianten ? { jaar: metVarianten.jaar, variant: metVarianten.varianten[0].id } : startA
  const [a, setA] = useState<Keuze>(startA)
  const [b, setB] = useState<Keuze>(startB)
  const [alleenVerschil, setAlleenVerschil] = useState(true)

  const rA = useMemo(() => reken(jaren.find((j) => j.jaar === a.jaar), a.variant), [jaren, a])
  const rB = useMemo(() => reken(jaren.find((j) => j.jaar === b.jaar), b.variant), [jaren, b])
  const regels = useMemo(() => (rA && rB ? vergelijkJaren(rA, rB) : []), [rA, rB])
  const zichtbaar = alleenVerschil ? regels.filter((r) => r.verschil !== 0) : regels

  if (jaren.length === 0) return <Alert variant="actie">Voeg eerst een jaar toe aan je dossier.</Alert>
  const naam = (k: Keuze) => {
    const j = jaren.find((x) => x.jaar === k.jaar)
    return `${k.jaar}${k.variant ? ` (${j?.varianten.find((v) => v.id === k.variant)?.label ?? k.variant})` : ''}`
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-6 sm:grid-cols-2">
          <KeuzeVelden label="Links" jaren={jaren} keuze={a} onChange={setA} />
          <KeuzeVelden label="Rechts" jaren={jaren} keuze={b} onChange={setB} />
        </div>
        {jaren.length === 1 && !metVarianten && <p className="mt-4 text-sm text-gray-600">Met één jaar zonder varianten valt er weinig te vergelijken. Voeg een tweede jaar toe.</p>}
        <Toggle className="mt-5" label="Alleen regels met een verschil" checked={alleenVerschil} onChange={setAlleenVerschil} />
      </Card>

      {!rA || !rB ? (
        <Alert variant="let-op">Een van de twee berekeningen lukt niet met de opgeslagen invoer.</Alert>
      ) : (
        <Card padding="geen">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-medium text-gray-900">
              {naam(a)} tegenover {naam(b)}
            </h2>
            <div className="flex gap-2">
              {rA.paramsStatus !== 'definitief' && <StatusBadge status={rA.paramsStatus} klein label={`${a.jaar}: ${rA.paramsStatus}`} />}
              {rB.paramsStatus !== 'definitief' && <StatusBadge status={rB.paramsStatus} klein label={`${b.jaar}: ${rB.paramsStatus}`} tooltipKant="rechts" />}
            </div>
          </div>
          <div className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_8rem] gap-4 border-b border-gray-100 px-5 py-2 text-xs font-medium text-gray-500 md:grid">
            <span>Regel</span>
            <span className="text-right">{naam(a)}</span>
            <span className="text-right">{naam(b)}</span>
            <span className="text-right">Verschil</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {[
              { id: 'totaal.ib', label: 'Te betalen inkomstenbelasting (huishouden)', a: rA.totaal.teBetalenIB, b: rB.totaal.teBetalenIB, verschil: rB.totaal.teBetalenIB - rA.totaal.teBetalenIB },
              { id: 'totaal.zvw', label: 'Te betalen Zvw (huishouden)', a: rA.totaal.teBetalenZvw, b: rB.totaal.teBetalenZvw, verschil: rB.totaal.teBetalenZvw - rA.totaal.teBetalenZvw },
              ...zichtbaar,
            ].map((r, i) => (
              <li key={`${r.id}-${i}`} className={cn('grid grid-cols-3 gap-x-3 gap-y-1 px-5 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem] md:gap-4', i < 2 && 'bg-gray-50 font-medium')}>
                <span className="col-span-3 text-gray-800 md:col-span-1">{r.label}</span>
                <span className="text-right tabular-nums text-gray-700">
                  <span className="sr-only">{naam(a)}: </span>
                  {formatEuro(r.a)}
                </span>
                <span className="text-right tabular-nums text-gray-700">
                  <span className="sr-only">{naam(b)}: </span>
                  {formatEuro(r.b)}
                </span>
                <span className={cn('text-right tabular-nums', r.verschil !== 0 ? 'font-medium text-gray-900' : 'text-gray-500')}>
                  <span className="sr-only">verschil: </span>
                  {formatEuro(r.verschil, { teken: true })}
                </span>
              </li>
            ))}
          </ul>
          {zichtbaar.length === 0 && <p className="px-5 py-4 text-sm text-gray-600">Geen verschillen per regel.</p>}
        </Card>
      )}
      <Disclaimer />
    </div>
  )
}
