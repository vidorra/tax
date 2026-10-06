'use client'

/**
 * Ronde 2 (A2): eerste sectie van Planning, "Voorlopige aanslag en belastingrente" (id voorlopige-aanslag). Per persoon
 * wat er nu is opgelegd, wat de berekening verwacht en wat uitstel kost. De opbouw hangt af van de fase van het jaar
 * (lib/dossier/planning-fase.ts):
 *  - toekomst:  conceptzin, de kaarten met de status van de bedragen, daarna Wat kost uitstel?;
 *  - lopend:    de kaarten met advies en "ongeveer € … per maand", daarna Wat kost uitstel?;
 *  - na-afloop: eerst Wat kost uitstel? met de zin over 1 mei, daarna de kaarten;
 *  - ingediend: één ingeklapte uitklap met alleen de rente bij de verwachte dagtekening.
 * De rekenregels staan in modules/planning/voorlopige-aanslag.ts en belastingrente.ts; deze component rekent niets zelf.
 */
import { Hourglass } from 'lucide-react'
import type { HuishoudenInvoer, HuishoudenResultaat, TaxYearParams, VoorlopigeAanslagAdvies } from '@/lib/tax/types'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'
import { adviesVoorlopigeAanslag, vaFormulier, vaHeffingenUitResultaat } from '@/lib/tax/modules/planning/voorlopige-aanslag'
import { planningFase } from '@/lib/dossier/planning-fase'
import type { DossierStatus } from '@/lib/dossier/status'
import { Disclosure, Section, formatDatum, formatPct } from '@/components/ui'
import { persoonNaam } from '../secties/types'
import { useAangifteStaatContext } from '../useAangifteStaat'
import { VaPersoonKaart } from './VaPersoonKaart'
import { UitstelBlok } from './UitstelBlok'
import { faseIntro } from './va-tekst'

export interface VoorlopigeAanslagSectieProps {
  jaar: number
  invoer: HuishoudenInvoer
  resultaat: HuishoudenResultaat
  params: TaxYearParams
  vandaag: string
  status: DossierStatus
  /** Moment waarop het jaar op Ingediend is gezet (ISO); de schatting van de indieningsdatum bij status Ingediend. */
  ingediendOp?: string | null
}

const TITEL = 'Voorlopige aanslag en belastingrente'

/** "Gebruik bij gezamenlijke posten dezelfde verdeling als hier: Persoon A 62%, Persoon B 38%." */
function verdelingZin(invoer: HuishoudenInvoer, r: HuishoudenResultaat): string | null {
  if (!invoer.fiscaalPartner || r.personen.length < 2) return null
  const a = persoonNaam(invoer.personen.find((p) => p.id === 'A') ?? { id: 'A' })
  const b = persoonNaam(invoer.personen.find((p) => p.id === 'B') ?? { id: 'B' })
  const deel = (x: number) => `${a} ${formatPct(x, 0)}, ${b} ${formatPct(1 - x, 0)}`
  const posten: Array<[string, number]> = []
  if (invoer.eigenWoning) posten.push(['eigen woning', r.verdeling.eigenWoning])
  if (invoer.box3.posities.length > 0 || invoer.box3.schulden.length > 0) posten.push(['box 3', r.verdeling.box3])
  if (posten.length === 0) return null
  if (posten.every(([, x]) => Math.round(x * 100) === Math.round(posten[0][1] * 100))) {
    return `Gebruik bij gezamenlijke posten dezelfde verdeling als hier: ${deel(posten[0][1])}.`
  }
  return `Gebruik bij gezamenlijke posten dezelfde verdeling als hier: ${posten.map(([n, x]) => `${n} ${deel(x)}`).join('; ')}.`
}

export function VoorlopigeAanslagSectie({ jaar, invoer, resultaat, params, vandaag, status, ingediendOp }: VoorlopigeAanslagSectieProps) {
  const staat = useAangifteStaatContext()
  const planning = staat.staat.planning ?? {}
  const fase = planningFase(jaar, vandaag, status)
  const ctx = { params, tabel: BELASTINGRENTE_IB }
  const indiening = planning.indieningsdatum ?? (fase === 'ingediend' && ingediendOp ? ingediendOp.slice(0, 10) : undefined)
  const scenario = {
    ...(planning.verwachteDagtekening ? { verwachteDagtekening: planning.verwachteDagtekening } : {}),
    ...(indiening ? { indieningsdatum: indiening } : {}),
    ...(planning.verwachtConform !== undefined ? { verwachtConform: planning.verwachtConform } : {}),
  }
  const zin = verdelingZin(invoer, resultaat)
  const personen = resultaat.personen.flatMap((p) => {
    const pi = invoer.personen.find((x) => x.id === p.id)
    if (!pi) return []
    const advies: VoorlopigeAanslagAdvies = adviesVoorlopigeAanslag(
      { persoon: p.id, belastingjaar: jaar, ...vaHeffingenUitResultaat(p, pi), vandaag, scenario, formulier: vaFormulier(pi, p, invoer, resultaat) },
      ctx,
    )
    return [{ id: p.id, naam: persoonNaam(pi), advies }]
  })

  if (fase === 'ingediend') {
    return (
      <section id="voorlopige-aanslag" aria-label={`${TITEL} (ingediend)`}>
        <Disclosure titel={`${TITEL} (ingediend)`} subtitel="Alleen de belastingrente bij de verwachte datum van de aanslag" as="h2">
          {indiening && !planning.indieningsdatum && (
            <p className="mb-3 text-sm text-gray-600">Gerekend met de aangifte ingediend op {formatDatum(indiening)}, de dag waarop je het jaar op Ingediend zette.</p>
          )}
          <UitstelBlok jaar={jaar} params={params} vandaag={vandaag} fase={fase} personen={personen} zonderKop />
        </Disclosure>
      </section>
    )
  }

  const kaarten = (
    <div className={personen.length > 1 ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4'}>
      {personen.map((p) => (
        <VaPersoonKaart key={p.id} naam={p.naam} advies={p.advies} params={params} fase={fase} bedragStatus={fase === 'toekomst' ? 'voorstel' : resultaat.paramsStatus} verdelingZin={zin} />
      ))}
    </div>
  )
  const uitstel = <UitstelBlok jaar={jaar} params={params} vandaag={vandaag} fase={fase} personen={personen} />
  const intro = faseIntro(fase, jaar)

  return (
    <Section id="voorlopige-aanslag" icon={<Hourglass />} title={TITEL} subtitle="Per persoon wat je nu betaalt, wat je verschuldigd bent en wat uitstel kost.">
      <div className="space-y-6">
        {intro && <p className="text-sm text-gray-700">{intro}</p>}
        {fase === 'na-afloop' ? (
          <>
            {uitstel}
            <div className="border-t border-gray-100 pt-5">{kaarten}</div>
          </>
        ) : (
          <>
            {kaarten}
            <div className="border-t border-gray-100 pt-5">{uitstel}</div>
          </>
        )}
      </div>
    </Section>
  )
}
