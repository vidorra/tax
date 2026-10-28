import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Container, PageHeader } from '@/components/ui'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { AccountsBeheer } from '@/components/beheer/AccountsBeheer'
import { gebruikerOpId, isBeheerder } from '@/lib/auth/gebruiker'
import { databaseMelding, paginaContext } from '@/lib/dossier/pagina'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accounts', robots: { index: false, follow: false } }

export default async function BeheerPagina() {
  const ctx = await paginaContext()
  if (ctx.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={ctx.ontbreekt} />
  if (ctx.soort === 'fout') return <DatabaseFout melding={ctx.melding} />
  let beheerder = false
  try {
    beheerder = isBeheerder(await gebruikerOpId(ctx.userId))
  } catch (e) {
    return <DatabaseFout melding={databaseMelding(e)} />
  }
  if (!beheerder) redirect('/dossier/')
  return (
    <Container breedte="normaal">
      <PageHeader
        kicker="Beheer"
        titel="Accounts"
        intro="Nodig mensen uit voor een eigen dossier. Elk account ziet alleen zijn eigen gegevens; ook als beheerder kun je niet in andermans dossier kijken. Een herstellink gaat daarom altijd per mail naar het account zelf."
      />
      <AccountsBeheer />
      <p className="mt-6 text-sm text-gray-600">
        <Link href="/dossier/" className="font-medium text-primary underline underline-offset-2 hover:text-primary-dark">
          Terug naar je dossier
        </Link>
      </p>
    </Container>
  )
}
