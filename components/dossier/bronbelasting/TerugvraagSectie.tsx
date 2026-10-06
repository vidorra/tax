'use client'

/**
 * Ronde 2 (A5): sectie "Terugvragen in het buitenland" op Planning (markering planning-terugvragen-A5), alleen als er
 * iets terug te vragen is. Per regel land, bedrag, uiterste datum (of "termijn nakijken"), procedure en de status.
 * De status gaat direct naar de aangiftestaat (`terugvragen` op `${positieId}/${regelId}`, `{ direct: true }`) via de
 * ene AangifteStaatProvider die al om de Planning-pagina staat; AangifteStaatStatus laat zien of het is opgeslagen.
 * Regels die binnen zes maanden verlopen en nog open staan, komen bovenaan.
 */
import { Globe } from 'lucide-react'
import type { HuishoudenInvoer, HuishoudenResultaat, TaxYearParams } from '@/lib/tax/types'
import type { TerugvraagStatus } from '@/lib/dossier/aangiftestaat'
import { TERUGVRAAG_STATUS_LABEL, bronbelastingRegelsVan, terugvraagLijst, type TerugvraagItem } from '@/lib/dossier/terugvragen'
import { ChipGroup, Section, cn, formatDatum, kondigAan } from '@/components/ui'
import { persoonNaam } from '../secties/types'
import { useAangifteStaatOptioneel } from '../useAangifteStaat'
import { AangifteStaatStatus } from '../AangifteStaatStatus'
import { euroCent, inLand } from './notatie'

const STATUSSEN = (Object.keys(TERUGVRAAG_STATUS_LABEL) as Array<TerugvraagStatus['status']>).map((value) => ({ value, label: TERUGVRAAG_STATUS_LABEL[value] }))

export interface TerugvraagSectieProps {
  invoer: HuishoudenInvoer
  resultaat: HuishoudenResultaat | null
  params: TaxYearParams | null
  /** ISO-datum van vandaag (van de server). */
  vandaag: string
}

export function TerugvraagSectie({ invoer, resultaat, params, vandaag }: TerugvraagSectieProps) {
  const s = useAangifteStaatOptioneel()
  const regels = bronbelastingRegelsVan(invoer, resultaat, params)
  const items = terugvraagLijst(invoer, regels, s?.staat, vandaag)
  if (items.length === 0) return null
  const open = items.filter((x) => x.status === 'open' || x.status === 'aangevraagd').reduce((t, x) => t + x.bedrag, 0)

  const zet = (x: TerugvraagItem, status: TerugvraagStatus['status']) => {
    if (!s) return
    s.wijzig([{ soort: 'terugvraag', sleutel: x.sleutel, waarde: { status, op: new Date().toISOString() } }], { direct: true })
    kondigAan(`${x.landNaam}: ${TERUGVRAAG_STATUS_LABEL[status]}.`)
  }

  return (
    <Section
      id="terugvragen"
      icon={<Globe />}
      title="Terugvragen in het buitenland"
      subtitle="Bronbelasting boven het verdragstarief krijg je niet via je Nederlandse aangifte terug. Die vraag je aan bij de belastingdienst van het bronland."
      value={open > 0 ? euroCent(open) : undefined}
    >
      <div className="space-y-4">
        <AangifteStaatStatus />
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200" aria-label="Verzoeken om terug te vragen">
          {items.map((x) => (
            <li key={x.sleutel} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {x.landNaam} · {euroCent(x.bedrag)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {x.positieNaam} · {eigenaarNaam(invoer, x.eigenaar)}
                    {x.soort === 'rente' ? ' · rente' : ''}
                  </p>
                </div>
                <p className={cn('text-sm', x.binnenkort ? 'font-medium text-amber-900' : x.verlopen ? 'text-gray-500' : 'text-gray-700')}>
                  {x.uiterlijk ? (x.verlopen ? `Termijn verlopen op ${formatDatum(x.uiterlijk)}` : `Uiterlijk ${formatDatum(x.uiterlijk)}`) : 'Termijn nakijken'}
                  {x.binnenkort && <span className="sr-only">, verloopt binnen zes maanden</span>}
                </p>
              </div>
              {x.procedure && (
                <p className="text-sm text-gray-700">
                  {x.procedure}
                  {x.url && (
                    <>
                      {' · '}
                      <a href={x.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline">
                        Site van de belastingdienst {inLand(x.landNaam)}
                        <span className="sr-only"> (opent in een nieuw venster)</span>
                      </a>
                    </>
                  )}
                </p>
              )}
              {x.klein && <p className="text-xs text-gray-500">Terugvragen loont waarschijnlijk niet.</p>}
              {s ? (
                <ChipGroup<TerugvraagStatus['status']> label={`Status ${x.landNaam}`} labelVerborgen value={x.status} onChange={(v) => zet(x, v)} options={STATUSSEN} />
              ) : (
                <p className="text-xs text-gray-500">Status: {TERUGVRAAG_STATUS_LABEL[x.status]}</p>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">De termijnen zijn een indicatie per land. Kijk ze na bij het bronland.</p>
      </div>
    </Section>
  )
}

function eigenaarNaam(invoer: HuishoudenInvoer, eigenaar: string): string {
  const p = invoer.personen.find((x) => x.id === eigenaar)
  if (p) return persoonNaam(p)
  const k = invoer.kinderen.findIndex((x) => `kind:${x.id}` === eigenaar)
  return k >= 0 ? invoer.kinderen[k].naam?.trim() || `Kind ${k + 1}` : 'Samen'
}
