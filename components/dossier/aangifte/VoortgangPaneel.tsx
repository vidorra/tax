'use client'

/**
 * Ronde 2 (A1): het voortgangspaneel (sticky rechts op desktop, onderaan op mobiel): voortgang van de gekozen persoon,
 * verschillen met de vooraf ingevulde aangifte, de opslagstatus van de aangiftestaat, de controles en (op desktop) de
 * lijst Onderdelen.
 */
import type { ReactNode } from 'react'
import { CircleCheck } from 'lucide-react'
import { ResultPanel } from '@/components/ui'
import type { InvulhulpTelling } from '@/lib/invulhulp/types'
import { AangifteStaatStatus } from '../AangifteStaatStatus'

export interface VoortgangPaneelProps {
  persoonNaam: string
  telling: InvulhulpTelling
  /** Alles afgevinkt en geen open fouten. */
  klaar: boolean
  onNaarOverzicht?: () => void
  children?: ReactNode
}

export function VoortgangPaneel({ persoonNaam, telling, klaar, onNaarOverzicht, children }: VoortgangPaneelProps) {
  const pct = telling.totaal > 0 ? Math.round((telling.afgevinkt / telling.totaal) * 100) : 0
  return (
    <ResultPanel id="voortgang" titel={`Voortgang ${persoonNaam}`} className="lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto print:hidden">
      <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-gray-800">
        <span className="font-semibold tabular-nums">
          {telling.afgevinkt} van {telling.totaal}
        </span>{' '}
        ingevuld en gecontroleerd
      </p>
      {telling.verschillen > 0 && (
        <p className="mt-1 text-sm text-amber-800">
          {telling.verschillen} {telling.verschillen === 1 ? 'verschil' : 'verschillen'} met de vooraf ingevulde aangifte
        </p>
      )}
      {telling.gewijzigd > 0 && (
        <p className="mt-1 text-sm text-amber-800">
          {telling.gewijzigd} {telling.gewijzigd === 1 ? 'bedrag' : 'bedragen'} gewijzigd sinds je ze afvinkte
        </p>
      )}
      {klaar && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-sm text-gray-800">
          <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <span>
            Alles ingevuld en gecontroleerd. Vul op het scherm{' '}
            {onNaarOverzicht ? (
              <button type="button" onClick={onNaarOverzicht} className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline">
                Overzicht
              </button>
            ) : (
              'Overzicht'
            )}{' '}
            in wat het aangifteprogramma berekent, dan zie je of het klopt.
          </span>
        </p>
      )}
      <AangifteStaatStatus className="mt-3" altijd />
      {children}
    </ResultPanel>
  )
}
