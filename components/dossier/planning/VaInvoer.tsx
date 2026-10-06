'use client'

/**
 * Ronde 2 (A2): de voorlopige aanslag in AanslagSectie.
 *
 * - Bedragen IB en Zvw zoals voorheen. Pas als er een voorlopige aanslag IB is ingevuld, verschijnen de chips Betaald of
 *   Ontvangen (een voorlopige teruggaaf wordt negatief opgeslagen, art. 9.4 lid 7) en de uitklap "Dagtekening en
 *   betaald" (`voorlopigeAanslagDetails`).
 * - Besluit na de nacontrole: de info-regel "Je hebt geen voorlopige aanslag ingevuld. Klopt dat?" alleen in een
 *   verstreken jaar, bij te betalen IB boven de aanslaggrens en zonder voorlopige aanslag (toonGeenVaVraag). Geen
 *   controle; staat op de lijst van het rommelbudget (ontwerp 14.4).
 */
import { useMemo } from 'react'
import type { HuishoudenResultaat, PersoonInvoer, VoorlopigeAanslagDetail } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { toonGeenVaVraag } from '@/lib/dossier/planning-fase'
import { Alert, ChipGroup, Disclosure } from '@/components/ui'
import { Bedrag, Datum, Rij } from '../velden'
import type { WijzigPersoon } from '../secties/types'
import { useVandaag } from './useVandaag'

type Heffing = 'ib' | 'zvw'

export function VaInvoer({ persoon, wijzigPersoon, jaar, resultaat }: { persoon: PersoonInvoer; wijzigPersoon: WijzigPersoon; jaar: number; resultaat: HuishoudenResultaat | null | undefined }) {
  const vandaag = useVandaag()
  const params = useMemo(() => {
    try {
      return getJaar(jaar)
    } catch {
      return null
    }
  }, [jaar])
  const ib = persoon.voorlopigeAanslagIB
  const zvw = persoon.voorlopigeAanslagZvw
  const ibIngevuld = ib !== undefined && ib !== 0
  const zvwIngevuld = zvw !== undefined && zvw !== 0
  const ontvangen = (ib ?? 0) < 0
  const veld = (pad: string) => `persoon:${persoon.id}/${pad}`
  const pr = resultaat?.personen.find((p) => p.id === persoon.id)
  const vraag = Boolean(vandaag && params && toonGeenVaVraag(persoon, pr, params, jaar, vandaag))
  const details = persoon.voorlopigeAanslagDetails

  const zetDetail = (h: Heffing, sleutel: keyof VoorlopigeAanslagDetail, v: string | number | undefined) =>
    wijzigPersoon((p) => {
      const d = { ...(p.voorlopigeAanslagDetails ?? {}) }
      const x: VoorlopigeAanslagDetail = { ...(d[h] ?? {}) }
      if (v === undefined || v === '') delete x[sleutel]
      else (x as Record<string, unknown>)[sleutel] = v
      if (Object.keys(x).length > 0) d[h] = x
      else delete d[h]
      if (Object.keys(d).length > 0) p.voorlopigeAanslagDetails = d
      else delete p.voorlopigeAanslagDetails
    })

  /** Leeg maken haalt ook de dagtekening en het betaalde bedrag van die heffing weg (anders blijven ze onzichtbaar staan). */
  const zonderDetail = (p: PersoonInvoer, h: Heffing) => {
    if (!p.voorlopigeAanslagDetails) return
    delete p.voorlopigeAanslagDetails[h]
    if (Object.keys(p.voorlopigeAanslagDetails).length === 0) delete p.voorlopigeAanslagDetails
  }

  return (
    <div className="space-y-4">
      <Rij>
        <Bedrag
          label={ontvangen ? 'Voorlopige teruggaaf inkomstenbelasting' : 'Voorlopige aanslag inkomstenbelasting'}
          veld={veld('voorlopigeAanslagIB')}
          value={ib === undefined ? undefined : Math.abs(ib)}
          onChange={(v) =>
            wijzigPersoon((p) => {
              if (v === undefined || v === 0) {
                if (v === undefined) delete p.voorlopigeAanslagIB
                else p.voorlopigeAanslagIB = 0
                zonderDetail(p, 'ib')
              } else p.voorlopigeAanslagIB = ontvangen ? -Math.abs(v) : Math.abs(v)
            })
          }
        />
        <Bedrag
          label="Voorlopige aanslag Zvw"
          veld={veld('voorlopigeAanslagZvw')}
          value={zvw}
          onChange={(v) =>
            wijzigPersoon((p) => {
              p.voorlopigeAanslagZvw = v
              if (v === undefined || v === 0) zonderDetail(p, 'zvw')
            })
          }
        />
      </Rij>
      {ibIngevuld && (
        <ChipGroup<'betaald' | 'ontvangen'>
          label="Ontvangen of betaald"
          kolommen={2}
          value={ontvangen ? 'ontvangen' : 'betaald'}
          onChange={(k) => wijzigPersoon((p) => void (p.voorlopigeAanslagIB = k === 'ontvangen' ? -Math.abs(p.voorlopigeAanslagIB ?? 0) : Math.abs(p.voorlopigeAanslagIB ?? 0)))}
          options={[
            { value: 'betaald', label: 'Betaald', beschrijving: 'Voorlopige aanslag' },
            { value: 'ontvangen', label: 'Ontvangen', beschrijving: 'Voorlopige teruggaaf' },
          ]}
        />
      )}
      {(ibIngevuld || zvwIngevuld) && (
        <Disclosure variant="kaal" titel="Dagtekening en betaald" subtitel="Voor de termijnen en de belastingrente in Planning" defaultOpen={Boolean(details)}>
          <div className="space-y-4 pt-2">
            {ibIngevuld && (
              <Rij>
                <Datum label="Dagtekening voorlopige aanslag IB" veld={veld('voorlopigeAanslagDetails.ib.dagtekening')} value={details?.ib?.dagtekening} onChange={(v) => zetDetail('ib', 'dagtekening', v)} />
                <Bedrag
                  label={ontvangen ? 'Al ontvangen (IB)' : 'Al betaald (IB)'}
                  hint="De termijnen tot nu toe samen."
                  veld={veld('voorlopigeAanslagDetails.ib.betaald')}
                  value={details?.ib?.betaald}
                  onChange={(v) => zetDetail('ib', 'betaald', v)}
                />
              </Rij>
            )}
            {zvwIngevuld && (
              <Rij>
                <Datum label="Dagtekening voorlopige aanslag Zvw" veld={veld('voorlopigeAanslagDetails.zvw.dagtekening')} value={details?.zvw?.dagtekening} onChange={(v) => zetDetail('zvw', 'dagtekening', v)} />
                <Bedrag label="Al betaald (Zvw)" hint="De termijnen tot nu toe samen." veld={veld('voorlopigeAanslagDetails.zvw.betaald')} value={details?.zvw?.betaald} onChange={(v) => zetDetail('zvw', 'betaald', v)} />
              </Rij>
            )}
          </div>
        </Disclosure>
      )}
      {vraag && <Alert variant="info">Je hebt geen voorlopige aanslag ingevuld. Klopt dat?</Alert>}
    </div>
  )
}
