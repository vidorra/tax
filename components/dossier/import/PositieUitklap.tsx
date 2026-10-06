'use client'

/**
 * Ronde 2 (A4): één bezitting van een rekening (effecten, geld of crypto) als uitklap: bij welke bezitting het komt,
 * wat er verandert en hoe de interne stromen tussen effecten en geld meetellen. Op mobiel dicht, op desktop open.
 */
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import type { Box3Categorie, HuishoudenInvoer } from '@/lib/tax/types'
import type { ImportRol, ImportVoorstel } from '@/lib/import/types'
import { ROL_CATEGORIEEN } from '@/lib/import/voorstel'
import { Select, cn } from '@/components/ui'
import { WijzigingenLijst, bedrag } from './WijzigingenLijst'

type Positie = ImportVoorstel['posities'][number]

export const ROL_LABEL: Record<ImportRol, string> = { effecten: 'Effecten', geld: 'Geld', crypto: 'Crypto' }

const CATEGORIE_KORT: Partial<Record<Box3Categorie, string>> = {
  bankNL: 'bank in Nederland',
  bankBuitenland: 'buitenlandse bank',
  beleggingen: 'beleggingen',
  groen: 'groene beleggingen',
  crypto: 'crypto',
  contant: 'contant geld',
  overig: 'overige bezitting',
}

function desktop(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
  } catch {
    return false
  }
}

/** De zinnen over de interne stromen bij deze bezitting (aankopen, verkopen, netto dividend, kosten). */
export function stromenZinnen(rol: ImportRol, s: ImportVoorstel['stromen'], heeftCrypto: boolean): string[] {
  if (!s) return []
  const ander = heeftCrypto ? 'de crypto' : 'de effecten'
  const zinnen: string[] = []
  if (s.aankopen > 0) zinnen.push(`De aankopen (${bedrag(s.aankopen)}) tellen als storting bij ${ander} en als opname bij het geld.`)
  if (s.verkopen > 0) zinnen.push(`De verkopen (${bedrag(s.verkopen)}) tellen als opname bij ${ander} en als storting bij het geld.`)
  if (rol === 'geld' && s.netto > 0) zinnen.push(`Het netto dividend en de rente (${bedrag(s.netto)}) komen als storting op het geld; het bruto dividend staat als opbrengst bij de effecten.`)
  if (rol === 'geld' && s.kosten > 0) zinnen.push(`De kosten (${bedrag(s.kosten)}) tellen als opname bij het geld: kosten zijn in box 3 niet aftrekbaar.`)
  return zinnen
}

export interface PositieUitklapProps {
  positie: Positie
  invoer: HuishoudenInvoer
  stromen: ImportVoorstel['stromen']
  heeftCrypto: boolean
  /** Andere doelen in dit voorstel, zodat twee rollen niet dezelfde bezitting kiezen. */
  bezet: string[]
  /** Naam van de eigenaar, alleen bij een rekening die over twee personen is verdeeld. */
  deelVan?: string
  onDoel: (doel: string) => void
}

export function PositieUitklap({ positie: p, invoer, stromen, heeftCrypto, bezet, deelVan, onDoel }: PositieUitklapProps) {
  const [open, setOpen] = useState(desktop)
  const id = useId().replace(/:/g, '')
  const paneel = `positie-${id}`
  const nieuw = p.bestaandId === null
  const status = nieuw ? `nieuw, ${CATEGORIE_KORT[p.wordt.categorie] ?? 'bezitting'}` : 'bestaande bezitting'
  const kandidaten = invoer.box3.posities.filter((x) => ROL_CATEGORIEEN[p.rol].includes(x.categorie) && (x.id === p.bestaandId || !bezet.includes(x.id)))
  const opties = [
    ...kandidaten.map((x, i) => ({ value: x.id, label: x.omschrijving.trim() || `Bezitting ${i + 1}` })),
    { value: 'nieuw', label: 'Nieuwe bezitting' },
  ]
  const zinnen = stromenZinnen(p.rol, stromen, heeftCrypto)

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60">
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={paneel}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="min-w-0 text-sm">
            <span className="font-medium text-gray-900">{ROL_LABEL[p.rol]}:</span> <span className="text-gray-800">{p.wordt.omschrijving}</span>
            {deelVan && <span className="text-gray-600"> ({deelVan})</span>} <span className="text-gray-500">({status})</span>
          </span>
          <ChevronDown aria-hidden="true" className={cn('h-4 w-4 flex-shrink-0 text-gray-500', open && 'rotate-180')} />
        </button>
      </h4>
      <div id={paneel} hidden={!open} className="space-y-4 border-t border-gray-200 px-3 pb-4 pt-3">
        <Select label="Bij welke bezitting?" value={p.bestaandId ?? 'nieuw'} onChange={onDoel} options={opties} wrapperClassName="max-w-md" />
        <WijzigingenLijst wijzigingen={p.wijzigingen} />
        {zinnen.length > 0 && (
          <div className="space-y-1 text-xs leading-relaxed text-gray-600">
            {zinnen.map((z) => (
              <p key={z}>{z}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
