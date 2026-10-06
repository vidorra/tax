'use client'

/**
 * Ronde 2 (A2): de aanslag- en teruggaafgrens en de belastingrente in het uitkomstpaneel (markeringen
 * resultaat-grenzen-A2 en resultaat-per-persoon-A2 in ResultaatInhoud).
 *
 * - GrensToelichting: onder het grote bedrag de zinnen uit grensZinnen (per persoon, grenzen uit de params) en, in een
 *   verstreken jaar met een bij te betalen bedrag, de belastingrente per maand met een link naar Planning.
 * - PerPersoonNaGrenzen: bij twee personen per persoon wat er na de grenzen te betalen of terug is.
 * Defensief: zonder `PersoonResultaat.aanslag` (oude uitkomst) tonen ze niets.
 */
import Link from 'next/link'
import { useMemo } from 'react'
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId, TaxYearParams } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'
import { rentePerMaand, renteVanaf } from '@/lib/tax/modules/planning/belastingrente'
import { jaarVerstreken } from '@/lib/dossier/planning-fase'
import { StatLijst, StatRow, formatDatum, formatEuro } from '@/components/ui'
import { grensZinnen } from '../grenzen-tekst'
import { persoonNaam } from '../secties/types'
import { useVandaag } from './useVandaag'

function useParams(r: HuishoudenResultaat): TaxYearParams | null {
  return useMemo(() => {
    try {
      return getJaar(r.jaar, r.variant ?? undefined)
    } catch {
      return null
    }
  }, [r.jaar, r.variant])
}

const naamVan = (invoer: HuishoudenInvoer) => (id: PersoonId) => persoonNaam(invoer.personen.find((p) => p.id === id) ?? { id })

export function GrensToelichting({ resultaat: r, invoer }: { resultaat: HuishoudenResultaat; invoer: HuishoudenInvoer }) {
  const params = useParams(r)
  const vandaag = useVandaag()
  if (!params) return null
  const zinnen = grensZinnen(r, params, naamVan(invoer))
  let rente: { perMaand: number; start: string; loopt: boolean } | null = null
  if (vandaag && jaarVerstreken(r.jaar, vandaag)) {
    const start = renteVanaf(r.jaar, params)
    const ctx = { params, tabel: BELASTINGRENTE_IB }
    const peil = vandaag > start ? vandaag : start
    const perMaand = r.personen.reduce((s, p) => {
      const ib = p.aanslag ? p.aanslag.teBetalen : Math.max(0, p.teBetalenIB)
      return s + rentePerMaand(ib, peil, ctx).bedrag + rentePerMaand(Math.max(0, p.zvw.teBetalen), peil, ctx).bedrag
    }, 0)
    if (perMaand > 0) rente = { perMaand, start, loopt: vandaag >= start }
  }
  if (zinnen.length === 0 && !rente) return null
  return (
    <div className="space-y-1 text-sm text-gray-600">
      {zinnen.map((z) => (
        <p key={z}>{z}</p>
      ))}
      {rente && (
        <p>
          {rente.loopt
            ? `Belastingrente loopt sinds ${formatDatum(rente.start)} tot de aanslag er is: ongeveer ${formatEuro(rente.perMaand)} per maand`
            : `Belastingrente vanaf ${formatDatum(rente.start)} als de aanslag later komt: ongeveer ${formatEuro(rente.perMaand)} per maand`}
          {' · '}
          <Link
            href={`/dossier/${r.jaar}/planning/#voorlopige-aanslag`}
            className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline"
          >
            Plan je voorlopige aanslag
          </Link>
        </p>
      )}
    </div>
  )
}

export function PerPersoonNaGrenzen({ resultaat: r, invoer }: { resultaat: HuishoudenResultaat; invoer: HuishoudenInvoer }) {
  const params = useParams(r)
  if (!params || r.personen.length < 2 || r.personen.some((p) => !p.aanslag)) return null
  const o = params.overig.waarde
  const naam = naamVan(invoer)
  return (
    <div className="mt-3">
      <h4 className="text-xs font-medium text-gray-500">Na de aanslag- en teruggaafgrens</h4>
      <StatLijst aria-label="Per persoon na de aanslag- en teruggaafgrens">
        {r.personen.map((p) => {
          const a = p.aanslag!
          const v = a.vervallenDoorGrens
          const bedrag = a.teBetalen > 0 ? `te betalen ${formatEuro(a.teBetalen)}` : a.terug > 0 ? `terug ${formatEuro(a.terug)}` : formatEuro(0)
          const toelichting = v
            ? v.soort === 'aanslaggrens'
              ? `Berekend ${formatEuro(v.bedrag)}, onder de aanslaggrens van ${formatEuro(o.aanslaggrens)}: wordt niet opgelegd`
              : `Berekend terug ${formatEuro(v.bedrag)}, onder de teruggaafgrens van ${formatEuro(o.teruggaafgrens)}: wordt niet uitbetaald`
            : a.grond === 'geen'
              ? 'Geen aanslag: niets te betalen of terug'
              : undefined
          return <StatRow key={p.id} label={naam(p.id)} bedrag={bedrag} toelichting={toelichting} />
        })}
      </StatLijst>
    </div>
  )
}
