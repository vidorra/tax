import { Container } from '@/components/ui'
import { AccountantCheck } from '@/components/dossier/AccountantCheck'
import { JaarKop } from '@/components/dossier/JaarKop'
import { JaarOntbreekt } from '@/components/dossier/JaarOntbreekt'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { laadJaarPagina } from '@/lib/dossier/jaar-pagina'
import { laadAccountant } from '@/lib/dossier/opslag'
import { databaseMelding } from '@/lib/dossier/pagina'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ jaar: string }> }

export async function generateMetadata({ params }: Props) {
  return { title: `Accountantscheck ${(await params).jaar}` }
}

export default async function AccountantPagina({ params }: Props) {
  const p = await laadJaarPagina((await params).jaar)
  if (p.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={p.ontbreekt} />
  if (p.soort === 'fout') return <DatabaseFout melding={p.melding} />
  if (p.soort === 'leeg') return <JaarOntbreekt jaar={p.jaar} />
  const d = p.detail
  let doc
  try {
    doc = await laadAccountant(p.householdId, d.jaar)
  } catch (e) {
    return <DatabaseFout melding={databaseMelding(e)} />
  }
  return (
    <Container breedte="normaal">
      <JaarKop
        jaar={d.jaar}
        tab="accountant"
        titel={`Accountantscheck ${d.jaar}`}
        intro="Neem de bedragen uit het fiscaal rapport of de aangifte van je accountant over. Je ziet per regel het verschil met de berekening."
        status={d.status}
        paramsStatus={p.paramsStatus}
        badges={p.badges}
      />
      <AccountantCheck jaar={d.jaar} invoer={d.invoer} variant={d.variant} regels={doc?.regels ?? {}} />
    </Container>
  )
}
