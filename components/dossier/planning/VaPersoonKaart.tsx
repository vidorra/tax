'use client'

/**
 * Ronde 2 (A2): kaart per persoon in de sectie Voorlopige aanslag en belastingrente: wat er nu is opgelegd, wat de
 * berekening verwacht, het advies en de bedragen voor het formulier. Status als tekstbadge (Te laag in amber, de rest
 * grijs), nooit alleen kleur.
 */
import { useId } from 'react'
import type { Status, TaxYearParams, VoorlopigeAanslagAdvies } from '@/lib/tax/types'
import type { PlanningFase } from '@/lib/dossier/planning-fase'
import { Disclosure, KopieerKnop, StatLijst, StatRow, cn, formatEuro } from '@/components/ui'
import { VA_BADGE, heeftVa, nogBij, perMaandZin, teVeel, vaAdviesZin } from './va-tekst'

export interface VaPersoonKaartProps {
  naam: string
  advies: VoorlopigeAanslagAdvies
  params: TaxYearParams
  fase: PlanningFase
  /** Status van de bedragen (conceptjaar: voorstel). */
  bedragStatus?: Status
  /** "Gebruik bij gezamenlijke posten dezelfde verdeling als hier: …" (alleen bij partners). */
  verdelingZin?: string | null
}

export function VaPersoonKaart({ naam, advies: a, params, fase, bedragStatus, verdelingZin }: VaPersoonKaartProps) {
  const kopId = `va-${useId().replace(/:/g, '')}`
  const badge = VA_BADGE[a.status]
  const bij = nogBij(a)
  const terug = teVeel(a)
  const perMaand = fase === 'lopend' ? perMaandZin(a) : null
  const formulier = (a.status === 'te-laag' || a.status === 'te-hoog') && a.formulier.length > 0
  const status = bedragStatus && bedragStatus !== 'definitief' ? bedragStatus : undefined
  return (
    <div role="group" aria-labelledby={kopId} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 id={kopId} className="text-sm font-medium text-gray-900">
          {naam}
        </h3>
        <span
          className={cn(
            'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium leading-none',
            badge.let ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-700',
          )}
        >
          <span className="sr-only">Voorlopige aanslag: </span>
          {badge.label}
        </span>
      </div>
      <StatLijst>
        <StatRow label={a.ib.opgelegd < 0 ? 'Voorlopige teruggaaf IB nu' : 'Voorlopige aanslag IB nu'} bedrag={Math.abs(a.ib.opgelegd)} />
        <StatRow
          label={a.ib.advies < 0 ? 'Terug volgens de berekening' : 'Verschuldigd volgens de berekening'}
          bedrag={Math.abs(a.ib.advies)}
          status={status}
          toelichting={a.ib.voorheffingen !== 0 ? `Na ${formatEuro(a.ib.voorheffingen)} loonheffing en dividendbelasting` : undefined}
        />
      </StatLijst>
      {(a.zvw.opgelegd !== 0 || a.zvw.advies !== 0) && (
        <p className="py-2 text-sm text-gray-700">
          Zvw: nu {formatEuro(a.zvw.opgelegd)}, verschuldigd {formatEuro(a.zvw.advies)}
        </p>
      )}
      <div className="mt-1 border-t border-gray-200 pt-2">
        {a.status === 'te-laag' && (
          <StatLijst>
            <StatRow label="Nog bij te betalen" bedrag={bij} className="font-medium text-gray-900" />
          </StatLijst>
        )}
        {a.status === 'te-hoog' && (
          <StatLijst>
            <StatRow label={heeftVa(a) ? 'Te veel betaald' : 'Terug te krijgen'} bedrag={terug} className="font-medium text-gray-900" />
          </StatLijst>
        )}
        <p className="mt-1 text-sm text-gray-700">{vaAdviesZin(a, params, fase)}</p>
        {perMaand && <p className="mt-2 text-sm text-gray-700">{perMaand}</p>}
        {fase === 'na-afloop' &&
          a.waarschuwingen.map((w) => (
            <p key={w.id} className="mt-2 text-sm text-gray-700">
              {w.tekst}
            </p>
          ))}
      </div>
      {formulier && (
        <Disclosure variant="kaal" titel="Bedragen voor het formulier" subtitel="Verzoek of wijziging voorlopige aanslag" className="mt-2">
          <dl className="divide-y divide-gray-100">
            {a.formulier.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-1">
                <dt className="min-w-0 text-sm text-gray-700">{r.label}</dt>
                <dd className="flex flex-shrink-0 items-center gap-1">
                  <span className="text-sm tabular-nums text-gray-900">{formatEuro(r.bedrag)}</span>
                  <KopieerKnop bedrag={r.bedrag} context={`${r.label}, ${naam}`} />
                </dd>
              </div>
            ))}
          </dl>
          {verdelingZin && <p className="mt-2 text-xs text-gray-600">{verdelingZin}</p>}
          <p className="mt-2 text-xs text-gray-500">De vragen kunnen in het formulier van de Belastingdienst iets anders heten. Kijk ze daar na.</p>
        </Disclosure>
      )}
    </div>
  )
}
