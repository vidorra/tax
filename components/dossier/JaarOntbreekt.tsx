import { Alert, ButtonLink, Container, PageHeader } from '@/components/ui'

export function JaarOntbreekt({ jaar }: { jaar: number }) {
  return (
    <Container breedte="smal">
      <PageHeader kicker="Dossier" titel={`Geen dossier voor ${jaar}`} />
      <Alert variant="actie">
        <p>Er staat nog geen {jaar} in je dossier. Voeg het jaar toe op het overzicht: leeg, als kopie van het vorige jaar of met de voorbeeldaangifte.</p>
        <ButtonLink href="/dossier/" grootte="sm" className="mt-3">
          Naar het overzicht
        </ButtonLink>
      </Alert>
    </Container>
  )
}
