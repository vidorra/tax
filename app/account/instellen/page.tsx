import Link from 'next/link'
import { Container, PageHeader } from '@/components/ui'
import { configStatus } from '@/lib/auth/config'
import { InstellenFormulier } from '@/components/account/InstellenFormulier'
import { NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { Disclaimer } from '@/components/dossier/Disclaimer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Account instellen', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

export default function InstellenPagina() {
  const config = configStatus()
  if (!config.geconfigureerd) return <NietGeconfigureerd ontbreekt={config.ontbreekt} titel="Account instellen" />
  return (
    <Container breedte="smal" className="max-w-md">
      <PageHeader
        kicker="Dossier"
        titel="Account instellen"
        intro="Je kiest een wachtwoord en koppelt een authenticator-app. Daarna kom je direct in je eigen dossier, dat versleuteld wordt opgeslagen en alleen voor jou zichtbaar is."
      />
      <InstellenFormulier />
      <p className="mt-4 text-sm text-gray-600">
        Hoe de tool werkt, lees je in de{' '}
        <Link href="/handleiding/" className="font-medium text-primary underline underline-offset-2 hover:text-primary-dark">
          handleiding
        </Link>
        .
      </p>
      <Disclaimer className="mt-6" />
    </Container>
  )
}
