'use client'

/**
 * Ronde 2 (A1): één rij van de invulhulp. Drie soorten (lib/invulhulp/types.ts `RijSoort`):
 * - Invullen (zelf invullen en keuzevragen): bedrag kopiëren, in de aangifte zetten en het vinkje "Ingevuld" aan.
 * - Controleren (vooraf ingevuld): één klik "Klopt", of "Wijkt af?" met het bedrag van de Belastingdienst en een keuze.
 * - Berekend: "Rekent het programma zelf uit. Ter controle: € …", zonder vinkje.
 *
 * Desktop: [label en herkomst] [bedrag en kopieerknop] [actie]; het vinkje staat rechts aan het eind (kopiëren, plakken
 * in het andere venster, terugkomen, afvinken; kopiëren vinkt niet vanzelf af). Mobiel: label, dan bedrag en acties op
 * één regel, herkomst onder "Details". Velden met kolommen (balans) hebben per kolom een eigen bedrag en kopieerknop.
 *
 * `zonderVia`: elke rij als Invullen, zonder Klopt en Wijkt af (bruikbaar in de planning).
 */
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Check, ChevronDown, TriangleAlert } from 'lucide-react'
import { KopieerKnop, cn, formatEuro } from '@/components/ui'
import type { InvulhulpKolom, InvulhulpVeldStatus, Veld, VeldVoortgang, VerschilKeuze as Keuze } from '@/lib/invulhulp/types'
import { VIA_TOLERANTIE } from '@/lib/invulhulp/types'
import { veldHrefVoor } from '@/lib/invulhulp/waarden'
import { vingerafdrukTekst, viaVerschil } from '@/lib/invulhulp/voortgang'
import { KOLOM_LABEL } from './hulp'
import { VerschilKeuze } from './VerschilKeuze'

export interface AangifteRegelProps {
  jaar: number
  veld: Veld
  /** Titel van de herhalende rubriek (werkgever, rekening), voor de context bij kopiëren en afvinken. */
  rubriekTitel?: string
  /** Kolommen van de rubriek, in de volgorde van het programma. */
  kolommen?: InvulhulpKolom[]
  vg: VeldVoortgang | undefined
  status: InvulhulpVeldStatus
  /** De aangiftestaat is geladen: afvinken en VIA-bedragen worden bewaard. Zonder: alleen kopiëren. */
  bewerkbaar: boolean
  /** Grijs: net afgevinkt terwijl het filter hem anders zou verbergen. */
  gedimd?: boolean
  /** Elke rij als Invullen, zonder Klopt en Wijkt af (planning). */
  zonderVia?: boolean
  /** Heeft dit scherm ook rijen die vooraf zijn ingevuld? Dan staat bij een zelf in te vullen bedrag "Niet vooraf ingevuld". */
  metVooraf?: boolean
  onKlopt: () => void
  onOngedaan: () => void
  onVink: (aan: boolean) => void
  onVia: (bedrag: number | null) => void
  onKeuze: (keuze: Keuze) => void
  onNotitie: (tekst: string) => void
  /** Aanpassen: eerst opslaan (flush), dan naar het veld op Invoer. */
  onAanpassen: (href: string) => void
}

const KEUZE_TEKST: Record<Keuze, string> = {
  'mijn-bedrag': 'je neemt je eigen bedrag over',
  'bedrag-belastingdienst': 'je neemt het bedrag van de Belastingdienst over',
  uitzoeken: 'nog uitzoeken',
}

/** Klik zonder toets: zelf navigeren (na flush); met Ctrl, Cmd of de middelste knop gewoon een nieuw tabblad. */
function eigenKlik(e: MouseEvent<HTMLAnchorElement>, doe: () => void) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  e.preventDefault()
  doe()
}

function Waarde({ veld, wat }: { veld: Veld; wat: string }) {
  const w = veld.waarde
  if (w.soort === 'bedrag') {
    return (
      <>
        <span className="font-medium tabular-nums text-gray-900">{w.bedrag === null ? 'Leeg' : formatEuro(w.bedrag)}</span>
        {w.bedrag !== null && <KopieerKnop bedrag={w.bedrag} context={wat} className="print:hidden" />}
      </>
    )
  }
  if (w.soort === 'antwoord') return <span className="font-medium text-gray-900">{w.antwoord ?? 'Leeg'}</span>
  if (w.soort === 'tekst') {
    return (
      <>
        <span className="min-w-0 break-words text-right font-medium text-gray-900">{w.tekst ?? 'Leeg'}</span>
        {w.tekst && <KopieerKnop tekst={w.tekst} context={wat} compact className="print:hidden" />}
      </>
    )
  }
  return null
}

export function AangifteRegel(props: AangifteRegelProps) {
  const { jaar, veld, rubriekTitel, kolommen, vg, status, bewerkbaar, gedimd, zonderVia, metVooraf } = props
  const basis = useId().replace(/:/g, '')
  const [details, setDetails] = useState(false)
  const [wijktAfOpen, setWijktAfOpen] = useState(false)
  const wat = rubriekTitel && !veld.label.includes(rubriekTitel) ? `${veld.label}, ${rubriekTitel}` : veld.label
  const rij = zonderVia && veld.rij === 'controleren' ? 'invullen' : veld.rij
  const href = veldHrefVoor(jaar, veld)
  const afgevinkt = status === 'afgevinkt'
  const gewijzigd = status === 'gewijzigd'
  const bedragVeld = veld.waarde.soort === 'bedrag'
  const verschil = viaVerschil(veld, vg)
  const viaWijkt = verschil !== null && Math.abs(verschil) > VIA_TOLERANTIE
  // Het paneel Wijkt af? staat open na een klik, en vanzelf zolang er een verschil is dat nog niet is afgevinkt.
  const paneelOpen = rij === 'controleren' && (wijktAfOpen || (viaWijkt && !afgevinkt))
  const paneelId = `${basis}-wijkt-af`
  const detailsId = `${basis}-details`
  const vinkId = `${basis}-vink`
  const kolomWaarden = veld.waarde.soort === 'kolommen' ? veld.waarde.bedragen : null

  // Klopt en Ongedaan vervangen elkaar: zonder hulp valt de focus naar de body (een schermlezer verliest zijn plek).
  // Na Klopt staat de focus op Ongedaan van dezelfde rij, na Ongedaan weer op Klopt.
  const kloptKnop = useRef<HTMLButtonElement>(null)
  const ongedaanKnop = useRef<HTMLButtonElement>(null)
  const focusNa = useRef<'klopt' | 'ongedaan' | null>(null)
  useEffect(() => {
    const doel = focusNa.current === 'ongedaan' ? ongedaanKnop.current : focusNa.current === 'klopt' ? kloptKnop.current : null
    if (!doel) return
    focusNa.current = null
    doel.focus()
  }, [afgevinkt])

  const heeftDetails = Boolean(veld.herkomst || veld.hint || (veld.via && rij === 'controleren'))
  const herkomst = heeftDetails && (
    <>
      {veld.herkomst && (
        <p>
          Uit: {veld.herkomst.label}
          {href && (
            <span className="print:hidden">
              {' · '}
              <a
                href={href}
                onClick={(e) => eigenKlik(e, () => props.onAanpassen(href))}
                className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline"
              >
                Aanpassen<span className="sr-only">: {wat}</span>
              </a>
            </span>
          )}
        </p>
      )}
      {veld.via && rij === 'controleren' && <p>{veld.via.zeker ? `Vooraf ingevuld door ${veld.via.bron}.` : `Misschien vooraf ingevuld door ${veld.via.bron}.`}</p>}
      {veld.hint && <p>{veld.hint}</p>}
    </>
  )

  const actie = (() => {
    if (rij === 'berekend') return null
    if (rij === 'invullen') {
      return (
        <label
          htmlFor={vinkId}
          className={cn('inline-flex min-h-[44px] items-center gap-2 text-sm font-medium', bewerkbaar ? 'cursor-pointer text-gray-800' : 'cursor-not-allowed text-gray-500')}
        >
          <input
            id={vinkId}
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 accent-primary print:hidden"
            checked={afgevinkt}
            disabled={!bewerkbaar}
            onChange={(e) => props.onVink(e.target.checked)}
          />
          <span aria-hidden="true" className="hidden h-4 w-4 border border-gray-500 print:inline-block" />
          Ingevuld<span className="sr-only">: {wat}</span>
        </label>
      )
    }
    if (afgevinkt) {
      return (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span className="hidden min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary lg:inline-flex">
            <Check aria-hidden="true" className="h-4 w-4" />
            Gecontroleerd
          </span>
          <button
            ref={ongedaanKnop}
            type="button"
            onClick={() => {
              setWijktAfOpen(false)
              focusNa.current = 'klopt'
              props.onOngedaan()
            }}
            disabled={!bewerkbaar}
            className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm text-gray-600 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 print:hidden"
          >
            Ongedaan<span className="sr-only">: {wat}</span>
          </button>
        </span>
      )
    }
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1">
        <button
          ref={kloptKnop}
          type="button"
          onClick={() => {
            setWijktAfOpen(false)
            focusNa.current = 'ongedaan'
            props.onKlopt()
          }}
          disabled={!bewerkbaar}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-primary bg-white px-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 print:hidden"
        >
          Klopt<span className="sr-only">: {wat}</span>
        </button>
        <span aria-hidden="true" className="hidden h-4 w-4 border border-gray-500 print:inline-block" />
        {viaWijkt && !afgevinkt ? (
          <span className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-amber-800">Wijkt af</span>
        ) : (
          <button
            type="button"
            aria-expanded={paneelOpen}
            aria-controls={paneelId}
            onClick={() => setWijktAfOpen((o) => !o)}
            disabled={!bewerkbaar}
            className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-medium text-gray-700 underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 print:hidden"
          >
            Wijkt af?<span className="sr-only">: {wat}</span>
          </button>
        )}
      </span>
    )
  })()

  return (
    <div
      id={veld.sleutel}
      tabIndex={-1}
      data-status={status}
      className={cn(
        'scroll-mt-24 border-t border-gray-100 py-3 outline-none first:border-t-0 focus-visible:ring-2 focus-visible:ring-primary/40',
        gedimd && 'opacity-60',
        (gewijzigd || (viaWijkt && !afgevinkt)) && '-mx-3 rounded-xl border-t-0 bg-amber-50/60 px-3 sm:-mx-4 sm:px-4',
      )}
    >
      <div className={cn('flex flex-col gap-1', !kolomWaarden && 'lg:flex-row lg:items-start lg:gap-4')}>
        {/* Label, herkomst en (mobiel) de status. */}
        <div className="min-w-0 lg:flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-snug text-gray-900">
              {veld.label}
              {rubriekTitel && !veld.label.includes(rubriekTitel) && <span className="sr-only">, {rubriekTitel}</span>}
            </p>
            {afgevinkt && rij === 'controleren' && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 text-sm font-medium text-primary lg:hidden">
                <Check aria-hidden="true" className="h-4 w-4" />
                Gecontroleerd
              </span>
            )}
          </div>
          {rij === 'berekend' && (
            <p className="mt-0.5 text-sm text-gray-600">
              Rekent het programma zelf uit. Ter controle:{' '}
              {veld.waarde.soort === 'bedrag' && veld.waarde.bedrag !== null ? formatEuro(veld.waarde.bedrag) : vingerafdrukTekst(veld.waarde, veld.vingerafdruk)}.
            </p>
          )}
          {veld.soort === 'Z' && bedragVeld && metVooraf && !zonderVia && <p className="mt-0.5 text-xs text-gray-500">Niet vooraf ingevuld</p>}
          {herkomst && <div className="mt-1 hidden space-y-1 text-xs leading-relaxed text-gray-500 lg:block print:block">{herkomst}</div>}
        </div>

        {rij !== 'berekend' && !kolomWaarden && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 lg:contents">
            <div className="flex min-h-[44px] min-w-0 items-center gap-2 lg:w-[14rem] lg:flex-none lg:justify-end">
              <Waarde veld={veld} wat={wat} />
            </div>
            <div className="flex min-h-[44px] items-center justify-end lg:w-[14rem] lg:flex-none lg:justify-start">{actie}</div>
          </div>
        )}

        {kolomWaarden && kolommen && (
          <div className="flex flex-col gap-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4">
            {kolommen.map((k) => {
              const b = kolomWaarden[k]
              return (
                <div key={k} className="flex min-h-[44px] items-center justify-between gap-2 lg:w-[9.5rem] lg:justify-end">
                  <span className="text-xs text-gray-500 lg:sr-only">{KOLOM_LABEL[k]}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums text-gray-900 lg:w-[6rem] lg:text-right">{b === null || b === undefined ? 'Leeg' : formatEuro(b)}</span>
                    {b !== null && b !== undefined ? (
                      <KopieerKnop bedrag={b} context={`${KOLOM_LABEL[k]}, ${wat}`} compact className="print:hidden" />
                    ) : (
                      <span aria-hidden="true" className="hidden w-11 lg:block" />
                    )}
                  </span>
                </div>
              )
            })}
            <div className="flex min-h-[44px] items-center justify-end lg:ml-auto lg:w-[14rem] lg:justify-start">{actie}</div>
          </div>
        )}
      </div>

      {herkomst && (
        <div className="lg:hidden print:hidden">
          <button
            type="button"
            aria-expanded={details}
            aria-controls={detailsId}
            onClick={() => setDetails((d) => !d)}
            className="inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-gray-600 transition-colors hover:text-primary"
          >
            <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5', details && 'rotate-180')} />
            Details<span className="sr-only">: {wat}</span>
          </button>
          <div id={detailsId} hidden={!details} className="space-y-1 pb-1 text-xs leading-relaxed text-gray-500">
            {herkomst}
          </div>
        </div>
      )}

      {gewijzigd && (
        <p className="mt-2 flex items-start gap-2 text-sm text-amber-900">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <span>
            {bedragVeld ? 'Bedrag gewijzigd' : 'Gewijzigd'} sinds je dit afvinkte: was {vingerafdrukTekst(veld.waarde, vg?.afgevinkt?.vingerafdruk ?? '')}, nu{' '}
            {vingerafdrukTekst(veld.waarde, veld.vingerafdruk)}. Pas het aan in de aangifte en vink opnieuw af.
          </span>
        </p>
      )}

      {rij === 'controleren' && afgevinkt && viaWijkt && vg?.via !== undefined && vg.via !== null && (
        <p className="mt-1 text-xs text-gray-600">
          Belastingdienst {formatEuro(vg.via)}, verschil {formatEuro(verschil ?? 0, { teken: true })}
          {vg.keuze ? `: ${KEUZE_TEKST[vg.keuze]}.` : '.'}
          {vg.notitie ? ` ${vg.notitie}` : ''}
        </p>
      )}

      {rij === 'controleren' && paneelOpen && bedragVeld && (
        <VerschilKeuze
          id={paneelId}
          dossier={veld.waarde.soort === 'bedrag' ? (veld.waarde.bedrag ?? 0) : 0}
          wat={wat}
          vg={vg}
          afgevinkt={afgevinkt}
          bewerkbaar={bewerkbaar}
          aanpassenHref={href}
          onVia={props.onVia}
          onKeuze={props.onKeuze}
          onNotitie={props.onNotitie}
          onVink={props.onVink}
          onAanpassen={props.onAanpassen}
        />
      )}

      {rij === 'controleren' && paneelOpen && !bedragVeld && (
        <p id={paneelId} className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          Staat er bij de Belastingdienst iets anders? Klopt je dossier niet, pas het dan aan; klopt je dossier wel, pas het dan aan in de aangifte.
          {href && (
            <>
              {' '}
              <a
                href={href}
                onClick={(e) => eigenKlik(e, () => props.onAanpassen(href))}
                className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline"
              >
                Aanpassen in het dossier
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
