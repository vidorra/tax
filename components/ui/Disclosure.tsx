'use client'

import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * Ronde 2 (A3): DOM-event om een dichte uitklap van buitenaf te openen (springen naar een veld, zoeken). Gelijk aan
 * OPEN_VERZOEK in components/dossier/regelingen/SituatieKiezer.tsx; hier als eigen constante, zodat components/ui niet
 * van components/dossier afhangt. Elke Disclosure draagt `data-uitklap` en opent bij dit event (ook als het van binnenuit
 * opborrelt); een open uitklap blijft open.
 */
export const OPEN_VERZOEK_UITKLAP = 'ib:open'

export interface DisclosureProps {
  titel: ReactNode
  subtitel?: ReactNode
  /** Rechts in de kop, bijvoorbeeld een bedrag of badge. */
  rechts?: ReactNode
  defaultOpen?: boolean
  /** Gecontroleerd gebruik. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: 'kaart' | 'kaal'
  as?: 'h2' | 'h3' | 'h4'
  id?: string
  className?: string
  children?: ReactNode
}

/** Uitklapbaar blok (knop met aria-expanded). */
export function Disclosure({
  titel,
  subtitel,
  rechts,
  defaultOpen = false,
  open: gecontroleerd,
  onOpenChange,
  variant = 'kaart',
  as: Kop = 'h3',
  id,
  className,
  children,
}: DisclosureProps) {
  const [intern, setIntern] = useState(defaultOpen)
  const open = gecontroleerd ?? intern
  const autoId = useId().replace(/:/g, '')
  const basis = id ?? `uitklap-${autoId}`
  const paneelId = `${basis}-paneel`
  const wortel = useRef<HTMLDivElement>(null)
  const actueel = useRef({ open, gecontroleerd, onOpenChange })
  actueel.current = { open, gecontroleerd, onOpenChange }

  // Ronde 2 (A3): openen op verzoek (springen naar een veld in deze uitklap, het zoekveld).
  useEffect(() => {
    const el = wortel.current
    if (!el) return
    const opVerzoek = () => {
      const a = actueel.current
      if (a.open) return
      if (a.gecontroleerd === undefined) setIntern(true)
      a.onOpenChange?.(true)
    }
    el.addEventListener(OPEN_VERZOEK_UITKLAP, opVerzoek)
    return () => el.removeEventListener(OPEN_VERZOEK_UITKLAP, opVerzoek)
  }, [])

  function wissel() {
    const nieuw = !open
    if (gecontroleerd === undefined) setIntern(nieuw)
    onOpenChange?.(nieuw)
  }

  return (
    <div ref={wortel} id={id} data-uitklap="" className={cn(variant === 'kaart' && 'rounded-2xl border border-gray-200 bg-white shadow-sm', className)}>
      <Kop className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={paneelId}
          onClick={wissel}
          className={cn(
            'flex min-h-[44px] w-full items-center justify-between gap-3 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            variant === 'kaart' ? 'rounded-2xl px-5 py-4' : 'rounded-lg py-2',
          )}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">{titel}</span>
            {subtitel && <span className="mt-0.5 block text-xs font-normal text-gray-500">{subtitel}</span>}
          </span>
          <span className="flex flex-shrink-0 items-center gap-2">
            {rechts}
            <ChevronDown aria-hidden="true" className={cn('h-4 w-4 text-gray-500', open && 'rotate-180')} />
          </span>
        </button>
      </Kop>
      <div id={paneelId} hidden={!open} className={variant === 'kaart' ? 'border-t border-gray-100 px-5 pb-5 pt-4' : 'pb-2 pt-1'}>
        {children}
      </div>
    </div>
  )
}
