'use client'

/**
 * Ronde 2 (A2): "Wat kost uitstel?" in de sectie Voorlopige aanslag en belastingrente. De verwachte dagtekening van de
 * definitieve aanslag staat in de aangiftestaat (`planning.verwachteDagtekening`, gedeelde provider van de pagina) en
 * rekent alle personen live door. Leeg: alleen de rente per maand dat de aanslag later komt.
 *
 * Toetsenbord en schermlezer: een gewoon datumveld met label en hint; de opslagstatus staat ernaast
 * (AangifteStaatStatus) en na het opslaan meldt `kondigAan` het in het gedeelde live-gebied.
 */
import { Fragment, useEffect, useRef } from 'react'
import type { BelastingrenteUitkomst, Status, TaxYearParams, Uitlegregel, VoorlopigeAanslagAdvies } from '@/lib/tax/types'
import { STATUS_RANG } from '@/lib/tax/types'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'
import { geenRenteVoor, rentePerMaand, renteVanaf } from '@/lib/tax/modules/planning/belastingrente'
import type { PlanningFase } from '@/lib/dossier/planning-fase'
import { Disclosure, StatLijst, StatRow, UitlegLijst, formatDatum, formatEuro, kondigAan } from '@/components/ui'
import { Datum } from '../velden'
import { AangifteStaatStatus } from '../AangifteStaatStatus'
import { useAangifteStaatContext } from '../useAangifteStaat'
import { nogBij, naAfloopZin, praktijkZin, renteSchattingUitleg } from './va-tekst'

export interface UitstelBlokProps {
  jaar: number
  params: TaxYearParams
  vandaag: string
  fase: PlanningFase
  personen: Array<{ id: string; naam: string; advies: VoorlopigeAanslagAdvies }>
  /** Kop weglaten (in de ingeklapte sectie bij Ingediend is de uitklap de kop). */
  zonderKop?: boolean
}

const laagste = (statussen: Status[]): Status => statussen.reduce<Status>((l, s) => (STATUS_RANG[s] < STATUS_RANG[l] ? s : l), 'definitief')

export function UitstelBlok({ jaar, params, vandaag, fase, personen, zonderKop }: UitstelBlokProps) {
  const staat = useAangifteStaatContext()
  const planning = staat.staat.planning ?? {}
  const dagtekening = planning.verwachteDagtekening
  const start = renteVanaf(jaar, params)
  const mei = geenRenteVoor(jaar, params)
  const ctx = { params, tabel: BELASTINGRENTE_IB }
  const metBedrag = personen.filter((p) => nogBij(p.advies) > 0)
  const renteUitleg = renteSchattingUitleg(BELASTINGRENTE_IB) ?? undefined
  const meer = personen.length > 1

  // Na het opslaan van een gewijzigde datum één melding in het live-gebied.
  const gewijzigd = useRef(false)
  useEffect(() => {
    if (gewijzigd.current && staat.opslag === 'opgeslagen') {
      gewijzigd.current = false
      kondigAan('Verwachte datum van de aanslag opgeslagen.')
    }
  }, [staat.opslag])

  function zetDatum(v: string | undefined) {
    const volgende = { ...planning }
    if (v) volgende.verwachteDagtekening = v
    else delete volgende.verwachteDagtekening
    gewijzigd.current = true
    staat.wijzig([{ soort: 'planning', waarde: Object.keys(volgende).length > 0 ? volgende : null }])
  }

  const uitleg: Uitlegregel[] = []
  const praktijkRegels: string[] = []
  const rijen = metBedrag.map((p) => {
    const bij = nogBij(p.advies)
    const rente = p.advies.rente
    const delen = [rente?.ib, rente?.zvw].filter((x): x is BelastingrenteUitkomst => Boolean(x))
    const wet = delen.reduce((s, x) => s + x.bedrag, 0)
    const praktijk = delen.reduce((s, x) => s + (x.praktijk ? x.praktijk.bedrag : x.bedrag), 0)
    const reden = delen.find((x) => x.reden)?.reden ?? null
    const zin = dagtekening ? praktijkZin({ bedrag: wet, reden }, praktijk, start) : null
    if (zin) praktijkRegels.push(meer ? `${p.naam}: ${zin}` : zin)
    for (const [heffing, d] of [
      ['IB', rente?.ib],
      ['Zvw', rente?.zvw],
    ] as const) {
      if (d) uitleg.push(...d.uitleg.map((r) => ({ ...r, id: `${p.id}-${heffing}-${r.id}`, label: `${meer ? `${p.naam}, ` : ''}${heffing}: ${r.label}` })))
    }
    const vanaf = dagtekening && dagtekening > start ? dagtekening : start
    const perMaand = rentePerMaand(Math.max(0, p.advies.ib.verschil), vanaf, ctx).bedrag + rentePerMaand(Math.max(0, p.advies.zvw.verschil), vanaf, ctx).bedrag
    return { id: p.id, naam: p.naam, bij, wet, status: laagste(delen.map((x) => x.status)), perMaand, perMaandStatus: rentePerMaand(bij, vanaf, ctx).status }
  })

  return (
    <div className="space-y-4">
      {!zonderKop && <h3 className="text-sm font-medium text-gray-900">Wat kost uitstel?</h3>}
      {fase === 'na-afloop' && <p className="text-sm text-gray-700">{naAfloopZin(jaar, vandaag, mei, start)}</p>}
      {metBedrag.length === 0 ? (
        <p className="text-sm text-gray-600">Er is niets bij te betalen, dus er loopt ook geen belastingrente.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="sm:w-[22rem]">
              <Datum label="Verwachte datum van de aanslag" value={dagtekening} onChange={zetDatum} hint="Leeg is rente per maand dat de aanslag later komt." />
            </div>
            <AangifteStaatStatus />
          </div>
          <StatLijst aria-label="Belastingrente bij uitstel">
            {fase !== 'ingediend' && vandaag < mei && <StatRow label={`Vóór ${formatDatum(mei)} aanvragen of aangifte doen`} bedrag="geen belastingrente" />}
            <StatRow label="Belastingrente loopt vanaf" bedrag={formatDatum(start)} />
            {rijen.map((r) => (
              <Fragment key={r.id}>
                {dagtekening && <StatRow label={`Aanslag op ${formatDatum(dagtekening)}, ${r.naam}`} bedrag={r.wet} status={r.status} statusUitleg={renteUitleg} />}
                <StatRow label={`Per maand later, ${r.naam}`} bedrag={r.perMaand} status={r.perMaandStatus} statusUitleg={renteUitleg} toelichting={`Over ${formatEuro(r.bij)} die nog bij moet`} />
              </Fragment>
            ))}
          </StatLijst>
          {praktijkRegels.map((z, i) => (
            <p key={i} className="text-sm text-gray-500">
              {z}
            </p>
          ))}
          {uitleg.length > 0 && (
            <Disclosure variant="kaal" titel="Zo is het berekend">
              <UitlegLijst regels={uitleg} aria-label="Berekening belastingrente" statusUitleg={() => renteUitleg} />
            </Disclosure>
          )}
        </>
      )}
    </div>
  )
}
