'use client'

/**
 * Ronde 2 (A3): de keuze "Status van dit jaar" met de regels uit ontwerp-ronde2.md 6.1.
 *
 * - Concept kan altijd.
 * - Gecontroleerd kan pas als de fouten zijn opgelost of bewust genegeerd. In een streng jaar is de optie uitgeschakeld
 *   met de reden in het label ("Gecontroleerd (eerst 2 fouten oplossen)"); in een rustig jaar kan de gebruiker hem
 *   kiezen, dan wordt het jaar streng (`onWilGecontroleerd`), blijft de status staan en zegt de pagina waarom.
 * - Ingediend kan altijd. Met open fouten eerst een vraag in de pagina (geen modaal venster; de focus gaat naar de vraag):
 *   "Er staan nog {n} fouten open. Toch markeren als ingediend? …" · Markeren als ingediend · Annuleren.
 *
 * Rendert twee kinderen voor de flex-rij van de jaarbalk: de keuzelijst, en (als er iets te zeggen is) een regel over
 * de volle breedte die achteraan de rij komt.
 */
import { useEffect, useRef, useState } from 'react'
import { DOSSIER_STATUS_INFO, DOSSIER_STATUSSEN, type DossierStatus } from '@/lib/dossier/status'
import { Button, Select, kondigAan } from '@/components/ui'
import { aantalTekst } from './niveau'

export const STATUS_KEUZE_ID = 'status-van-dit-jaar'

export interface StatusKeuzeProps {
  status: DossierStatus
  onStatus: (s: DossierStatus) => void
  /** Open fouten (live, met de negeringen). */
  fouten: number
  streng: boolean
  /** De gebruiker wil Gecontroleerd: het jaar wordt streng (`controles-streng` met `door: 'status'`). */
  onWilGecontroleerd: () => void
  onBekijkControles: () => void
}

export function StatusKeuze({ status, onStatus, fouten, streng, onWilGecontroleerd, onBekijkControles }: StatusKeuzeProps) {
  const [bevestig, setBevestig] = useState(false)
  const [geweigerd, setGeweigerd] = useState(false)
  const vraag = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (bevestig) vraag.current?.focus()
  }, [bevestig])
  useEffect(() => {
    if (fouten === 0) setGeweigerd(false)
  }, [fouten])

  const uit = streng && fouten > 0
  const opties = DOSSIER_STATUSSEN.map((s) => ({
    value: s,
    label: s === 'gecontroleerd' && uit ? `${DOSSIER_STATUS_INFO[s].label} (eerst ${aantalTekst('fout', fouten)} oplossen)` : DOSSIER_STATUS_INFO[s].label,
    disabled: s === 'gecontroleerd' && uit && status !== 'gecontroleerd',
  }))

  function kies(s: DossierStatus) {
    setBevestig(false)
    if (s === 'gecontroleerd') {
      onWilGecontroleerd()
      if (fouten > 0) {
        setGeweigerd(true)
        kondigAan('Gecontroleerd kan pas als de fouten zijn opgelost of bewust genegeerd.')
        return
      }
    }
    if (s === 'ingediend' && fouten > 0 && status !== 'ingediend') {
      setBevestig(true)
      return
    }
    setGeweigerd(false)
    onStatus(s)
  }

  function naarKeuze() {
    document.getElementById(STATUS_KEUZE_ID)?.focus()
  }

  const toonUitleg = !bevestig && fouten > 0 && (geweigerd || (uit && status !== 'ingediend'))

  return (
    <>
      <Select<DossierStatus> id={STATUS_KEUZE_ID} label="Status van dit jaar" value={status} onChange={kies} options={opties} wrapperClassName="sm:w-56" />
      {(toonUitleg || bevestig) && (
        <div className="w-full sm:order-last">
          {toonUitleg && (
            <p className="text-sm text-gray-700">
              Gecontroleerd kan pas als de fouten zijn opgelost of bewust genegeerd.
              {status === 'gecontroleerd' ? ' Sla je nu op, dan wordt de status Concept.' : ''}{' '}
              <button type="button" onClick={onBekijkControles} className="font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                Bekijk de controles
              </button>
              .
            </p>
          )}
          {bevestig && (
            <div role="group" aria-labelledby="status-bevestig-vraag" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p id="status-bevestig-vraag" ref={vraag} tabIndex={-1} className="focus-visible:outline-none">
                <span className="font-medium">
                  Er {fouten === 1 ? 'staat' : 'staan'} nog {aantalTekst('fout', fouten)} open. Toch markeren als ingediend?
                </span>{' '}
                De fouten blijven als aandachtspunt staan.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  grootte="sm"
                  onClick={() => {
                    setBevestig(false)
                    onStatus('ingediend')
                    kondigAan('Status Ingediend gekozen. Sla op om hem te bewaren.')
                    naarKeuze()
                  }}
                >
                  Markeren als ingediend
                </Button>
                <Button
                  variant="kaal"
                  grootte="sm"
                  onClick={() => {
                    setBevestig(false)
                    naarKeuze()
                  }}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
