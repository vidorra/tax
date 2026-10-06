'use client'

/**
 * Ronde 2 (A5): "Buitenlandse bronbelasting" bij een bezitting, als lijst per land (een fonds of broker keert uit meer
 * landen uit). Leest via `bronbelastingRegels`, ook het oude veld `bronbelasting`; bij de eerste wijziging zet de lijst
 * dat oude veld om naar `bronbelastingen` (één regel met een nieuwe id) en haalt het oude veld weg.
 */
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BronbelastingRegel, TaxYearParams, VermogensPositie } from '@/lib/tax/types'
import { bronbelastingRegels, landCode, OUDE_BRONBELASTING_ID } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { verrekenbaarPerRegel } from '@/lib/tax/modules/box3/bronbelasting'
import { landUitTabel } from '@/lib/tax/years/data/bronbelasting-landen'
import { willekeurigeId } from '@/lib/dossier/ids'
import { knopKlassen, kondigAan } from '@/components/ui'
import { BronbelastingRegelKaart } from './BronbelastingRegelKaart'

export interface BronbelastingLijstProps {
  positie: VermogensPositie
  /** Wijzigt deze bezitting (zoals `pas` in de lijst van bezittingen). */
  pas: (fn: (x: VermogensPositie) => void) => void
  jaar: number
  params: TaxYearParams | null
}

/** Zet de regels terug op de positie: altijd in het nieuwe veld, het oude veld weg. */
function zetRegels(x: VermogensPositie, regels: BronbelastingRegel[]): void {
  delete x.bronbelasting
  if (regels.length > 0) x.bronbelastingen = regels
  else delete x.bronbelastingen
}

export function BronbelastingLijst({ positie, pas, jaar, params }: BronbelastingLijstProps) {
  const regels = bronbelastingRegels(positie)
  // De id die de regel uit het oude veld krijgt bij de eerste wijziging; vast, zodat het kaartje niet opnieuw opbouwt.
  const [idVoorOud] = useState(() => willekeurigeId('bb'))
  const [focusOp, setFocusOp] = useState<string | null>(null)
  const landRefs = useRef(new Map<string, HTMLSelectElement | null>())
  const toevoegen = useRef<HTMLButtonElement>(null)
  const oudeTekst = positie.bronbelasting && !positie.bronbelastingen && !landCode(positie.bronbelasting.land) && positie.bronbelasting.land.trim() ? positie.bronbelasting.land.trim() : undefined

  useEffect(() => {
    if (!focusOp) return
    landRefs.current.get(focusOp)?.focus()
    setFocusOp(null)
  }, [focusOp, regels.length])

  const uitkomsten = useMemo(
    () => new Map(regels.map((r) => [r.id, params ? verrekenbaarPerRegel(r, positie, { params, jaar }) : null])),
    [regels, positie, params, jaar],
  )

  /** De regels van een kopie van de positie, met het oude veld omgezet (land als code, of leeg als het onbekend was). */
  const huidige = (x: VermogensPositie): BronbelastingRegel[] =>
    bronbelastingRegels(x).map((r) => (r.id === OUDE_BRONBELASTING_ID && !x.bronbelastingen ? { ...r, id: idVoorOud, land: landCode(r.land) && landUitTabel(landCode(r.land) as string) ? (landCode(r.land) as string) : /^[A-Z]{2}$/.test(r.land) ? r.land : '' } : { ...r }))

  const sleutel = (r: BronbelastingRegel) => (r.id === OUDE_BRONBELASTING_ID ? idVoorOud : r.id)

  function wijzigRegel(id: string, fn: (r: BronbelastingRegel) => void) {
    pas((x) => {
      const lijst = huidige(x)
      const doel = lijst.find((r) => r.id === (id === OUDE_BRONBELASTING_ID ? idVoorOud : id))
      if (doel) fn(doel)
      zetRegels(x, lijst)
    })
  }

  function voegToe() {
    const id = willekeurigeId('bb')
    pas((x) => zetRegels(x, [...huidige(x), { id, land: '', soort: 'dividend', brutoInkomsten: 0, bedrag: 0 }]))
    setFocusOp(id)
  }

  function haalWeg(r: BronbelastingRegel, naam: string) {
    const id = sleutel(r)
    pas((x) => zetRegels(x, huidige(x).filter((y) => y.id !== id)))
    kondigAan(`${naam} is weggehaald.`)
    toevoegen.current?.focus()
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-900">Buitenlandse bronbelasting</h4>
      {regels.length === 0 && <p className="text-sm text-gray-500">Geen buitenlandse bronbelasting ingevuld.</p>}
      {regels.map((r) => {
        const k = sleutel(r)
        const u = uitkomsten.get(r.id) ?? null
        const naam = u?.landNaam ?? (r.land || 'Dit land')
        return (
          <BronbelastingRegelKaart
            key={k}
            regel={r}
            uitkomst={u}
            positieId={positie.id}
            jaar={jaar}
            params={params}
            {...(r.id === OUDE_BRONBELASTING_ID && oudeTekst ? { oudeTekst } : {})}
            landRef={(el) => {
              landRefs.current.set(k, el)
            }}
            onWijzig={(fn) => wijzigRegel(r.id, fn)}
            onWeghalen={() => haalWeg(r, naam)}
          />
        )
      })}
      <button ref={toevoegen} type="button" className={knopKlassen('secundair', 'sm')} onClick={voegToe}>
        <Plus aria-hidden="true" className="h-4 w-4" />
        Land toevoegen
      </button>
    </div>
  )
}
