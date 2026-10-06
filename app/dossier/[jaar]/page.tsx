import { Container } from '@/components/ui'
import { HuishoudenEditor } from '@/components/dossier/HuishoudenEditor'
import { JaarKop } from '@/components/dossier/JaarKop'
import { JaarOntbreekt } from '@/components/dossier/JaarOntbreekt'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { AangifteStaatProvider } from '@/components/dossier/useAangifteStaat'
import { laadJaarPagina } from '@/lib/dossier/jaar-pagina'
import { leesTerug } from '@/lib/dossier/jaar-tabs'
import { laadJaar } from '@/lib/dossier/opslag'
import { isVeldId } from '@/lib/dossier/veld'
import type { HuishoudenInvoer } from '@/lib/tax/types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ jaar: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props) {
  return { title: `Invoer ${(await params).jaar}` }
}

export default async function JaarEditorPagina({ params, searchParams }: Props) {
  const p = await laadJaarPagina((await params).jaar)
  const zoek = await searchParams
  // Ronde 2: knop terug na springen vanuit een andere tab (`?terug=export`); `?veld=` springt naar een veld (A3).
  const terug = leesTerug(zoek.terug)
  const ruwVeld = Array.isArray(zoek.veld) ? zoek.veld[0] : zoek.veld
  const veld = isVeldId(ruwVeld) ? ruwVeld : null
  if (p.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={p.ontbreekt} />
  if (p.soort === 'fout') return <DatabaseFout melding={p.melding} />
  if (p.soort === 'leeg') return <JaarOntbreekt jaar={p.jaar} />
  const d = p.detail

  // Ronde 2 (A3): de invoer van vorig jaar voor de controles (beginbalans, saldi). Lukt het laden niet, dan zonder;
  // alleen de naam van de fout gaat naar de log.
  let vorigInvoer: HuishoudenInvoer | null = null
  if (p.vorigJaarBestaat) {
    try {
      vorigInvoer = (await laadJaar(p.householdId, d.jaar - 1, { controles: false }))?.invoer ?? null
    } catch (e) {
      console.error(`[dossier/jaar] vorig jaar laden mislukt: ${(e as Error)?.name ?? 'onbekend'}`)
    }
  }

  return (
    <AangifteStaatProvider jaar={d.jaar} beginStaat={p.staat}>
      <Container breedte="breed">
        <JaarKop
          jaar={d.jaar}
          tab="invoer"
          titel={`Inkomstenbelasting ${d.jaar}`}
          intro="Vul de gegevens van je huishouden in. De uitkomst rekent direct mee; opslaan bewaart alles versleuteld."
          status={d.status}
          paramsStatus={p.paramsStatus}
          badges={p.badges}
          terug={terug}
        />
        <HuishoudenEditor
          jaar={d.jaar}
          invoer={d.invoer}
          status={d.status}
          variant={d.variant}
          versie={d.versie}
          updatedAt={d.updatedAt}
          parametersGewijzigd={d.parametersGewijzigd}
          varianten={p.varianten}
          jaarStatus={p.basisStatus}
          concept={p.concept}
          vorigJaarBestaat={p.vorigJaarBestaat}
          vandaag={new Date().toISOString().slice(0, 10)}
          ingediend={d.ingediend ?? null}
          vorigInvoer={vorigInvoer}
          springNaarVeld={veld}
        />
      </Container>
    </AangifteStaatProvider>
  )
}
