import Link from 'next/link'
import { Alert, Container, PageHeader } from '@/components/ui'
import { configStatus } from '@/lib/auth/config'
import { setupAfgerond } from '@/lib/auth/gebruiker'
import { databaseMelding } from '@/lib/dossier/pagina'
import { SetupFormulier } from '@/components/dossier/SetupFormulier'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { Disclaimer } from '@/components/dossier/Disclaimer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Account maken' }

export default async function SetupPagina() {
  const config = configStatus()
  if (!config.geconfigureerd) return <NietGeconfigureerd ontbreekt={config.ontbreekt} titel="Account maken" />
  let afgerond = false
  try {
    afgerond = await setupAfgerond()
  } catch (e) {
    return <DatabaseFout melding={databaseMelding(e)} />
  }
  return (
    <Container breedte="smal" className="max-w-md">
      <PageHeader
        kicker="Dossier"
        titel="Account maken"
        intro="Dit eerste account wordt de beheerder; daarna nodig je anderen uit voor een eigen dossier. Je gegevens worden versleuteld opgeslagen en zijn alleen bereikbaar met je wachtwoord en een code uit je authenticator-app."
      />
      {afgerond ? (
        <Alert variant="info" titel="Er is al een account">
          Dit dossier is al ingericht.{' '}
          <Link href="/dossier/login/" className="font-medium text-primary underline underline-offset-2 hover:text-primary-dark">
            Ga naar inloggen
          </Link>
          .
        </Alert>
      ) : (
        <SetupFormulier />
      )}
      <Disclaimer className="mt-6" />
    </Container>
  )
}
