'use client'

/**
 * Ronde 2 (A1): lijst Onderdelen, een `nav` met ankerlinks naar de schermen (geen stappen). Status per onderdeel met
 * icoon en tekst: klaar, deels, niet begonnen, verschil of fout. Een klik scrolt naar het scherm en zet de focus op de
 * kop.
 */
import { CircleAlert, CircleCheck, Circle, CircleDashed, Contrast } from 'lucide-react'
import { cn } from '@/components/ui'
import type { InvulhulpTelling } from '@/lib/invulhulp/types'
import type { SchermStatus } from '@/lib/invulhulp/voortgang'

export interface Onderdeel {
  sleutel: string
  titel: string
  status: SchermStatus
  telling: InvulhulpTelling
}

const STATUS: Record<SchermStatus, { icoon: typeof Circle; tekst: string; kleur: string }> = {
  klaar: { icoon: CircleCheck, tekst: 'klaar', kleur: 'text-primary' },
  deels: { icoon: Contrast, tekst: 'deels', kleur: 'text-primary' },
  'niet-begonnen': {
    icoon: Circle,
    tekst: 'niet begonnen',
    kleur: 'text-gray-400',
  },
  aandacht: {
    icoon: CircleAlert,
    tekst: 'verschil of fout',
    kleur: 'text-amber-600',
  },
  geen: {
    icoon: CircleDashed,
    tekst: 'alleen ter controle',
    kleur: 'text-gray-400',
  },
}

export function OnderdelenNav({ onderdelen, onKies, className }: { onderdelen: Onderdeel[]; onKies: (sleutel: string) => void; className?: string }) {
  return (
    <nav aria-label="Onderdelen" className={className}>
      <ul className="space-y-0.5">
        {onderdelen.map((o) => {
          const s = STATUS[o.status]
          const Icoon = s.icoon
          return (
            <li key={o.sleutel}>
              <a
                href={`#${o.sleutel}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  onKies(o.sleutel)
                }}
                className="flex min-h-[44px] items-start gap-2 rounded-lg px-1.5 py-1.5 text-sm leading-snug text-gray-700 transition-colors hover:bg-gray-50 hover:text-primary lg:min-h-[34px]"
              >
                <Icoon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 flex-shrink-0', s.kleur)} />
                <span className="min-w-0 flex-1">
                  {o.titel}
                  <span className="sr-only">, {s.tekst}</span>
                </span>
                {o.telling.totaal > 0 && (
                  <span className="mt-0.5 flex-shrink-0 text-xs tabular-nums text-gray-500">
                    <span aria-hidden="true">
                      {o.telling.afgevinkt}/{o.telling.totaal}
                    </span>
                    <span className="sr-only">
                      , {o.telling.afgevinkt} van {o.telling.totaal}
                    </span>
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
