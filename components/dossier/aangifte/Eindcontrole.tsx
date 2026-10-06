'use client'

/**
 * Ronde 2 (A1): eindcontrole op het scherm Overzicht belasting en premies. Je vult in wat het aangifteprogramma als te
 * betalen (of terug, met een min) berekent; de tool vergelijkt dat met `teBetalenIB` en `zvw.teBetalen` (het programma
 * toont het berekende bedrag; de aanslag- of teruggaafgrens past de Belastingdienst pas toe bij het opleggen) en toont
 * de grens apart. Bewaard in de aangiftestaat (`programma`) bij het verlaten van het veld.
 */
import { useEffect, useState } from 'react'
import { Check, Info, TriangleAlert } from 'lucide-react'
import { ButtonLink, MoneyInput, cn, formatEuro } from '@/components/ui'
import type { PersoonResultaat, TaxYearParams } from '@/lib/tax/types'
import { eindcontrole, grensZin, type EindVergelijking } from '@/lib/invulhulp/voortgang'
import { STATUS_KEUZE_ID } from '../controles/StatusKeuze'

export interface EindcontroleProps {
  jaar: number
  persoonNaam: string
  /** Twee personen: de naam staat bij de labels. */
  metNaam: boolean
  resultaat: Pick<PersoonResultaat, 'teBetalenIB' | 'zvw' | 'aanslag'>
  params: TaxYearParams
  programma: { ib?: number | null; zvw?: number | null } | undefined
  bewerkbaar: boolean
  /** Het jaar staat al op Ingediend: geen knop Status aanpassen. */
  ingediend?: boolean
  onProgramma: (waarde: { ib: number | null; zvw: number | null }) => void
  /** Status aanpassen: eerst opslaan (flush), dan naar Invoer en resultaat. */
  onNaar: (href: string) => void
}

/** Verschil zoals bij de vooraf ingevulde aangifte: tool min aangifteprogramma. */
function Vergelijking({ v }: { v: EindVergelijking }) {
  return (
    <p aria-live="polite" className={cn('flex min-h-[44px] items-center gap-1.5 text-sm font-medium', v.gelijk === false ? 'text-amber-800' : 'text-gray-600')}>
      {v.gelijk === true && <Check aria-hidden="true" className="h-4 w-4" />}
      {v.gelijk === false && <TriangleAlert aria-hidden="true" className="h-4 w-4 text-amber-600" />}
      {v.gelijk === true && 'Gelijk'}
      {v.gelijk === false && `Verschil ${formatEuro(-(v.verschil ?? 0), { teken: true })}`}
    </p>
  )
}

export function Eindcontrole({ jaar, persoonNaam, metNaam, resultaat, params, programma, bewerkbaar, ingediend, onProgramma, onNaar }: EindcontroleProps) {
  const [ib, setIb] = useState<number | null>(programma?.ib ?? null)
  const [zvw, setZvw] = useState<number | null>(programma?.zvw ?? null)
  useEffect(() => setIb(programma?.ib ?? null), [programma?.ib])
  useEffect(() => setZvw(programma?.zvw ?? null), [programma?.zvw])

  const e = eindcontrole(resultaat, { ib, zvw })
  const grens = grensZin(resultaat, params)
  const bewaar = () => {
    if (ib !== (programma?.ib ?? null) || zvw !== (programma?.zvw ?? null)) onProgramma({ ib, zvw })
  }
  const enter = (k: { key: string }) => {
    if (k.key === 'Enter') bewaar()
  }
  const bij = metNaam ? ` (${persoonNaam})` : ''
  const verschil = e.ib.gelijk === false ? { soort: 'ib' as const, v: e.ib } : e.zvw.gelijk === false ? { soort: 'zvw' as const, v: e.zvw } : null
  const gelijk = e.ib.gelijk === true && e.zvw.gelijk !== false
  const statusHref = `/dossier/${jaar}/#${STATUS_KEUZE_ID}`

  return (
    <div className="mt-4 space-y-5 border-t border-gray-100 pt-4">
      {(
        [
          ['ib', `Te betalen IB en PVV volgens de tool${bij}`, e.ib, ib, setIb],
          ['zvw', `Te betalen Zvw volgens de tool${bij}`, e.zvw, zvw, setZvw],
        ] as const
      ).map(([soort, label, v, waarde, zet]) => (
        <div key={soort}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-gray-700">{label}</p>
            <p className="text-base font-semibold tabular-nums text-gray-900">{formatEuro(v.tool)}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
            <MoneyInput
              label={`Volgens het aangifteprogramma${soort === 'zvw' ? ' (Zvw)' : ''}`}
              hint="Krijg je geld terug, typ dan een min ervoor."
              value={waarde}
              onChange={zet}
              onBlur={bewaar}
              onKeyDown={enter}
              negatief
              disabled={!bewerkbaar}
              wrapperClassName="w-full max-w-[16rem]"
            />
            <Vergelijking v={v} />
          </div>
        </div>
      ))}

      {verschil && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p>
            <span className="sr-only">Let op: </span>
            {verschil.soort === 'zvw' ? 'Voor de Zvw komt het aangifteprogramma op ' : 'Het aangifteprogramma komt op '}
            {formatEuro(verschil.v.programma ?? 0)}, de tool op {formatEuro(verschil.v.tool)}. Kijk de schermen met een verschil na; vaak zit het in een vooraf ingevuld bedrag of
            de verdeling met je partner.
          </p>
        </div>
      )}

      {grens && (
        <p className="flex items-start gap-2 text-sm text-gray-700">
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
          {grens}
        </p>
      )}

      {gelijk && ingediend && (
        <p className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm text-gray-800">
          <Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          Gelijk. Dit jaar staat al op Ingediend.
        </p>
      )}
      {gelijk && !ingediend && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm text-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <p>Gelijk. Klopt de rest ook, dan kun je de aangifte versturen. Zet daarna de status van dit jaar op Ingediend.</p>
          <ButtonLink
            href={statusHref}
            grootte="sm"
            className="flex-shrink-0 print:hidden"
            onClick={(ev) => {
              if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return
              ev.preventDefault()
              onNaar(statusHref)
            }}
          >
            Status aanpassen
          </ButtonLink>
        </div>
      )}
    </div>
  )
}
