'use client'

/**
 * Ronde 2 (A6): overzicht van de fiscale reserves in "Reserves en vermogen" (voorheen "Oudedagsreserve en vermogen"):
 * per herinvesteringsreserve de stand, "besteden vóór eind {jaar}" en een balk in de tijd, in het laatste jaar in amber;
 * per kostenegalisatiereserve de stand. Invullen gebeurt in het blok van de situatie onderaan de onderneming (de link
 * Aanpassen springt erheen). Zonder reserves toont dit niets.
 */
import type { OndernemingInvoer, OndernemingResultaat, TaxYearParams } from '@/lib/tax/types'
import { hirUiterlijkJaar } from '@/lib/tax/modules/onderneming/reserves'
import { cn, formatEuro } from '@/components/ui'
import { OPEN_VERZOEK } from './SituatieKiezer'
import { hirStandDitJaar, hirVoortgang } from './onderneming-regelingen'

export interface ReservesBlokProps {
  onderneming: OndernemingInvoer
  uitkomst: OndernemingResultaat | null
  jaar: number
  params: TaxYearParams | null
  /** Anker van het situatieblok, bijvoorbeeld `situatie-hir-A-ond-1`. */
  anker: (situatie: 'hir' | 'egalisatie') => string
}

function Aanpassen({ doel, naam }: { doel: string; naam: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById(doel)
        if (!el) return
        el.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        el.dispatchEvent(new CustomEvent(OPEN_VERZOEK))
      }}
      className="inline-flex min-h-[44px] items-center text-xs font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      Aanpassen<span className="sr-only">: {naam}</span>
    </button>
  )
}

export function ReservesBlok({ onderneming: o, uitkomst, jaar, params, anker }: ReservesBlokProps) {
  const hir = o.herinvesteringsreserves ?? []
  const eg = o.egalisatiereserves ?? []
  if (hir.length === 0 && eg.length === 0) return null
  return (
    <ul className="mb-4 space-y-2" aria-label="Fiscale reserves">
      {hir.map((r) => {
        const u = uitkomst?.herinvesteringsreserves?.find((x) => x.id === r.id)
        const uiterlijk = u?.uiterlijkJaar ?? (params ? hirUiterlijkJaar(r, params) : r.ontstaanJaar)
        const stand = hirStandDitJaar(r, jaar, u) - (u?.afboeking ?? 0)
        const laatste = jaar >= uiterlijk && r.voornemen && stand > 0
        const deel = hirVoortgang(r.ontstaanJaar, uiterlijk, jaar)
        const naam = `Herinvesteringsreserve uit ${r.ontstaanJaar}`
        return (
          <li key={r.id} className={cn('rounded-xl border px-4 py-3 text-sm', laatste ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="min-w-0 text-gray-800">
                {naam}
                {r.herkomst.omschrijving.trim() && <span className="text-gray-500"> · {r.herkomst.omschrijving.trim()}</span>}
              </p>
              <p className="font-medium tabular-nums text-gray-900">{formatEuro(Math.max(0, stand))}</p>
            </div>
            <p className={cn('mt-0.5 text-xs', laatste ? 'text-amber-900' : 'text-gray-600')}>
              {u && u.vrijval > 0 && !laatste ? `Valt dit jaar vrij in de winst: ${formatEuro(u.vrijval)}.` : `Besteden vóór eind ${uiterlijk}.`}
            </p>
            <div aria-hidden="true" className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={cn('h-full rounded-full', laatste ? 'bg-amber-500' : 'bg-primary/70')} style={{ width: `${Math.round(deel * 100)}%` }} />
            </div>
            <p className="sr-only">
              Jaar {jaar - r.ontstaanJaar + 1} van {uiterlijk - r.ontstaanJaar + 1}.
            </p>
            {laatste && (
              <p className="mt-2 text-xs font-medium text-amber-900">
                <span className="sr-only">Let op: </span>Moet dit jaar besteed zijn, anders valt {formatEuro(stand)} vrij in de winst.
              </p>
            )}
            <Aanpassen doel={anker('hir')} naam={naam} />
          </li>
        )
      })}
      {eg.map((e) => {
        const u = uitkomst?.egalisatiereserves?.find((x) => x.id === e.id)
        const naam = `Kostenegalisatiereserve${e.omschrijving.trim() ? ` · ${e.omschrijving.trim()}` : ''}`
        return (
          <li key={e.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="min-w-0 text-gray-800">{naam}</p>
              <p className="font-medium tabular-nums text-gray-900">{formatEuro(u ? u.standEind : e.standBegin)}</p>
            </div>
            <p className="mt-0.5 text-xs text-gray-600">{u ? `Stand eind ${jaar}.` : 'Stand op 1 januari.'}</p>
            <Aanpassen doel={anker('egalisatie')} naam={naam} />
          </li>
        )
      })}
    </ul>
  )
}
