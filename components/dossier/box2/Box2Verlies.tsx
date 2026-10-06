'use client'

/**
 * Ronde 2 (A2): de uitleg bij een negatief box 2-inkomen (trigger in de invoer, ux-ronde2.md 8.6, copy ontwerp 9.6).
 * Info, geen rood: een verlies is geen fout. Met het box 2-inkomen van vorig jaar ook de geschatte teruggaaf over dat
 * jaar (terugwenteling, de schijven van vorig jaar). Termijnen uit de params.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId, TaxYearParams } from '@/lib/tax/types'
import { Alert, formatEuro } from '@/components/ui'
import { Bedrag, Rij } from '../velden'
import { persoonNaam, type Wijzig } from '../secties/types'

export function Box2Verlies({ invoer, wijzig, resultaat, params }: { invoer: HuishoudenInvoer; wijzig: Wijzig; resultaat: HuishoudenResultaat | null | undefined; params: TaxYearParams | null }) {
  if (!resultaat || !params) return null
  const jaar = invoer.jaar
  const v = params.box2.waarde.verliesverrekening
  const personen = invoer.personen.filter((p) => (resultaat.box2.inkomen[p.id] ?? 0) < 0)
  if (personen.length === 0) return null
  const twee = invoer.personen.length > 1
  const terugTekst = v.terug === 1 ? `${jaar - 1}` : `de ${v.terug} jaar vóór ${jaar}`
  const zet = (id: PersoonId, x: number | undefined) =>
    wijzig((d) => {
      const p = d.personen.find((q) => q.id === id)
      if (!p) return
      if (x === undefined) delete p.box2InkomenVorigJaar
      else p.box2InkomenVorigJaar = x
    })
  return (
    <div className="space-y-4">
      {personen.map((p) => {
        const inkomen = resultaat.box2.inkomen[p.id] ?? 0
        const tw = resultaat.personen.find((r) => r.id === p.id)?.box2Verlies?.terugwenteling
        return (
          <div key={p.id} className="space-y-3">
            <Alert variant="info" titel={twee ? persoonNaam(p) : undefined}>
              <p>
                Je box 2-inkomen is negatief: {formatEuro(inkomen)}. Dit verlies verlaagt je verzamelinkomen van {jaar}. Je verrekent het met box 2-inkomen van {terugTekst} en van de {v.vooruit} jaar na {jaar}. De
                Belastingdienst stelt het verlies vast met een beschikking.
              </p>
              {p.box2InkomenVorigJaar !== undefined && tw && tw.geschatteTeruggaaf > 0 && (
                <p className="mt-2">De belasting in box 2 over {jaar - 1} gaat dan omlaag met ongeveer {formatEuro(tw.geschatteTeruggaaf)}.</p>
              )}
            </Alert>
            <Rij>
              <Bedrag
                label={`Box 2-inkomen ${jaar - 1}${twee ? `, ${persoonNaam(p)}` : ''}`}
                hint={`Voor de geschatte teruggaaf over ${jaar - 1}. Staat ${jaar - 1} in je dossier, dan komt dit uit dat jaar.`}
                veld={`persoon:${p.id}/box2InkomenVorigJaar`}
                value={p.box2InkomenVorigJaar}
                onChange={(x) => zet(p.id, x)}
              />
            </Rij>
          </div>
        )
      })}
    </div>
  )
}
