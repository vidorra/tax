'use client'

/**
 * Ronde 2 (A3): het zoekveld boven de eerste sectie op Invoer (ux-ronde2.md 8.7 en 8.8).
 *
 * ARIA-combobox met een listbox (`aria-activedescendant`): pijltjes kiezen, Enter springt, Escape sluit. De lijst staat
 * onder het veld in de pagina (geen zwevend venster), op mobiel over de volle breedte. Een veld of een actieve regeling
 * springt naar het veld; een regeling die nog niet is toegevoegd, opent de kiezer "Bijzondere situatie toevoegen" met de
 * focus op de optie (er wordt nooit ongevraagd iets toegevoegd). "Alle regelingen bekijken" klapt de catalogus uit.
 *
 * Gevoed door VELDREGISTER en REGELINGEN (lib/dossier/veldregister): in een worktree alleen de eigen velden, na de
 * integratie die van alle onderdelen.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { REGELINGEN, VELDREGISTER } from '@/lib/dossier/veldregister'
import type { RegelingItem, VeldregisterItem } from '@/lib/dossier/veldregister/types'
import { zoek, type CatalogusRegeling, type ZoekResultaat } from '@/lib/dossier/zoeken'
import type { VeldId } from '@/lib/dossier/veld'
import { INVOER_KLASSE, cn, kondigAan } from '@/components/ui'
import { RegelingCatalogus } from './RegelingCatalogus'

export interface RegelingZoekerProps {
  invoer: HuishoudenInvoer
  /** Naar een veld springen (useSpringNaar). */
  onSpring: (veld: VeldId) => void
  /** De kiezer met dit id openen met de focus op de optie `regeling`. */
  onKiezer: (elementId: string, regeling: string) => void
  velden?: readonly VeldregisterItem[]
  regelingen?: readonly RegelingItem[]
  className?: string
}

type Optie = { soort: 'resultaat'; r: ZoekResultaat } | { soort: 'catalogus' }

export function RegelingZoeker({ invoer, onSpring, onKiezer, velden = VELDREGISTER, regelingen = REGELINGEN, className }: RegelingZoekerProps) {
  const basis = useId().replace(/:/g, '')
  const invoerId = `${basis}-zoek`
  const lijstId = `${basis}-lijst`
  const catalogusId = `${basis}-catalogus`
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [actief, setActief] = useState(-1)
  const [catalogusOpen, setCatalogusOpen] = useState(false)
  const veld = useRef<HTMLInputElement>(null)

  const resultaten = useMemo(() => (term.trim().length >= 2 ? zoek(term, velden, regelingen, invoer) : []), [term, velden, regelingen, invoer])
  const metCatalogus = regelingen.length > 0
  const opties: Optie[] = useMemo(() => (resultaten.length === 0 ? [] : [...resultaten.map((r) => ({ soort: 'resultaat' as const, r })), ...(metCatalogus ? [{ soort: 'catalogus' as const }] : [])]), [resultaten, metCatalogus])
  const zoekt = term.trim().length >= 2
  const toonLijst = open && zoekt

  // Het aantal resultaten één keer melden als het typen even stilvalt.
  useEffect(() => {
    if (!toonLijst) return
    const t = window.setTimeout(() => kondigAan(resultaten.length === 0 ? `Niets gevonden voor "${term.trim()}".` : `${resultaten.length} ${resultaten.length === 1 ? 'resultaat' : 'resultaten'}.`), 500)
    return () => window.clearTimeout(t)
  }, [toonLijst, resultaten.length, term])

  const optieId = (i: number) => `${basis}-optie-${i}`

  function kies(o: Optie | undefined) {
    if (!o) return
    if (o.soort === 'catalogus') {
      setOpen(false)
      setCatalogusOpen(true)
      return
    }
    const r = o.r
    setOpen(false)
    setActief(-1)
    if (r.soort === 'veld' || (r.soort === 'regeling' && r.actief)) onSpring(r.veld)
    else onKiezer(r.elementId, r.regeling)
  }

  function gaNaar(c: CatalogusRegeling) {
    if (!c.doel) return
    if (c.doel.soort === 'veld') onSpring(c.doel.veld)
    else onKiezer(c.doel.elementId, c.id)
  }

  return (
    <div
      className={cn('w-full max-w-xl', className)}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
        setOpen(false)
      }}
    >
      <label htmlFor={invoerId} className="sr-only">
        Zoek een onderdeel of regeling
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          ref={veld}
          id={invoerId}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={toonLijst}
          aria-controls={lijstId}
          aria-autocomplete="list"
          aria-activedescendant={toonLijst && actief >= 0 && actief < opties.length ? optieId(actief) : undefined}
          placeholder="Zoek een onderdeel of regeling, bijvoorbeeld herinvesteringsreserve"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setOpen(true)
            setActief(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (!zoekt || opties.length === 0) return
              setOpen(true)
              const stap = e.key === 'ArrowDown' ? 1 : -1
              setActief((a) => (a < 0 ? (stap > 0 ? 0 : opties.length - 1) : (a + stap + opties.length) % opties.length))
            } else if (e.key === 'Enter') {
              if (!toonLijst) return
              e.preventDefault()
              kies(opties[actief >= 0 ? actief : 0])
            } else if (e.key === 'Escape') {
              if (toonLijst) {
                e.preventDefault()
                setOpen(false)
                setActief(-1)
              } else if (term) {
                e.preventDefault()
                setTerm('')
              }
            }
          }}
          className={cn(INVOER_KLASSE, 'border-gray-200 pl-10 pr-3.5 hover:border-gray-300')}
        />
      </div>
      <ul id={lijstId} role="listbox" aria-label="Gevonden onderdelen en regelingen" hidden={!toonLijst || opties.length === 0} className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {opties.map((o, i) => {
          const isActief = i === actief
          return (
            <li
              key={o.soort === 'catalogus' ? 'catalogus' : o.r.sleutel}
              id={optieId(i)}
              role="option"
              aria-selected={isActief}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => kies(o)}
              onMouseMove={() => setActief(i)}
              className={cn(
                'flex min-h-[44px] cursor-pointer flex-col justify-center px-4 py-2 text-sm transition-colors',
                o.soort === 'catalogus' && 'border-t border-gray-100 font-medium text-primary',
                isActief ? 'bg-primary/10' : 'hover:bg-gray-50',
              )}
            >
              {o.soort === 'catalogus' ? (
                'Alle regelingen bekijken'
              ) : (
                <>
                  <span className="font-medium text-gray-900">{o.r.label}</span>
                  {o.r.waar && <span className="text-xs text-gray-600">{o.r.waar}</span>}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {toonLijst && resultaten.length === 0 && (
        <p className="mt-2 text-sm text-gray-600">
          Niets gevonden voor &quot;{term.trim()}&quot;.
          {metCatalogus && (
            <>
              {' '}
              <button type="button" onClick={() => setCatalogusOpen(true)} className="rounded font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                Bekijk alle regelingen
              </button>
              .
            </>
          )}
        </p>
      )}
      {catalogusOpen && (
        <RegelingCatalogus
          id={catalogusId}
          regelingen={regelingen}
          invoer={invoer}
          onGa={(c) => {
            setCatalogusOpen(false)
            gaNaar(c)
          }}
          onSluit={() => {
            setCatalogusOpen(false)
            veld.current?.focus()
          }}
        />
      )}
    </div>
  )
}
