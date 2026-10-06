import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Alert, Container, PageHeader } from '@/components/ui'
import { configStatus } from '@/lib/auth/config'
import { eersteGebruiker } from '@/lib/auth/gebruiker'
import { getSessie } from '@/lib/auth/server'
import { databaseMelding } from '@/lib/dossier/pagina'
import { LoginFormulier } from '@/components/dossier/LoginFormulier'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { Disclaimer } from '@/components/dossier/Disclaimer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inloggen' }

export default async function LoginPagina() {
  const config = configStatus()
  if (!config.geconfigureerd) return <NietGeconfigureerd ontbreekt={config.ontbreekt} titel="Inloggen" />
  let setupNodig = false
  try {
    const u = await eersteGebruiker()
    setupNodig = !u?.totpEnabled
  } catch (e) {
    return <DatabaseFout melding={databaseMelding(e)} />
  }
  if (!setupNodig && (await getSessie())) redirect('/dossier/')

  return (
    <Container breedte="smal" className="max-w-md">
      <PageHeader kicker="Dossier" titel="Inloggen" intro="Je dossier is beveiligd met een wachtwoord en een code uit je authenticator-app." />
      {setupNodig ? (
        <Alert variant="actie" titel="Nog geen account">
          Er is nog geen account voor dit dossier.{' '}
          <Link href="/dossier/setup/" className="font-medium text-primary underline underline-offset-2 hover:text-primary-dark">
            Maak het account aan
          </Link>
          .
        </Alert>
      ) : (
        <LoginFormulier />
      )}
      <Disclaimer className="mt-6" />
    </Container>
  )
}
