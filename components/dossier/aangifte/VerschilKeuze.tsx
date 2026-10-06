'use client'

/**
 * Ronde 2 (A1): "Wijkt af?" bij een rij Controleren. Het bedrag van de Belastingdienst, het verschil met het dossier
 * (tool min Belastingdienst, zoals in de Accountantscheck) en de keuze wat je overneemt, met een notitie. Het vinkje
 * Gecontroleerd kan pas aan als de bedragen gelijk zijn of als je hebt gekozen (Mijn bedrag of Bedrag Belastingdienst).
 *
 * Het bedrag en de notitie gaan naar de aangiftestaat bij het verlaten van het veld (of Enter), zodat niet elke
 * toetsaanslag een wijziging wordt.
 */
import { useEffect, useId, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { ChipGroup, MoneyInput, cn, formatEuro } from '@/components/ui'
import { INVOER_KLASSE } from '@/components/ui/Field'
import { VIA_TOLERANTIE, type VeldVoortgang, type VerschilKeuze as Keuze } from '@/lib/invulhulp/types'

const KEUZES: Array<{ value: Keuze; label: string }> = [
  { value: 'mijn-bedrag', label: 'Mijn bedrag' },
  { value: 'bedrag-belastingdienst', label: 'Bedrag Belastingdienst' },
  { value: 'uitzoeken', label: 'Nog uitzoeken' },
]

export interface VerschilKeuzeProps {
  id: string
  /** Het bedrag in het dossier (hele euro's). */
  dossier: number
  /** Label van het veld, voor de context van invoer en vinkje. */
  wat: string
  vg: VeldVoortgang | undefined
  /** Afgevinkt (en niet gewijzigd sindsdien). */
  afgevinkt: boolean
  bewerkbaar: boolean
  aanpassenHref: string | null
  onVia: (bedrag: number | null) => void
  onKeuze: (keuze: Keuze) => void
  onNotitie: (tekst: string) => void
  onVink: (aan: boolean) => void
  onAanpassen: (href: string) => void
}

export function VerschilKeuze({ id, dossier, wat, vg, afgevinkt, bewerkbaar, aanpassenHref, onVia, onKeuze, onNotitie, onVink, onAanpassen }: VerschilKeuzeProps) {
  const [via, setVia] = useState<number | null>(vg?.via ?? null)
  const [notitie, setNotitie] = useState(vg?.notitie ?? '')
  const notitieId = useId().replace(/:/g, '')
  const vinkId = `${id}-vink`

  // Een wijziging van buiten (Klopt, Ongedaan, een ander venster) neemt het veld over.
  useEffect(() => setVia(vg?.via ?? null), [vg?.via])
  useEffect(() => setNotitie(vg?.notitie ?? ''), [vg?.notitie])

  const verschil = via === null ? null : dossier - via
  const gelijk = verschil !== null && Math.abs(verschil) <= VIA_TOLERANTIE
  const keuze = vg?.keuze ?? null
  const kanVinken = gelijk || keuze === 'mijn-bedrag' || keuze === 'bedrag-belastingdienst'

  const bewaarVia = () => {
    if (via !== (vg?.via ?? null)) onVia(via)
  }
  const bewaarNotitie = () => {
    if (notitie !== (vg?.notitie ?? '')) onNotitie(notitie)
  }

  return (
    <div id={id} className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <MoneyInput
          label="Bedrag van de Belastingdienst"
          value={via}
          onChange={setVia}
          onBlur={bewaarVia}
          onKeyDown={(e) => {
            if (e.key === 'Enter') bewaarVia()
          }}
          negatief
          disabled={!bewerkbaar}
          wrapperClassName="w-full max-w-[14rem]"
        />
        <p aria-live="polite" className={cn('flex min-h-[44px] items-center gap-1.5 text-sm font-medium', gelijk ? 'text-gray-600' : 'text-amber-800')}>
          {verschil !== null && (gelijk ? <Check aria-hidden="true" className="h-4 w-4" /> : <TriangleAlert aria-hidden="true" className="h-4 w-4 text-amber-600" />)}
          {verschil !== null && (gelijk ? 'Gelijk' : `Verschil ${formatEuro(verschil, { teken: true })}`)}
        </p>
      </div>

      {verschil !== null && !gelijk && (
        <div className="mt-3">
          <ChipGroup label="Wat neem je over?" options={KEUZES.map((k) => ({ ...k, disabled: !bewerkbaar }))} value={keuze} onChange={onKeuze} />
          {keuze === 'mijn-bedrag' && <p className="mt-2 text-sm text-gray-600">Je past het bedrag in de aangifte aan naar {formatEuro(dossier)}.</p>}
          {keuze === 'bedrag-belastingdienst' && (
            <p className="mt-2 text-sm text-amber-900">
              Pas dan ook je dossier aan, anders klopt de berekening niet.{' '}
              {aanpassenHref && (
                <a
                  href={aanpassenHref}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    onAanpassen(aanpassenHref)
                  }}
                  className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline"
                >
                  Aanpassen in het dossier
                </a>
              )}
            </p>
          )}
          {keuze === 'uitzoeken' && <p className="mt-2 text-sm text-gray-600">Dit blijft openstaan bij de controles tot je een keuze maakt.</p>}
        </div>
      )}

      {verschil !== null && (
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
          {!gelijk && (
            <div className="w-full max-w-md">
              <label htmlFor={notitieId} className="mb-1.5 block text-sm font-medium text-gray-700">
                Waarom? (optioneel)
              </label>
              <input
                id={notitieId}
                type="text"
                maxLength={500}
                value={notitie}
                disabled={!bewerkbaar}
                onChange={(e) => setNotitie(e.target.value)}
                onBlur={bewaarNotitie}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') bewaarNotitie()
                }}
                className={cn(INVOER_KLASSE, 'border-gray-200 px-3.5 hover:border-gray-300')}
              />
            </div>
          )}
          <label
            htmlFor={vinkId}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 text-sm font-medium',
              kanVinken && bewerkbaar ? 'cursor-pointer text-gray-800' : 'cursor-not-allowed text-gray-500',
            )}
          >
            <input
              id={vinkId}
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 accent-primary"
              checked={afgevinkt}
              disabled={!bewerkbaar || (!kanVinken && !afgevinkt)}
              onChange={(e) => onVink(e.target.checked)}
            />
            Gecontroleerd<span className="sr-only">: {wat}</span>
          </label>
        </div>
      )}
    </div>
  )
}
