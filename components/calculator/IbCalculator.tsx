'use client'

import { Check, RotateCcw, Share2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { formatEuro } from '@/components/ui/format'
import { MobileResultBar } from '@/components/ui/MobileResultBar'
import type { Blok, PersoonId, Status, TaxYearParams } from '@/lib/tax/types'
import { STATUS_RANG } from '@/lib/tax/types'
import { STANDAARD_JAAR, getJaar } from '@/lib/tax/years'
import { useBerekening } from '@/hooks/useBerekening'
import { type CalculatorState, bewaarState, decodeState, encodeState, jaarBestaat, laadState, standaardState, variantVoor, wisState } from '@/lib/calculator/formulier'
import { SITE } from '@/lib/site'
import { type Wijzig } from './gedeeld'
import { Resultaat } from './Resultaat'
import { SectieJaar, jaarOpties } from './SectieJaar'
import { SectieKinderen } from './SectieKinderen'
import { SectieOnderneming } from './SectieOnderneming'
import { SectieInkomsten, SectiePensioen, SectieVermogen, SectieVoorlopig, SectieWoning } from './SectiesOverig'
import { BelastingpotKaart, UitlegBlok } from './Uitleg'

function paramsVoor(jaar: number, variant: string | undefined): TaxYearParams {
  try {
    return getJaar(jaar, variantVoor(jaar, variant))
  } catch {
    return getJaar(STANDAARD_JAAR)
  }
}

/** Laagste status van een blok, inclusief afwijkende veldstatussen. */
function laagsteBlokStatus<T>(blok: Blok<T>): Status {
  let laagste = blok.status
  for (const s of Object.values(blok.veldStatus ?? {}) as Status[]) if (s && STATUS_RANG[s] < STATUS_RANG[laagste]) laagste = s
  return laagste
}

export interface IbCalculatorProps {
  beginJaar?: number
  beginVariant?: string
}

/** Publieke IB-calculator: invoer links, sticky uitkomst rechts, uitleg eronder. */
export function IbCalculator({ beginJaar, beginVariant }: IbCalculatorProps) {
  const startJaar = beginJaar && jaarBestaat(beginJaar) ? beginJaar : STANDAARD_JAAR
  const [state, setState] = useState<CalculatorState>(() => standaardState(startJaar, beginVariant))
  const [actief, setActief] = useState<PersoonId>('A')
  const [geladen, setGeladen] = useState(false)
  const [gedeeld, setGedeeld] = useState(false)
  const [deelStatus, setDeelStatus] = useState<'' | 'gekopieerd' | 'fout'>('')
  const [deelLink, setDeelLink] = useState('')
  const deelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wijzig = useCallback<Wijzig>((f) => setState(f), [])

  // Na het laden: eerst een gedeelde berekening (?s=), anders wat in deze browser is bewaard.
  useEffect(() => {
    let s: CalculatorState | null = null
    try {
      s = decodeState(new URLSearchParams(window.location.search).get('s'))
    } catch {
      s = null
    }
    if (s) {
      setState(s)
      setGedeeld(true)
    } else {
      const opgeslagen = laadState()
      if (opgeslagen) setState(beginJaar && jaarBestaat(beginJaar) ? { ...opgeslagen, jaar: beginJaar, variant: beginVariant ?? opgeslagen.variant } : opgeslagen)
    }
    setGeladen(true)
    // Alleen bij het laden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (geladen) bewaarState(state)
  }, [state, geladen])

  useEffect(() => () => {
    if (deelTimer.current) clearTimeout(deelTimer.current)
  }, [])

  const partner = state.partner
  const persoonId: PersoonId = partner ? actief : 'A'
  const persoon = state.personen[persoonId]

  const { uitkomst, bezig } = useBerekening(state)
  const { hoofd, volgend, pot } = uitkomst

  const params = useMemo(() => paramsVoor(state.jaar, state.variant), [state.jaar, state.variant])
  const opties = useMemo(() => jaarOpties(beginJaar), [beginJaar])
  const box3Status: Status = useMemo(() => laagsteBlokStatus(params.box3), [params])

  async function deel() {
    const url = `${window.location.origin}${window.location.pathname}?s=${encodeState(state)}`
    setDeelLink(url)
    try {
      await navigator.clipboard.writeText(url)
      setDeelStatus('gekopieerd')
    } catch {
      setDeelStatus('fout')
    }
    if (deelTimer.current) clearTimeout(deelTimer.current)
    deelTimer.current = setTimeout(() => setDeelStatus(''), 6000)
  }

  function opnieuw() {
    wisState()
    setState(standaardState(startJaar, beginVariant))
    setActief('A')
    setGedeeld(false)
  }

  const r = hoofd.resultaat
  const bedrag = r ? r.totaal.teBetalenIB + r.totaal.teBetalenZvw : null

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
        {gedeeld && (
          <Alert variant="info" titel="Gedeelde berekening">
            Je bekijkt een berekening die met je is gedeeld. Wijzigingen bewaren we alleen in deze browser.
          </Alert>
        )}
        <SectieJaar
          jaar={state.jaar}
          variant={state.variant}
          partner={partner}
          vergelijk={state.vergelijk}
          geboortejaarA={state.personen.A.geboortejaar}
          geboortejaarB={state.personen.B.geboortejaar}
          opties={opties}
          wijzig={wijzig}
        />
        <SectieOnderneming jaar={state.jaar} partner={partner} actief={persoonId} setActief={setActief} persoon={persoon} ondernemer={params.ondernemer.waarde} wijzig={wijzig} />
        <SectieInkomsten partner={partner} actief={persoonId} setActief={setActief} persoon={persoon} wijzig={wijzig} />
        <SectiePensioen partner={partner} actief={persoonId} setActief={setActief} persoon={persoon} wijzig={wijzig} />
        <SectieWoning woning={state.woning} wijzig={wijzig} />
        <SectieVermogen vermogen={state.vermogen} box3={params.box3.waarde} status={box3Status} wijzig={wijzig} />
        <SectieKinderen jaar={state.jaar} kinderen={state.kinderen} kot={params.toeslagen.waarde.kot} wijzig={wijzig} />
        <SectieVoorlopig partner={partner} actief={persoonId} setActief={setActief} persoon={persoon} pot={state.belastingpot} wijzig={wijzig} />
      </div>

      <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Resultaat hoofd={hoofd} volgend={volgend} partner={partner} metKinderen={state.kinderen.length > 0} bezig={bezig} />
      </div>

      <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
        <UitlegBlok hoofd={hoofd} partner={partner} />
        <BelastingpotKaart pot={pot} jaar={hoofd.jaar} maanden={state.belastingpot.maandenVerstreken} />

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-base font-medium text-gray-900">Deel deze berekening</h2>
          <p className="mt-1 text-sm text-gray-600">De link bevat je invoer zelf; wij slaan niets op. Iedereen met de link ziet dezelfde cijfers, dus deel hem alleen met wie ze mag zien.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={deel}>
              {deelStatus === 'gekopieerd' ? <Check aria-hidden="true" className="h-4 w-4" /> : <Share2 aria-hidden="true" className="h-4 w-4" />}
              {deelStatus === 'gekopieerd' ? 'Link gekopieerd' : 'Deel deze berekening'}
            </Button>
            <Button variant="secundair" onClick={opnieuw}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Opnieuw beginnen
            </Button>
          </div>
          <p role="status" className="mt-2 text-xs text-gray-600">
            {deelStatus === 'gekopieerd' && 'De link staat op je klembord.'}
            {deelStatus === 'fout' && 'Kopiëren lukte niet. Selecteer de link hieronder en kopieer hem zelf.'}
          </p>
          {deelStatus === 'fout' && deelLink && (
            <input
              readOnly
              aria-label="Link naar deze berekening"
              value={deelLink}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
            />
          )}
        </div>

        <Alert variant="info" titel={`${SITE.disclaimer}.`}>
          Deze calculator rekent met vereenvoudigde invoer en de parameters zoals ze nu bekend zijn. Cijfers met een label als voorlopig, voorstel of geschat kunnen nog veranderen.
          Laat je aangifte bij twijfel controleren door een adviseur.
        </Alert>
      </div>

      <MobileResultBar
        label={bedrag !== null && bedrag < 0 ? 'Terug te krijgen' : 'Te betalen'}
        bedrag={bedrag === null ? null : Math.abs(bedrag)}
        toelichting={r ? `waarvan Zvw ${formatEuro(r.totaal.teBetalenZvw)}` : undefined}
        leegTekst={hoofd.fout ? 'Controleer je invoer' : undefined}
      />
      {/* Op mobiel kondigt de MobileResultBar het bedrag al aan; op desktop doet deze regel dat. */}
      <div className="hidden lg:block">
        <p className="sr-only" aria-live="polite">
          {!bezig && bedrag !== null ? `Uitkomst ${hoofd.jaar}: ${bedrag < 0 ? 'terug te krijgen' : 'te betalen'} ${formatEuro(Math.abs(bedrag))}.` : ''}
        </p>
      </div>
    </div>
  )
}
