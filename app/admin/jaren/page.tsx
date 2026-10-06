import type { Metadata } from 'next'
import { ParameterViewer } from '@/components/deel/ParameterViewer'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

export const metadata: Metadata = {
  title: 'Jaarparameters',
  description: 'Alle fiscale parameters per belastingjaar, met status, bron, wijzigingen en verschillen tussen jaren. Alleen lezen.',
  robots: { index: false, follow: false },
}

export default function JarenPagina() {
  return (
    <Container breedte="normaal">
      <PageHeader
        kicker="Beheer"
        titel="Jaarparameters"
        intro={
          <p>
            Alle cijfers waarmee de calculator rekent, per belastingjaar en per blok. Bij elk blok staat de status, de bron en een toelichting. Waar een veld een eigen status
            heeft, staat die erbij. Deze pagina is alleen om te lezen: wijzigingen gaan via de jaarbestanden in de code.
          </p>
        }
      />
      <ParameterViewer />
    </Container>
  )
}
