'use client'

/**
 * Ronde 2 (A3): het blok Controles (ux-ronde2.md 4.2 tot en met 4.8), in drie varianten.
 *
 * - `paneel` (uitkomstpaneel op Invoer): rustig een ingeklapte kop "Controles · 3" in grijs; openklappen maakt het jaar
 *   streng (`onOpen`). Streng: filterchips per niveau, fouten uitgeklapt (hooguit drie, dan "Alle controles ({n})"),
 *   let op, info en genegeerd ingeklapt.
 * - `poort` (bovenaan Export): met open fouten een rood kader "✕ 2 fouten staan nog open" met uitleg over CONCEPT (of,
 *   bij Ingediend, over de kopregel in de verantwoording), de fouten en de let op ingeklapt; zonder fouten één grijze
 *   regel.
 * - `compact`: alleen de lijst van fouten en let op, zonder kop (voor de invulhulp na de integratie).
 *
 * Opent ook op OPEN_VERZOEK (de teller in de jaarbalk en de mobiele foutknop sturen dat).
 */
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Controle, ControleErnst, ControleUitkomst } from '@/lib/controles/types'
import { openPerErnst } from '@/lib/controles'
import { Disclosure, cn, kondigAan } from '@/components/ui'
import { OPEN_VERZOEK_UITKLAP } from '@/components/ui/Disclosure'
import { AangifteStaatStatus } from '../AangifteStaatStatus'
import type { UseAangifteStaat } from '../useAangifteStaat'
import { ControleFocusTerug, ControleItem, type ControleActies } from './ControleItem'
import { NIVEAU, NiveauIcoon, controlesTekst } from './niveau'

export const CONTROLES_ID = 'controles'
const MAX_FOUTEN = 3

export interface ControlePaneelProps {
  uitkomst: ControleUitkomst
  streng: boolean
  variant?: 'paneel' | 'poort' | 'compact'
  acties: ControleActies
  staat: UseAangifteStaat | null
  /** Rustig paneel opengeklapt: het jaar wordt streng (`controles-streng` met `door: 'paneel'`). */
  onOpen?: () => void
  /** Nieuw, leeg jaar: "Vul eerst je gegevens in. De controles verschijnen vanzelf." */
  leeg?: boolean
  /** Status Ingediend (poort: geen CONCEPT, wel de kopregel in de verantwoording). */
  ingediend?: boolean
  /** Voor de link "bekijk ze bij de invoer" in de poort. */
  jaar?: number
  id?: string
}

function Lijst({ controles, props, weerOpen, mislukt, onOpgeslagen, kop }: { controles: Controle[]; props: ControlePaneelProps; weerOpen: Set<string>; mislukt: Set<string>; onOpgeslagen: (id: string, ok: boolean) => void; kop: 'h3' | 'h4' }) {
  return (
    <ul className="divide-y divide-gray-100">
      {controles.map((c) => (
        <ControleItem key={c.id} controle={c} acties={props.acties} staat={props.staat} weerOpen={weerOpen.has(c.id)} nietOpgeslagen={mislukt.has(c.id)} onOpgeslagen={onOpgeslagen} kop={kop} />
      ))}
    </ul>
  )
}

/**
 * Welke negeringen niet opgeslagen zijn, en of de gebruiker hier iets negeerde of terugzette (dan pas toont het paneel
 * de opslagstatus; het vastleggen van `controles.streng` is geen handeling van de gebruiker).
 */
function useMislukt(): [Set<string>, (id: string, ok: boolean) => void, boolean] {
  const [mislukt, setMislukt] = useState<Set<string>>(new Set())
  const [gedaan, setGedaan] = useState(false)
  const zet = (id: string, ok: boolean) => {
    setGedaan(true)
    setMislukt((vorig) => {
      if (ok === !vorig.has(id)) return vorig
      const nieuw = new Set(vorig)
      if (ok) nieuw.delete(id)
      else nieuw.add(id)
      return nieuw
    })
  }
  return [mislukt, zet, gedaan]
}

/** Opslagstatus van de aangiftestaat: na een eigen negering, of als laden of opslaan misging. */
function PaneelStatus({ staat, gedaan, className }: { staat: UseAangifteStaat | null; gedaan: boolean; className?: string }) {
  if (!staat) return null
  const probleem = staat.laden === 'fout' || staat.opslag === 'mislukt' || Boolean(staat.fout)
  if (!gedaan && !probleem) return null
  return <AangifteStaatStatus staat={staat} altijd className={className} />
}

function Genegeerd({ props, mislukt, onOpgeslagen }: { props: ControlePaneelProps; mislukt: Set<string>; onOpgeslagen: (id: string, ok: boolean) => void }) {
  const lijst = props.uitkomst.genegeerd
  const [open, setOpen] = useState(false)
  const metFout = lijst.some((g) => mislukt.has(g.controle.id))
  if (lijst.length === 0) return null
  return (
    <Disclosure variant="kaal" as="h4" titel={`Genegeerd (${lijst.length})`} open={open || metFout} onOpenChange={setOpen}>
      <ul className="divide-y divide-gray-100">
        {lijst.map(({ controle, negering }) => (
          <ControleItem key={controle.id} controle={controle} negering={negering} acties={props.acties} staat={props.staat} nietOpgeslagen={mislukt.has(controle.id)} onOpgeslagen={onOpgeslagen} kop="h4" />
        ))}
      </ul>
    </Disclosure>
  )
}

function Paneel(props: ControlePaneelProps) {
  const { uitkomst: u, streng } = props
  const id = props.id ?? CONTROLES_ID
  const kopId = `${id}-titel`
  const inhoudId = `${id}-inhoud`
  const [uitgeklapt, setUitgeklapt] = useState(false)
  const [filter, setFilter] = useState<ControleErnst | null>(null)
  const [alles, setAlles] = useState(false)
  const [mislukt, opgeslagen, gedaan] = useMislukt()
  const wortel = useRef<HTMLElement>(null)
  const actueel = useRef(props.onOpen)
  actueel.current = props.onOpen

  useEffect(() => {
    const el = wortel.current
    if (!el) return
    const open = () => {
      setUitgeklapt(true)
      actueel.current?.()
    }
    el.addEventListener(OPEN_VERZOEK_UITKLAP, open)
    return () => el.removeEventListener(OPEN_VERZOEK_UITKLAP, open)
  }, [])

  const per = openPerErnst(u)
  const weerOpen = new Set(u.weerOpen.map((c) => c.id))
  const totaal = u.open.length
  const zichtbaar = streng || uitgeklapt

  if (!zichtbaar) {
    return (
      <section ref={wortel} id={id} aria-labelledby={kopId} className="scroll-mt-24 border-t border-gray-100 pt-4">
        <h3 id={kopId} className="m-0">
          <button
            type="button"
            aria-expanded={false}
            aria-controls={inhoudId}
            onClick={() => {
              setUitgeklapt(true)
              props.onOpen?.()
            }}
            className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg text-left text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span>
              <span className="font-medium text-gray-900">Controles</span>
              <span className="text-gray-500">
                {' · '}
                {totaal === 0 ? 'nog niets te controleren' : totaal}
                {totaal > 0 && <span className="sr-only"> open</span>}
              </span>
            </span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-gray-500" />
          </button>
        </h3>
        <div id={inhoudId} hidden />
      </section>
    )
  }

  const chips = (['fout', 'let-op', 'info'] as const).filter((e) => per[e].length > 0)
  function kiesFilter(e: ControleErnst) {
    const nieuw = filter === e ? null : e
    setFilter(nieuw)
    const n = nieuw ? per[nieuw].length : totaal
    kondigAan(`${controlesTekst(n)} getoond.`)
  }
  const lijstProps = { props, weerOpen, mislukt, onOpgeslagen: opgeslagen, kop: 'h4' as const }
  const fouten = alles ? per.fout : per.fout.slice(0, MAX_FOUTEN)

  return (
    <ControleFocusTerug.Provider value={kopId}>
      <section ref={wortel} id={id} aria-labelledby={kopId} tabIndex={-1} className="scroll-mt-24 space-y-3 border-t border-gray-100 pt-4 focus-visible:outline-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={kopId} tabIndex={-1} className="rounded text-sm font-medium text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Controles
          </h3>
          {chips.length > 1 && (
            <div role="group" aria-label="Toon alleen" className="flex flex-wrap gap-1.5">
              {chips.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={filter === e}
                  onClick={() => kiesFilter(e)}
                  className={cn(
                    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    filter === e ? 'border-primary bg-primary text-white hover:bg-primary-dark' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-primary hover:text-primary-dark',
                  )}
                >
                  <NiveauIcoon ernst={e} className={cn('h-3.5 w-3.5', filter === e && '!text-white')} />
                  {per[e].length}
                  <span className="sr-only">{` ${per[e].length === 1 ? NIVEAU[e].enkel : NIVEAU[e].meer}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {u.zonderBerekening && <p className="text-sm text-gray-600">De controles kunnen niet allemaal worden uitgevoerd, omdat de berekening niet lukt. Controleer je invoer.</p>}

        {totaal === 0 ? (
          <p className="flex items-start gap-2 text-sm text-gray-600">
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            {props.leeg ? 'Vul eerst je gegevens in. De controles verschijnen vanzelf.' : 'Geen open controles. De tool controleert wat hij kan nakijken; de vooraf ingevulde gegevens kijk je zelf na.'}
          </p>
        ) : filter ? (
          <Lijst controles={per[filter]} {...lijstProps} />
        ) : (
          <>
            {fouten.length > 0 && <Lijst controles={fouten} {...lijstProps} />}
            {!alles && per.fout.length > MAX_FOUTEN && (
              <button type="button" onClick={() => setAlles(true)} className="min-h-[44px] text-sm font-medium text-primary transition-colors hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                Alle controles ({totaal})
              </button>
            )}
            {alles ? (
              <>
                {per['let-op'].length > 0 && <Lijst controles={per['let-op']} {...lijstProps} />}
                {per.info.length > 0 && <Lijst controles={per.info} {...lijstProps} />}
              </>
            ) : (
              <div className="space-y-1">
                {per['let-op'].length > 0 && (
                  <Disclosure variant="kaal" as="h4" titel={`Let op (${per['let-op'].length})`}>
                    <Lijst controles={per['let-op']} {...lijstProps} />
                  </Disclosure>
                )}
                {per.info.length > 0 && (
                  <Disclosure variant="kaal" as="h4" titel={`Info (${per.info.length})`}>
                    <Lijst controles={per.info} {...lijstProps} />
                  </Disclosure>
                )}
              </div>
            )}
          </>
        )}
        <Genegeerd props={props} mislukt={mislukt} onOpgeslagen={opgeslagen} />
        <PaneelStatus staat={props.staat} gedaan={gedaan} />
      </section>
    </ControleFocusTerug.Provider>
  )
}

function Poort(props: ControlePaneelProps) {
  const { uitkomst: u } = props
  const per = openPerErnst(u)
  const [mislukt, opgeslagen, gedaan] = useMislukt()
  const kopId = `${useId().replace(/:/g, '')}-poort`
  const weerOpen = new Set(u.weerOpen.map((c) => c.id))
  const n = per.fout.length
  const letOp = per['let-op'].length

  if (n === 0) {
    return (
      <p id={kopId} tabIndex={-1} className="flex items-start gap-2 rounded text-sm text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <span>
          Geen open fouten.
          {letOp > 0 && (
            <>
              {' '}
              {letOp === 1 ? 'Eén aandachtspunt' : `${letOp} aandachtspunten`}, bekijk {letOp === 1 ? 'het' : 'ze'} bij de{' '}
              <Link href={props.jaar ? `/dossier/${props.jaar}/` : '/dossier/'} className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline">
                invoer
              </Link>
              .
            </>
          )}
        </span>
      </p>
    )
  }

  return (
    <ControleFocusTerug.Provider value={kopId}>
      <section aria-labelledby={kopId} className="rounded-2xl border border-red-200 bg-red-50/60 p-5 sm:p-6">
        <h2 id={kopId} tabIndex={-1} className="flex items-center gap-2 rounded text-base font-medium text-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <NiveauIcoon ernst="fout" className="h-5 w-5" />
          <span className="sr-only">Fout: </span>
          {n === 1 ? '1 fout staat nog open' : `${n} fouten staan nog open`}
        </h2>
        <p className="mt-1 text-sm text-gray-800">
          {props.ingediend
            ? `Dit jaar staat op Ingediend. Het rapport krijgt geen CONCEPT; in de verantwoording staat dat er nog ${controlesTekst(n)} ${n === 1 ? 'openstaat' : 'openstaan'}.`
            : `Het fiscaal rapport krijgt het woord CONCEPT zolang ${n === 1 ? 'deze fout openstaat' : 'deze fouten openstaan'}. Los ${n === 1 ? 'hem' : 'ze'} op of negeer ${n === 1 ? 'hem' : 'ze'} bewust met een reden.`}
        </p>
        <div className="mt-4 rounded-xl border border-red-100 bg-white px-4 py-3">
          <Lijst controles={per.fout} props={props} weerOpen={weerOpen} mislukt={mislukt} onOpgeslagen={opgeslagen} kop="h3" />
        </div>
        {letOp > 0 && (
          <Disclosure variant="kaal" as="h3" className="mt-2" titel={`Let op (${letOp})`}>
            <Lijst controles={per['let-op']} props={props} weerOpen={weerOpen} mislukt={mislukt} onOpgeslagen={opgeslagen} kop="h3" />
          </Disclosure>
        )}
        <PaneelStatus staat={props.staat} gedaan={gedaan} className="mt-2" />
      </section>
    </ControleFocusTerug.Provider>
  )
}

function Compact(props: ControlePaneelProps) {
  const per = openPerErnst(props.uitkomst)
  const [mislukt, opgeslagen] = useMislukt()
  const terugId = `${useId().replace(/:/g, '')}-controles`
  const weerOpen = new Set(props.uitkomst.weerOpen.map((c) => c.id))
  const lijst = [...per.fout, ...per['let-op']]
  if (lijst.length === 0)
    return (
      <p id={terugId} tabIndex={-1} className="rounded text-sm text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        Geen open fouten of aandachtspunten.
      </p>
    )
  return (
    <ControleFocusTerug.Provider value={terugId}>
      <div id={terugId} tabIndex={-1} className="focus:outline-none">
        <Lijst controles={lijst} props={props} weerOpen={weerOpen} mislukt={mislukt} onOpgeslagen={opgeslagen} kop="h4" />
      </div>
    </ControleFocusTerug.Provider>
  )
}

export function ControlePaneel(props: ControlePaneelProps) {
  if (props.variant === 'poort') return <Poort {...props} />
  if (props.variant === 'compact') return <Compact {...props} />
  return <Paneel {...props} />
}
