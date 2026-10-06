'use client'

/**
 * Ronde 2 (A1): één scherm van de online aangifte, met de kop zoals in het programma (en het pad in het linkermenu
 * erboven), de telling "1 van 4", een melding of toelichting, de rubrieken met hun rijen, verborgen lege velden,
 * "Alles op dit scherm afvinken" en "Volgende onderdeel".
 *
 * Filter: rijen buiten het filter verdwijnen (bij afdrukken staan ze er wel), behalve rijen waar je net iets mee deed
 * (`vast`): die blijven grijs staan tot je het filter wijzigt. Valt alles weg, dan klapt het scherm in tot zijn kop met
 * "Niets te doen".
 */
import { useState, type ReactNode } from 'react'
import { CircleX } from 'lucide-react'
import { Alert, Button, cn } from '@/components/ui'
import type { Controle } from '@/lib/controles/types'
import { veldHref } from '@/lib/dossier/veld'
import type { Scherm, Veld, VeldVoortgang, VerschilKeuze as Keuze } from '@/lib/invulhulp/types'
import { heeftOpenVerschil, inFilter, schermTelling, standaardZichtbaar, veldStatus, type InvulhulpFilter } from '@/lib/invulhulp/voortgang'
import { KOLOM_LABEL, kopId } from './hulp'
import { AangifteRegel } from './AangifteRegel'

export interface RijActies {
  klopt: (veld: Veld) => void
  ongedaan: (veld: Veld) => void
  vink: (veld: Veld, aan: boolean) => void
  via: (veld: Veld, bedrag: number | null) => void
  keuze: (veld: Veld, keuze: Keuze) => void
  notitie: (veld: Veld, tekst: string) => void
  allesAfvinken: (scherm: Scherm) => void
  /** Naar een andere pagina, na flush. */
  naar: (href: string) => void
  /** Naar een scherm op deze pagina (focus op de kop). */
  naarScherm: (sleutel: string) => void
}

export interface AangifteSchermProps {
  jaar: number
  scherm: Scherm
  /** Naam van de persoon in de kop (alleen als er twee personen zijn en het menu hem niet al noemt). */
  persoonLabel?: string
  vgs: Record<string, VeldVoortgang> | undefined
  filter: InvulhulpFilter
  vast: ReadonlySet<string>
  bewerkbaar: boolean
  /** Open fouten die bij dit scherm horen. */
  fouten: Controle[]
  volgende: { sleutel: string; titel: string } | null
  /** Extra inhoud onder de rijen (de eindcontrole op het scherm Overzicht). */
  extra?: ReactNode
  acties: RijActies
}

export function AangifteScherm({ jaar, scherm, persoonLabel, vgs, filter, vast, bewerkbaar, fouten, volgende, extra, acties }: AangifteSchermProps) {
  const [toonLeeg, setToonLeeg] = useState(false)
  const telling = schermTelling(scherm, vgs)
  const kop = kopId(scherm.sleutel)
  const kicker = scherm.menu.filter((m) => m !== scherm.titel)
  if (persoonLabel && !kicker.includes(persoonLabel)) kicker.push(persoonLabel)
  const metVooraf = scherm.rubrieken.some((r) => r.velden.some((v) => v.rij === 'controleren'))

  let leeg = 0
  let zichtbaarInFilter = 0
  const rubrieken = scherm.rubrieken.map((r) => {
    const rijen = r.velden.flatMap((v) => {
      const vg = vgs?.[v.sleutel]
      if (!standaardZichtbaar(v, vg)) {
        leeg++
        if (!toonLeeg) return []
      }
      const inF = inFilter(v, vg, filter)
      const zichtbaar = inF || vast.has(v.sleutel)
      if (zichtbaar) zichtbaarInFilter++
      return [{ veld: v, vg, zichtbaar, gedimd: zichtbaar && !inF }]
    })
    return { rubriek: r, rijen }
  })
  const heeftRijen = scherm.rubrieken.some((r) => r.velden.length > 0)
  // Een scherm met eigen inhoud (de eindcontrole op Overzicht) klapt nooit in: daar vul je het bedrag van het programma in.
  const nietsTeDoen = filter !== 'alles' && heeftRijen && zichtbaarInFilter === 0 && !extra
  const openVerschil = scherm.rubrieken.some((r) => r.velden.some((v) => heeftOpenVerschil(v, vgs?.[v.sleutel])))
  const teDoen = telling.totaal - telling.afgevinkt
  const kanAllesAfvinken = bewerkbaar && !openVerschil && fouten.length === 0 && teDoen > 0
  const eersteFout = fouten[0]
  const foutHref = eersteFout ? (eersteFout.veld ? veldHref(jaar, eersteFout.veld, 'aangifte') : (eersteFout.href ?? null)) : null

  return (
    <section
      id={scherm.sleutel}
      aria-labelledby={kop}
      className="scroll-mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid-page print:border-gray-400 print:shadow-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker.length > 0 && <p className="text-xs text-gray-500">{kicker.join(' · ')}</p>}
          <h2 id={kop} tabIndex={-1} className="scroll-mt-6 text-base font-medium leading-snug text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            {scherm.titel}
          </h2>
        </div>
        {nietsTeDoen ? (
          <span className="flex-shrink-0 text-sm text-gray-500 print:hidden">Niets te doen</span>
        ) : (
          telling.totaal > 0 && (
            <span className="flex-shrink-0 text-sm tabular-nums text-gray-600">
              {telling.afgevinkt} van {telling.totaal}
            </span>
          )
        )}
      </div>

      <div className={cn(nietsTeDoen && 'hidden print:block')}>
        {eersteFout && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <CircleX aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-700" />
            <p>
              <span className="sr-only">Fout: </span>
              Kan nog veranderen: er staat een fout open bij dit onderdeel.{' '}
              {foutHref && (
                <a
                  href={foutHref}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    acties.naar(foutHref)
                  }}
                  className="font-medium text-red-900 underline underline-offset-2 transition-colors hover:text-red-700 print:hidden"
                >
                  Naar de fout
                </a>
              )}
            </p>
          </div>
        )}

        {scherm.melding && (
          <Alert variant={scherm.melding.variant === 'let-op' ? 'let-op' : 'info'} className="mt-3">
            <p>{scherm.melding.tekst}</p>
            {scherm.melding.link && (
              <a
                href={veldHref(jaar, scherm.melding.link.veld, 'aangifte')}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  if (scherm.melding?.link) acties.naar(veldHref(jaar, scherm.melding.link.veld, 'aangifte'))
                }}
                className="mt-1 inline-flex min-h-[44px] items-center font-medium text-primary transition-colors hover:text-primary-dark print:hidden"
              >
                {scherm.melding.link.label}
              </a>
            )}
          </Alert>
        )}

        {scherm.toelichting && <p className="mt-3 text-sm leading-relaxed text-gray-600">{scherm.toelichting}</p>}

        {rubrieken.map(({ rubriek, rijen }) => {
          if (rijen.length === 0) return null
          const zichtbaar = rijen.some((x) => x.zichtbaar)
          return (
            <div key={rubriek.id} className={cn('mt-4', !zichtbaar && 'hidden print:block')}>
              {rubriek.titel && <h3 className="mb-1 text-sm font-semibold text-gray-800">{rubriek.titel}</h3>}
              {rubriek.kolommen && rubriek.kolommen.length > 0 && (
                <div aria-hidden="true" className="hidden border-b border-gray-100 pb-1 text-xs text-gray-500 lg:flex lg:gap-x-4">
                  {rubriek.kolommen.map((k) => (
                    <span key={k} className="w-[9.5rem] pr-[3.25rem] text-right">
                      {KOLOM_LABEL[k]}
                    </span>
                  ))}
                </div>
              )}
              <div>
                {rijen.map(({ veld, vg, zichtbaar: z, gedimd }) => (
                  <div key={veld.sleutel} className={cn(!z && 'hidden print:block')}>
                    <AangifteRegel
                      jaar={jaar}
                      veld={veld}
                      rubriekTitel={rubriek.titel}
                      kolommen={rubriek.kolommen}
                      vg={vg}
                      status={veldStatus(veld, vg)}
                      bewerkbaar={bewerkbaar}
                      gedimd={gedimd}
                      metVooraf={metVooraf}
                      onKlopt={() => acties.klopt(veld)}
                      onOngedaan={() => acties.ongedaan(veld)}
                      onVink={(aan) => acties.vink(veld, aan)}
                      onVia={(b) => acties.via(veld, b)}
                      onKeuze={(k) => acties.keuze(veld, k)}
                      onNotitie={(t) => acties.notitie(veld, t)}
                      onAanpassen={acties.naar}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {extra}

        {leeg > 0 && (
          <p className="mt-3 text-sm text-gray-600 print:hidden">
            {!toonLeeg && `${leeg} ${leeg === 1 ? 'veld' : 'velden'} zonder bedrag verborgen · `}
            <button
              type="button"
              aria-expanded={toonLeeg}
              onClick={() => setToonLeeg((t) => !t)}
              className="inline-flex min-h-[44px] items-center font-medium text-primary transition-colors hover:text-primary-dark"
            >
              {toonLeeg ? 'Verberg' : 'Toon'}
              <span className="sr-only"> {leeg === 1 ? 'het veld' : 'de velden'} zonder bedrag</span>
            </button>
          </p>
        )}

        {(teDoen > 0 || volgende) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 print:hidden">
            {teDoen > 0 ? (
              <Button variant="secundair" grootte="sm" disabled={!kanAllesAfvinken} onClick={() => acties.allesAfvinken(scherm)}>
                Alles op dit scherm afvinken
              </Button>
            ) : (
              <span />
            )}
            {volgende && (
              <Button variant="kaal" grootte="sm" onClick={() => acties.naarScherm(volgende.sleutel)} className="ml-auto">
                Volgende onderdeel
                <span className="sr-only">: {volgende.titel}</span>
              </Button>
            )}
          </div>
        )}
      </div>
      {nietsTeDoen && volgende && (
        <div className="mt-2 flex justify-end print:hidden">
          <Button variant="kaal" grootte="sm" onClick={() => acties.naarScherm(volgende.sleutel)}>
            Volgende onderdeel
            <span className="sr-only">: {volgende.titel}</span>
          </Button>
        </div>
      )}
    </section>
  )
}
