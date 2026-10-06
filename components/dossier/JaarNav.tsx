'use client'

/**
 * Tabrij van een dossierjaar (ronde 2, onderdeel invulhulp A1 is eigenaar).
 *
 * - Vijf tabs: Invoer en resultaat, Planning, Accountantscheck, Aangifte invullen, Export. Koppelingen staat rechts op
 *   de regel van Alle jaren (het hoort bij het dossier, niet bij het jaar).
 * - Onder `sm` één rij die binnen de nav horizontaal scrolt (scroll-snap, zachte vervaging rechts zolang er meer is),
 *   met korte labels; de pagina zelf scrolt nooit horizontaal. De actieve tab staat bij het laden in beeld.
 * - Badges (`laadJaarPagina` rekent ze, lib/dossier/jaar-tabs.ts): naast het label, met een tekst voor schermlezers;
 *   geen badge op de actieve tab.
 * - Knop terug na springen naar een veld ("Terug naar Aangifte invullen"); met niet-opgeslagen invoer in de editor heet
 *   hij "Opslaan en terug naar …" en slaat hij eerst op.
 * - Vóór elke navigatie vanuit de nav: `flush()` van de aangiftestaat als de pagina er een heeft, zodat een vinkje dat
 *   net is gezet niet verloren gaat. Met niet-opgeslagen invoer verschijnt in de pagina (geen modaal venster) de keuze
 *   Opslaan en verder, Toch weggaan of Blijven.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { ChevronLeft, Link2, TriangleAlert } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { JAAR_TAB_LABEL, JAAR_TABS, jaarTabHref, type JaarBadges, type JaarTab, type JaarTerug } from '@/lib/dossier/jaar-tabs'
import { useOnopgeslagen } from './onopgeslagen'
import { useAangifteStaatOptioneel } from './useAangifteStaat'

export type { JaarTab } from '@/lib/dossier/jaar-tabs'

/** Tabs in de rij, in de volgorde van het werk. */
const TABS: readonly JaarTab[] = JAAR_TABS

/** Korte labels onder `sm`, zodat vijf tabs in één rij passen. */
const KORT: Record<JaarTab, string> = {
  invoer: 'Invoer',
  planning: 'Planning',
  accountant: 'Accountant',
  aangifte: 'Aangifte',
  export: 'Export',
}

export interface JaarNavProps {
  jaar: number
  actief: JaarTab
  /** Badge per tab (aantal open fouten bij Invoer, voortgang bij Aangifte); de actieve tab krijgt er geen. */
  badges?: JaarBadges
  /** Na springen naar een veld: knop terug naar de tab waar je vandaan kwam. */
  terug?: JaarTerug
}

/** Wat er in de pagina staat als navigeren even moet wachten. */
type Melding = { soort: 'invoer'; href: string } | { soort: 'staat'; href: string } | { soort: 'bezig'; href: string }

/** De knop "Bekijk wat er niet klopt" na een mislukte opslag. */
const MISLUKT_KNOP_ID = 'jaarnav-opslaan-mislukt'

const nieuwVenster = (e: MouseEvent) => e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey

export function JaarNav({ jaar, actief, badges, terug }: JaarNavProps) {
  const router = useRouter()
  const onopgeslagen = useOnopgeslagen()
  const staat = useAangifteStaatOptioneel()
  const [melding, setMelding] = useState<Melding | null>(null)
  const [opslaanMislukt, setOpslaanMislukt] = useState(false)
  const rij = useRef<HTMLDivElement>(null)
  const actieveTab = useRef<HTMLAnchorElement>(null)
  const meldingVak = useRef<HTMLDivElement>(null)
  const [meerRechts, setMeerRechts] = useState(false)
  const gewijzigd = Boolean(onopgeslagen?.gewijzigd)

  // De actieve tab bij het laden in beeld (alleen de rij scrollt, de pagina niet). Opnieuw zodra het lettertype er is,
  // want daarmee worden de tabs breder.
  useEffect(() => {
    const r = rij.current
    let weg = false
    const inBeeld = () => {
      const a = actieveTab.current
      if (weg || !r || !a || r.scrollWidth <= r.clientWidth) return
      // Helemaal in beeld, ook naast de vervaging rechts (48 px). Scrollen naar het begin van de tab (een snap-punt),
      // anders schiet scroll-snap terug naar het begin van de rij.
      const rr = r.getBoundingClientRect()
      const ar = a.getBoundingClientRect()
      if (ar.right > rr.right - 48 || ar.left < rr.left + 16) r.scrollLeft += ar.left - (rr.left + 16)
    }
    const meer = () => {
      if (weg || !r) return
      setMeerRechts(r.scrollLeft + r.clientWidth < r.scrollWidth - 2)
    }
    inBeeld()
    meer()
    void document.fonts?.ready.then(() => {
      inBeeld()
      meer()
    })
    r?.addEventListener('scroll', meer, { passive: true })
    window.addEventListener('resize', meer)
    return () => {
      weg = true
      r?.removeEventListener('scroll', meer)
      window.removeEventListener('resize', meer)
    }
  }, [])

  useEffect(() => {
    if (melding && melding.soort !== 'bezig') meldingVak.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [melding])

  // Een melding hoort bij de wijzigingen van nu; zijn ze opgeslagen, dan is de melding over invoer niet meer nodig.
  useEffect(() => {
    if (!gewijzigd && melding?.soort === 'invoer') setMelding(null)
    // Is alles toch opgeslagen (met de knop Opslaan van de editor), dan hoort ook de melding over het mislukken weg.
    if (!gewijzigd) setOpslaanMislukt(false)
  }, [gewijzigd, melding])

  /** Verstuurt wat in de aangiftestaat wacht en navigeert; lukt opslaan niet, dan de keuze in de pagina. */
  async function gaNaar(href: string) {
    if (staat) {
      setMelding({ soort: 'bezig', href })
      const ok = await staat.flush()
      if (!ok) {
        setMelding({ soort: 'staat', href })
        return
      }
    }
    setMelding(null)
    router.push(href)
  }

  function klik(e: MouseEvent<HTMLAnchorElement>, href: string) {
    if (nieuwVenster(e)) return
    e.preventDefault()
    setOpslaanMislukt(false)
    if (gewijzigd) {
      setMelding({ soort: 'invoer', href })
      return
    }
    void gaNaar(href)
  }

  async function opslaanEnVerder(href: string) {
    if (!onopgeslagen) return void gaNaar(href)
    setOpslaanMislukt(false)
    const ok = await onopgeslagen.bewaar()
    if (ok) await gaNaar(href)
    else {
      setOpslaanMislukt(true)
      // De melding van de editor kan ver onder de tabrij staan (op mobiel buiten beeld): eerst hier een regel met een
      // knop erheen, en de focus op die knop.
      window.setTimeout(() => document.getElementById(MISLUKT_KNOP_ID)?.focus(), 0)
    }
  }

  /** Naar de melding van de editor: scrollen en de focus erop. */
  function naarFout() {
    const el = document.getElementById(onopgeslagen?.foutId ?? 'opslaan-fout')
    if (!el) return
    const rustig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  const terugHref = terug && terug.tab !== actief ? jaarTabHref(jaar, terug.tab) : null

  return (
    <div className="mb-6 print:hidden">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          href="/dossier/"
          onClick={(e) => klik(e, '/dossier/')}
          className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-600 transition-colors hover:text-primary"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Alle jaren
        </Link>
        {terug &&
          terugHref &&
          (gewijzigd ? (
            <button
              type="button"
              onClick={() => void opslaanEnVerder(terugHref)}
              className="inline-flex min-h-[44px] items-center gap-1 text-left text-sm font-medium text-primary transition-colors hover:text-primary-dark"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
              Opslaan en terug naar {terug.label}
            </button>
          ) : (
            <Link
              href={terugHref}
              onClick={(e) => klik(e, terugHref)}
              className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-dark"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Terug naar {terug.label}
            </Link>
          ))}
        <Link
          href="/dossier/koppelingen/"
          onClick={(e) => klik(e, '/dossier/koppelingen/')}
          className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 text-sm text-gray-600 transition-colors hover:text-primary"
        >
          <Link2 aria-hidden="true" className="h-4 w-4" />
          Koppelingen
        </Link>
      </div>
      <div className="relative">
        <div
          ref={rij}
          className="relative -mx-4 overflow-x-auto px-4 [scroll-padding-inline:1rem] [scroll-snap-type:x_proximity] [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <nav aria-label={`Onderdelen van ${jaar}`} className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {TABS.map((id) => {
              const isActief = id === actief
              const badge = isActief ? undefined : badges?.[id]
              const href = jaarTabHref(jaar, id)
              return (
                <Link
                  key={id}
                  ref={isActief ? actieveTab : undefined}
                  href={href}
                  onClick={(e) => klik(e, href)}
                  aria-current={isActief ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-[44px] flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm font-medium transition-colors [scroll-snap-align:start] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    isActief ? 'border-primary bg-primary text-white hover:bg-primary-dark' : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary',
                  )}
                >
                  <span className="sm:hidden">{KORT[id]}</span>
                  <span className="hidden sm:inline">{JAAR_TAB_LABEL[id]}</span>
                  {badge && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-700">
                      <span aria-hidden="true">{badge.tekst}</span>
                      <span className="sr-only">{`, ${badge.srTekst}`}</span>
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
        {meerRechts && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 -right-4 w-10 bg-gradient-to-l from-bg-warm to-transparent sm:hidden" />}
      </div>
      {opslaanMislukt && melding?.soort !== 'invoer' && (
        <div role="alert" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <span>Opslaan lukte niet, omdat een paar gegevens nog niet kloppen. Je bent daarom nog op deze pagina.</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button id={MISLUKT_KNOP_ID} grootte="sm" onClick={naarFout}>
              Bekijk wat er niet klopt
            </Button>
            <Button variant="kaal" grootte="sm" onClick={() => setOpslaanMislukt(false)}>
              Sluiten
            </Button>
          </div>
        </div>
      )}
      {melding?.soort === 'invoer' && (
        <div ref={meldingVak} role="alert" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <span>
              Je hebt wijzigingen die nog niet zijn opgeslagen.
              {opslaanMislukt && ' Opslaan lukte niet, omdat een paar gegevens nog niet kloppen.'}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {opslaanMislukt && (
              <Button id={MISLUKT_KNOP_ID} grootte="sm" onClick={naarFout}>
                Bekijk wat er niet klopt
              </Button>
            )}
            <Button grootte="sm" variant={opslaanMislukt ? 'secundair' : 'primair'} onClick={() => void opslaanEnVerder(melding.href)}>
              {opslaanMislukt ? 'Opnieuw opslaan' : 'Opslaan en verder'}
            </Button>
            <Button variant="secundair" grootte="sm" onClick={() => void gaNaar(melding.href)}>
              Toch weggaan
            </Button>
            <Button variant="kaal" grootte="sm" onClick={() => setMelding(null)}>
              Blijven
            </Button>
          </div>
        </div>
      )}
      {melding?.soort === 'staat' && (
        <div ref={meldingVak} role="alert" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <span>Je laatste vinkjes zijn nog niet opgeslagen. Ga je nu weg, dan probeert de tool het nog één keer op de achtergrond.</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button grootte="sm" onClick={() => void gaNaar(melding.href)}>
              Opnieuw proberen
            </Button>
            <Button
              variant="secundair"
              grootte="sm"
              onClick={() => {
                setMelding(null)
                router.push(melding.href)
              }}
            >
              Toch weggaan
            </Button>
            <Button variant="kaal" grootte="sm" onClick={() => setMelding(null)}>
              Blijven
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
