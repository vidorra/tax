import type { Metadata } from 'next'
import { ArtikelKaart } from '@/components/kennisbank/ArtikelKaart'
import { ARTIKELEN } from '@/components/kennisbank/artikelen'
import { Alert } from '@/components/ui/Alert'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SITE, absoluteUrl } from '@/lib/site'

const BESCHRIJVING =
  "Uitleg over inkomstenbelasting voor zzp'ers: wat er in 2027 verandert, de combinatiekorting, box 3, jaarruimte, zelfstandigenaftrek, kinderopvangtoeslag en het urencriterium."

export const metadata: Metadata = {
  title: "Kennisbank inkomstenbelasting voor zzp'ers",
  description: BESCHRIJVING,
  alternates: { canonical: '/kennisbank/' },
  openGraph: { title: "Kennisbank inkomstenbelasting voor zzp'ers", description: BESCHRIJVING, url: '/kennisbank/', siteName: SITE.naam, locale: SITE.locale },
}

export default function KennisbankPagina() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: "Kennisbank inkomstenbelasting voor zzp'ers",
    description: BESCHRIJVING,
    url: absoluteUrl('/kennisbank'),
    inLanguage: 'nl-NL',
    hasPart: ARTIKELEN.map((a) => ({ '@type': 'Article', headline: a.titel, url: absoluteUrl(`/kennisbank/${a.slug}`) })),
  }
  return (
    <Container breedte="breed">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <PageHeader
        kicker="Kennisbank"
        titel="Inkomstenbelasting voor zzp'ers, uitgelegd"
        intro={
          <p>
            Korte artikelen over de regels achter de berekening. Elk artikel noemt de bronnen en zegt erbij als een bedrag nog een voorstel is.
          </p>
        }
      />

      <Alert variant="info" className="mb-8">
        Bij elk cijfer staat hoe zeker het is. <StatusBadge status="definitief" tooltip={false} klein /> staat in de wet,{' '}
        <StatusBadge status="voorstel" tooltip={false} klein /> hangt af van de stemming in de Tweede Kamer op 12 november en de Eerste Kamer op 15 december 2026,{' '}
        <StatusBadge status="geschat" tooltip={false} klein /> is nog niet gepubliceerd.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ARTIKELEN.map((a) => (
          <ArtikelKaart key={a.slug} artikel={a} />
        ))}
      </div>
    </Container>
  )
}
