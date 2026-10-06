import { Container } from '@/components/ui'
import { AangifteStaatProvider } from '@/components/dossier/useAangifteStaat'
import { JaarKop } from '@/components/dossier/JaarKop'
import { JaarOntbreekt } from '@/components/dossier/JaarOntbreekt'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { Planning } from '@/components/dossier/Planning'
import { laadJaarPagina } from '@/lib/dossier/jaar-pagina'
import { laadAlleInvoer } from '@/lib/dossier/opslag'
import { databaseMelding } from '@/lib/dossier/pagina'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ jaar: string }> }

export async function generateMetadata({ params }: Props) {
  return { title: `Planning ${(await params).jaar}` }
}

export default async function PlanningPagina({ params }: Props) {
  const p = await laadJaarPagina((await params).jaar)
  if (p.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={p.ontbreekt} />
  if (p.soort === 'fout') return <DatabaseFout melding={p.melding} />
  if (p.soort === 'leeg') return <JaarOntbreekt jaar={p.jaar} />
  const d = p.detail
  let andere
  try {
    andere = (await laadAlleInvoer(p.householdId)).filter((j) => j.jaar !== d.jaar && j.jaar >= d.jaar - 2)
  } catch (e) {
    return <DatabaseFout melding={databaseMelding(e)} />
  }
  // Ronde 2 (contract, na de nacontrole): één aangiftestaat voor de hele pagina (ontwerp 2.3). De voorlopige aanslag
  // (A2: planning.verwachteDagtekening) en de terugvraagstatus (A5: terugvragen) gebruiken dezelfde instantie via
  // useAangifteStaatContext(); JaarKop staat erbinnen, zodat de tabrij vóór navigatie kan flushen.
  return (
    <Container breedte="normaal">
      <AangifteStaatProvider jaar={d.jaar} beginStaat={p.staat}>
        <JaarKop
          jaar={d.jaar}
          tab="planning"
          titel={`Planning ${d.jaar}`}
          intro="Gerekend met de opgeslagen invoer van dit jaar. Sla eerst op als je net iets hebt gewijzigd."
          status={d.status}
          paramsStatus={p.paramsStatus}
          badges={p.badges}
        />
        <Planning jaar={d.jaar} invoer={d.invoer} variant={d.variant} varianten={p.varianten} andereJaren={andere.map((a) => ({ jaar: a.jaar, variant: a.variant, invoer: a.invoer }))} vandaag={new Date().toISOString().slice(0, 10)}
          status={d.status}
          ingediendOp={d.ingediend?.op ?? null}
        />
      </AangifteStaatProvider>
    </Container>
  )
}
