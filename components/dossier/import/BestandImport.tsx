'use client'

/**
 * Ronde 2 (A4): broker-import in de sectie Vermogen. De knop "Importeer uit een bestand", het paneel eronder (pas
 * geladen bij de eerste klik, zodat de editor er niet zwaarder van wordt) en na Overnemen de melding "De bedragen staan
 * bij {bezittingen}. Controleer ze en druk bovenaan op Opslaan." met Ongedaan maken.
 *
 * Privacy: het bestand wordt in de browser gelezen en blijft daar. Een rekeningnummer gaat direct door de HMAC
 * (lib/import/sleutel.ts) met een geheim per huishouden en wordt nergens bewaard. Alleen wat je overneemt, komt in de
 * invoer.
 */
import dynamic from 'next/dynamic'
import { Upload } from 'lucide-react'
import { useId, useState } from 'react'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { opsomming } from '@/lib/import/ongedaan'
import { Alert, Button, kondigAan } from '@/components/ui'
import type { Wijzig } from '../secties/types'
import { ImportMelding } from './ImportMelding'
import { useOngedaanMaken } from './useOngedaanMaken'

const ImportPaneel = dynamic(() => import('./ImportPaneel').then((m) => m.ImportPaneel), {
  ssr: false,
  loading: () => (
    <p role="status" className="text-sm text-gray-600">
      Bezig met laden
    </p>
  ),
})

export const klaarTekst = (namen: string[]) => `De bedragen staan bij ${opsomming(namen)}. Controleer ze en druk bovenaan op Opslaan.`

export interface BestandImportProps {
  invoer: HuishoudenInvoer
  wijzig: Wijzig
}

export function BestandImport({ invoer, wijzig }: BestandImportProps) {
  const basis = useId().replace(/:/g, '')
  const paneelId = `import-${basis}`
  const knopId = `${paneelId}-knop`
  const [open, setOpen] = useState(false)
  const o = useOngedaanMaken(invoer, wijzig)
  const leeg = invoer.box3.posities.length === 0

  function sluit() {
    setOpen(false)
    window.setTimeout(() => document.getElementById(knopId)?.focus(), 0)
  }

  function openPaneel() {
    if (o.klaar) o.sluit()
    setOpen(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button id={knopId} variant="secundair" grootte="sm" aria-expanded={open} aria-controls={paneelId} onClick={() => (open ? sluit() : openPaneel())}>
          <Upload aria-hidden="true" className="h-4 w-4" />
          Importeer uit een bestand
        </Button>
        {leeg && !open && <p className="text-sm text-gray-600">Lees een overzicht van je bank of broker in, of voeg hieronder zelf een bezitting toe.</p>}
      </div>

      {o.laatste && !o.bevestig && <ImportMelding tekst={klaarTekst(o.laatste.namen)} onOngedaan={o.vraag} onSluit={o.sluit} />}
      {o.laatste && o.bevestig && (
        <Alert variant="let-op" role="alert">
          <p>Je latere wijzigingen bij {opsomming(o.bevestig)} gaan ook verloren. Doorgaan?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button grootte="sm" onClick={o.voerUit}>
              Ongedaan maken
            </Button>
            <Button variant="secundair" grootte="sm" onClick={o.annuleer}>
              Annuleren
            </Button>
          </div>
        </Alert>
      )}
      {o.klaar && (
        <p role="status" className="text-sm text-gray-700">
          {o.klaar}
        </p>
      )}

      {open && (
        <ImportPaneel
          id={paneelId}
          invoer={invoer}
          wijzig={wijzig}
          onSluit={sluit}
          onOvergenomen={(ongedaan, namen) => {
            o.onthoud(ongedaan, namen)
            kondigAan(klaarTekst(namen))
            sluit()
          }}
        />
      )}
    </div>
  )
}
