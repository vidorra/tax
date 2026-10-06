'use client'

/**
 * Ronde 2 (A3): één controle in het paneel, de exportpoort of de compacte lijst (ux-ronde2.md 4.3 en 4.7).
 *
 * Titel met icoon en verborgen voorvoegsel, waar het over gaat, de uitleg met de echte bedragen, en de acties: Naar het
 * veld (of de sectie of link), een snelle oplossing als die er is, en Negeren (fout, met reden) of Gezien (let op).
 * Een fout die je moet invullen, zegt "Dit moet je invullen; negeren kan hier niet." Een genegeerde controle toont de
 * reden en de datum met Terugzetten.
 */
import Link from 'next/link'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Controle, GenegeerdeControle } from '@/lib/controles/types'
import { Button, ButtonLink, cn, formatDatum, kondigAan } from '@/components/ui'
import type { UseAangifteStaat } from '../useAangifteStaat'
import { NegeerFormulier } from './NegeerFormulier'
import { NIVEAU, NiveauIcoon } from './niveau'

export interface ControleActies {
  /** Naar het veld (of de sectie) van de controle; `veld` bij een controle met meer velden. */
  naar: (c: Controle, veld?: string) => void
  /** Een snelle oplossing die de invoer wijzigt of een actie start; ontbreekt waar dat niet kan (export). */
  los?: (c: Controle) => void
  /** Link naar het veld op een andere pagina (export): dan een link in plaats van een knop. */
  href?: (c: Controle, veld?: string) => string | null
}

export interface ControleItemProps {
  controle: Controle
  acties: ControleActies
  staat: UseAangifteStaat | null
  /** Genegeerd, maar het beslissende bedrag is veranderd. */
  weerOpen?: boolean
  /** Voor een genegeerde controle: de bewaarde negering (dan reden, datum en Terugzetten). */
  negering?: GenegeerdeControle
  /** Opslaan van de negering of Terugzetten mislukte. */
  nietOpgeslagen?: boolean
  onOpgeslagen?: (id: string, ok: boolean) => void
  /** Kop van het item: h4 in het paneel, h3 in de poort. */
  kop?: 'h3' | 'h4'
}

const linkKlasse = 'font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded'

/**
 * Id van het element waar de focus naartoe gaat als er na Gezien, Negeren of Terugzetten geen ander item meer in de
 * lijst staat (de kop "Controles" van het paneel, de kop van de exportpoort). Het paneel geeft het mee.
 */
export const ControleFocusTerug = createContext<string | null>(null)

/**
 * Na Gezien, Negeren of Terugzetten verhuist het item naar een andere lijst en verdwijnt de knop met de focus. Zonder
 * hulp valt de focus naar de body (een schermlezer verliest zijn plek). Daarom: wacht tot het item weg is en zet de
 * focus op de kop van het volgende item in dezelfde lijst (of het vorige), anders op `terugId`. Blijft het item staan,
 * dan op zijn eigen kop. Alleen als de focus echt kwijt is; heeft de gebruiker intussen zelf iets gekozen, dan niet.
 */
function focusNaVerhuizen(li: HTMLElement | null, terugId: string | null): void {
  if (!li) return
  const volgende = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null
  let frames = 0
  const kop = (el: Element | null) => el?.querySelector<HTMLElement>('[data-controle-kop]') ?? null
  const stap = () => {
    if (li.isConnected && frames++ < 20) return void requestAnimationFrame(stap)
    const actief = document.activeElement
    const kwijt = !actief || actief === document.body || li.contains(actief)
    if (!kwijt) return
    const doel = li.isConnected ? kop(li) : (volgende?.isConnected ? kop(volgende) : null) ?? (terugId ? document.getElementById(terugId) : null)
    doel?.focus()
  }
  requestAnimationFrame(stap)
}

function naarLabel(c: Controle): string {
  if (c.linkLabel) return c.linkLabel
  return 'Naar het veld'
}

export function ControleItem({ controle: c, acties, staat, weerOpen, negering, nietOpgeslagen, onOpgeslagen, kop: Kop = 'h4' }: ControleItemProps) {
  const [negeren, setNegeren] = useState(false)
  const wortel = useRef<HTMLLIElement>(null)
  const terugId = useContext(ControleFocusTerug)
  const terugFocus = useRef(false)
  useEffect(() => {
    if (negeren || !terugFocus.current) return
    terugFocus.current = false
    wortel.current?.querySelector<HTMLButtonElement>('button[data-negeer]')?.focus()
  }, [negeren])
  const n = NIVEAU[c.ernst]
  const kanNegeren = !negering && staat && c.ernst !== 'info' && c.negeren !== 'nee'
  const heeftDoel = Boolean(c.veld || c.sectie || c.href)
  const href = acties.href?.(c) ?? c.href ?? null
  const meerVelden = (c.velden?.length ?? 0) > 1 ? c.velden! : null

  function terugzetten() {
    if (!staat) return
    focusNaVerhuizen(wortel.current, terugId)
    staat.wijzig([{ soort: 'genegeerd', id: c.id, waarde: null }], { direct: true })
    void staat.flush().then((ok) => {
      if (ok) kondigAan(`${c.titel}: teruggezet.`)
      onOpgeslagen?.(c.id, ok)
    })
  }

  return (
    <li ref={wortel} data-controle={c.id} className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <NiveauIcoon ernst={c.ernst} className="mt-0.5 h-4 w-4" />
        <div className="min-w-0 flex-1">
          <Kop data-controle-kop="" tabIndex={-1} className="rounded text-sm font-medium text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="sr-only">{n.voorvoegsel}</span>
            {c.titel}
          </Kop>
          {c.waar && <p className="text-xs text-gray-500">{c.waar}</p>}
          <p className="mt-1 text-sm leading-relaxed text-gray-700">{c.uitleg}</p>
          {weerOpen && (
            <p className="mt-1 text-sm font-medium text-amber-900">
              {c.ernst === 'fout' ? 'Je had deze fout genegeerd, maar het verschil is sindsdien veranderd. Kijk opnieuw.' : 'Je had dit als gezien afgevinkt, maar de bedragen zijn sindsdien veranderd. Kijk opnieuw.'}
            </p>
          )}
          {negering && (
            <p className="mt-1 text-xs text-gray-600">
              {negering.reden ? (
                <>
                  Reden: <span className="text-gray-800">{negering.reden}</span> ·{' '}
                </>
              ) : null}
              {negering.ernst === 'fout' ? 'Genegeerd' : 'Gezien'} op {formatDatum(negering.op.slice(0, 10))}
            </p>
          )}
          {meerVelden && !negering && (
            <ul className="mt-1.5 space-y-0.5 text-sm">
              {meerVelden.map((v) => {
                const h = acties.href?.(c, v.veld) ?? null
                return (
                  <li key={v.veld}>
                    {h ? (
                      <Link href={h} className={linkKlasse}>
                        {v.label}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => acties.naar(c, v.veld)} className={cn(linkKlasse, 'text-left')}>
                        {v.label}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {!negeren && (
            <div className="mt-2 flex flex-col items-stretch gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
              {heeftDoel && !negering && !meerVelden &&
                (href ? (
                  <ButtonLink href={href} variant="secundair" grootte="sm">
                    {naarLabel(c)}
                    <span className="sr-only">: {c.titel}</span>
                  </ButtonLink>
                ) : (
                  <Button variant="secundair" grootte="sm" onClick={() => acties.naar(c)}>
                    {naarLabel(c)}
                    <span className="sr-only">: {c.titel}</span>
                  </Button>
                ))}
              {c.oplossing && acties.los && !negering && (
                <Button variant="secundair" grootte="sm" onClick={() => acties.los?.(c)}>
                  {c.oplossing.label}
                </Button>
              )}
              {kanNegeren && (
                <Button variant="kaal" grootte="sm" data-negeer="" onClick={() => setNegeren(true)}>
                  {c.ernst === 'fout' ? 'Negeren' : 'Gezien'}
                  <span className="sr-only">: {c.titel}</span>
                </Button>
              )}
              {negering && staat && (
                <Button variant="kaal" grootte="sm" onClick={terugzetten}>
                  Terugzetten
                  <span className="sr-only">: {c.titel}</span>
                </Button>
              )}
            </div>
          )}
          {c.ernst === 'fout' && c.negeren === 'nee' && !negering && <p className="mt-1 text-xs text-gray-600">Dit moet je invullen; negeren kan hier niet.</p>}
          {nietOpgeslagen && staat && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-red-700">
              Niet opgeslagen.
              <Button
                variant="kaal"
                grootte="sm"
                onClick={() => {
                  staat.opnieuwProberen()
                  void staat.flush().then((ok) => onOpgeslagen?.(c.id, ok))
                }}
              >
                Opnieuw proberen
              </Button>
            </p>
          )}
          {negeren && staat && (
            <NegeerFormulier
              controle={c}
              staat={staat}
              onVoorOpslaan={() => focusNaVerhuizen(wortel.current, terugId)}
              onAnnuleer={() => {
                terugFocus.current = true
                setNegeren(false)
              }}
              onOpgeslagen={(ok) => {
                setNegeren(false)
                onOpgeslagen?.(c.id, ok)
              }}
            />
          )}
        </div>
      </div>
    </li>
  )
}
