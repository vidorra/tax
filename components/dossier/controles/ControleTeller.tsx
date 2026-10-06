'use client'

/**
 * Ronde 2 (A3): de teller Controles in de jaarbalk, als knop naar het blok Controles (ux-ronde2.md 4.2).
 * Rustig (concept zonder `controles.streng`): grijs "3 controles" of "Nog niets te controleren". Streng:
 * "✕ 2 fouten · ! 3 let op" of "✓ Controles in orde".
 */
import { Check, ListChecks } from 'lucide-react'
import type { ControleTelling } from '@/lib/controles/types'
import { cn } from '@/components/ui'
import { NiveauIcoon, aantalTekst, controlesTekst } from './niveau'

export interface ControleTellerProps {
  telling: ControleTelling
  streng: boolean
  onKlik: () => void
  className?: string
}

/** Tekst van de teller voor schermlezers en tests. */
export function tellerTekst(t: ControleTelling, streng: boolean): string {
  const open = t.fouten + t.letOp + t.info
  if (!streng) return open === 0 ? 'Nog niets te controleren' : controlesTekst(open)
  if (t.fouten === 0 && t.letOp === 0) return 'Controles in orde'
  return [t.fouten > 0 ? aantalTekst('fout', t.fouten) : null, t.letOp > 0 ? aantalTekst('let-op', t.letOp) : null].filter(Boolean).join(' · ')
}

export function ControleTeller({ telling: t, streng, onKlik, className }: ControleTellerProps) {
  const tekst = tellerTekst(t, streng)
  const inOrde = streng && t.fouten === 0 && t.letOp === 0
  return (
    <button
      type="button"
      onClick={onKlik}
      aria-controls="controles"
      className={cn(
        'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        streng && t.fouten > 0 ? 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100' : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary',
        className,
      )}
    >
      <span className="sr-only">Controles: </span>
      {!streng && <ListChecks aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-gray-500" />}
      {inOrde && <Check aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-primary" />}
      {streng && !inOrde ? (
        <span className="flex flex-wrap items-center gap-x-1.5">
          {t.fouten > 0 && (
            <span className="inline-flex items-center gap-1 font-medium">
              <NiveauIcoon ernst="fout" />
              {aantalTekst('fout', t.fouten)}
            </span>
          )}
          {t.fouten > 0 && t.letOp > 0 && <span aria-hidden="true">·</span>}
          {t.letOp > 0 && (
            <span className="inline-flex items-center gap-1">
              <NiveauIcoon ernst="let-op" />
              {aantalTekst('let-op', t.letOp)}
            </span>
          )}
        </span>
      ) : (
        <span>{tekst}</span>
      )}
      <span className="sr-only">. Bekijk de controles.</span>
    </button>
  )
}
