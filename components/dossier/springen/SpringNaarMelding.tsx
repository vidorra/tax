'use client'

/**
 * Ronde 2 (A3): zichtbare melding na een sprong die niet bij het veld uitkwam ("Dit veld bestaat niet meer. Je staat nu
 * bij Ondernemingen."). Onderin het scherm, boven de mobiele balk; verdwijnt na acht seconden of met Sluiten. De tekst
 * gaat ook naar het gedeelde live-gebied (useSpringNaar), dus deze melding zelf is niet live.
 */
import { useEffect } from 'react'
import { Info, X } from 'lucide-react'
import type { SpringMelding } from './useSpringNaar'

export function SpringNaarMelding({ melding, onSluit }: { melding: SpringMelding | null; onSluit: () => void }) {
  useEffect(() => {
    if (!melding) return
    const t = window.setTimeout(onSluit, 8000)
    return () => window.clearTimeout(t)
  }, [melding, onSluit])
  if (!melding) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-32 z-40 flex justify-center px-4 lg:bottom-6">
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 pl-4 text-sm text-slate-800 shadow-lg">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
        <p className="min-w-0 flex-1">{melding.tekst}</p>
        <button
          type="button"
          onClick={onSluit}
          className="-my-2 -mr-1 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Sluiten</span>
        </button>
      </div>
    </div>
  )
}
