import { Alert, Container, PageHeader } from '@/components/ui'

export function NietGeconfigureerd({ ontbreekt, titel = 'Privédossier' }: { ontbreekt: string[]; titel?: string }) {
  return (
    <Container breedte="smal" className="pb-16">
      <PageHeader kicker="Dossier" titel={titel} />
      <Alert variant="actie" titel="Het dossier is nog niet ingericht">
        <p>Het privédossier bewaart je gegevens versleuteld in een eigen database. Daarvoor zijn drie omgevingsvariabelen nodig:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <code className="rounded bg-white px-1 py-0.5 text-xs">DATABASE_URL</code>: de Postgres-verbinding
            {ontbreekt.includes('DATABASE_URL') && <strong className="font-medium"> (ontbreekt)</strong>}
          </li>
          <li>
            <code className="rounded bg-white px-1 py-0.5 text-xs">AUTH_SECRET</code>: een willekeurige tekst van minimaal 32 tekens voor de sessies
            {ontbreekt.includes('AUTH_SECRET') && <strong className="font-medium"> (ontbreekt of te kort)</strong>}
          </li>
          <li>
            <code className="rounded bg-white px-1 py-0.5 text-xs">DOSSIER_KEY</code>: 32 bytes als base64 voor de versleuteling
            {ontbreekt.includes('DOSSIER_KEY') && <strong className="font-medium"> (ontbreekt of ongeldig)</strong>}
          </li>
        </ul>
        <p className="mt-3">Een sleutel maak je met:</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 text-xs">node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;</pre>
        <p className="mt-3">Maak daarna de tabellen aan:</p>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-2 text-xs">npm run db:migrate</pre>
      </Alert>
    </Container>
  )
}

export function DatabaseFout({ melding }: { melding: string }) {
  return (
    <Container breedte="smal" className="pb-16">
      <PageHeader kicker="Dossier" titel="Privédossier" />
      <Alert variant="let-op" titel="Het dossier is niet bereikbaar">
        <p>{melding}</p>
        <p className="mt-2">
          Bestaan de tabellen nog niet, voer dan <code className="rounded bg-white px-1 py-0.5 text-xs">npm run db:migrate</code> uit.
        </p>
      </Alert>
    </Container>
  )
}
