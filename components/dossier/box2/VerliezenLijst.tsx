'use client'

/**
 * Ronde 2 (A2): verliezen uit aanmerkelijk belang uit eerdere jaren, per verliesjaar, met per regel tot wanneer je het
 * nog kunt gebruiken (termijn uit de params: box2VervaltNa). Een verlies na de termijn staat in amber "Vervallen: telt
 * niet meer mee" (de engine verrekent het niet; controle box2-verlies-vervallen).
 */
import type { TaxYearParams } from '@/lib/tax/types'
import { box2VervaltNa } from '@/lib/tax/modules/box2-verlies'
import { MoneyInput, NumberInput, formatEuro } from '@/components/ui'
import { Lijst, Rij } from '../velden'

type JaarBedrag = { jaar: number; bedrag: number }

function fout(lijst: JaarBedrag[], i: number, jaar: number): string | undefined {
  const v = lijst[i]
  if (!Number.isInteger(v.jaar) || v.jaar >= jaar) return `Kies een jaar vóór ${jaar}.`
  if (lijst.findIndex((x) => x.jaar === v.jaar) !== i) return `${v.jaar} staat er al in. Tel de bedragen bij elkaar op in één regel.`
  return undefined
}

export function VerliezenLijst({ items, onChange, jaar, params }: { items: JaarBedrag[] | undefined; onChange: (l: JaarBedrag[]) => void; jaar: number; params: TaxYearParams | null }) {
  const lijst = items ?? []
  return (
    <Lijst<JaarBedrag>
      items={items}
      onChange={onChange}
      nieuw={() => {
        const bezet = new Set(lijst.map((x) => x.jaar))
        let j = jaar - 1
        while (bezet.has(j) && j > jaar - 15) j--
        return { jaar: j, bedrag: 0 }
      }}
      titel={(v) => `Verlies ${v.jaar} · ${formatEuro(v.bedrag)}`}
      toevoegLabel="Verlies toevoegen"
      leegTekst="Nog geen verliezen ingevuld."
    >
      {(v, pas, i) => {
        const vervaltNa = params ? box2VervaltNa(v.jaar, params) : null
        const vervallen = vervaltNa !== null && vervaltNa < jaar
        return (
          <div className="space-y-2">
            <Rij>
              <NumberInput label="Verliesjaar" min={jaar - 15} max={jaar - 1} value={v.jaar} error={fout(lijst, i, jaar)} onChange={(n) => pas((x) => void (x.jaar = n ?? jaar - 1))} />
              <MoneyInput label="Nog te verrekenen" value={v.bedrag} onChange={(n) => pas((x) => void (x.bedrag = n ?? 0))} />
            </Rij>
            {vervaltNa !== null &&
              (vervallen ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Vervallen: telt niet meer mee. Een verlies uit {v.jaar} verreken je tot en met {vervaltNa}.
                </p>
              ) : (
                <p className="text-xs text-gray-600">Nog te gebruiken tot en met {vervaltNa}.</p>
              ))}
          </div>
        )
      }}
    </Lijst>
  )
}
