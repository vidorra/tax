'use client'

/**
 * Ronde 2 (A4): ongedaan maken van een broker-import in de editor (`BrokerOngedaan`, lib/import/ongedaan.ts). Alleen
 * de bezittingen die de import veranderde of toevoegde gaan terug; wat je daarna bij andere bezittingen typte, blijft.
 * Is een van die bezittingen na de import nog aangepast, dan eerst bevestigen. Kan tot de volgende import of tot je de
 * pagina verlaat (de staat leeft in de component).
 */
import { useCallback, useState } from 'react'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { BrokerOngedaan } from '@/lib/import/types'
import { kanOngedaan, opsomming, zetTerug } from '@/lib/import/ongedaan'
import { kondigAan } from '@/components/ui'
import type { Wijzig } from '../secties/types'

export const ONGEDAAN_KLAAR = 'Box 3 staat weer zoals vóór de import.'

export interface OngedaanMaken {
  /** De laatste import, met de namen van de bezittingen; null als er niets ongedaan te maken is. */
  laatste: { ongedaan: BrokerOngedaan; namen: string[] } | null
  /** Namen van bezittingen met latere wijzigingen die verloren gaan; null als er niets te bevestigen is. */
  bevestig: string[] | null
  /** Tekst na ongedaan maken, tot de volgende import. */
  klaar: string | null
  onthoud: (ongedaan: BrokerOngedaan, namen: string[]) => void
  /** Ongedaan maken: direct, of eerst de vraag als er latere wijzigingen zijn. */
  vraag: () => void
  voerUit: () => void
  annuleer: () => void
  sluit: () => void
}

export function useOngedaanMaken(invoer: HuishoudenInvoer, wijzig: Wijzig): OngedaanMaken {
  const [laatste, setLaatste] = useState<OngedaanMaken['laatste']>(null)
  const [bevestig, setBevestig] = useState<string[] | null>(null)
  const [klaar, setKlaar] = useState<string | null>(null)

  const voerUit = useCallback(() => {
    if (!laatste) return
    wijzig((d) => {
      d.box3.posities = zetTerug(d, laatste.ongedaan).box3.posities
    })
    setLaatste(null)
    setBevestig(null)
    setKlaar(ONGEDAAN_KLAAR)
    kondigAan(ONGEDAAN_KLAAR)
  }, [laatste, wijzig])

  const vraag = useCallback(() => {
    if (!laatste) return
    const k = kanOngedaan(invoer, laatste.ongedaan)
    if (k.gewijzigd.length > 0) {
      setBevestig(k.gewijzigd)
      kondigAan(`Je latere wijzigingen bij ${opsomming(k.gewijzigd)} gaan ook verloren. Doorgaan?`)
    } else voerUit()
  }, [invoer, laatste, voerUit])

  return {
    laatste,
    bevestig,
    klaar,
    onthoud: (ongedaan, namen) => {
      setLaatste({ ongedaan, namen })
      setBevestig(null)
      setKlaar(null)
    },
    vraag,
    voerUit,
    annuleer: () => setBevestig(null),
    sluit: () => {
      setLaatste(null)
      setBevestig(null)
      setKlaar(null)
    },
  }
}
