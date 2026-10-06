import { Calculator, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { SITE, absoluteUrl, pad } from '@/lib/site'
import { Alert } from '../ui/Alert'
import { ButtonLink } from '../ui/Button'
import { Container } from '../ui/Container'
import { formatDatum } from '../ui/format'
import { StatusBadge } from '../ui/StatusBadge'
import { ArtikelKaart } from './ArtikelKaart'
import { ARTIKELEN, artikelHref, vindArtikel } from './artikelen'
import { Bronnen } from './Bronnen'
import type { BronLink } from './Bronnen'

/** Metadata van een artikelpagina, uit het register. */
export function artikelMetadata(slug: string): Metadata {
  const a = vindArtikel(slug)
  const href = pad(artikelHref(slug))
  return {
    title: a.titel,
    description: a.beschrijving,
    alternates: { canonical: href },
    openGraph: {
      type: 'article',
      title: a.titel,
      description: a.beschrijving,
      url: href,
      siteName: SITE.naam,
      locale: SITE.locale,
      modifiedTime: a.bijgewerkt,
    },
  }
}

export interface ArtikelLayoutProps {
  slug: string
  intro: ReactNode
  /** Toon bovenaan een notitie als de inhoud afhangt van een voorstel. */
  statusNoot?: ReactNode
  bronnen: BronLink[]
  children: ReactNode
}

export function ArtikelLayout({ slug, intro, statusNoot, bronnen, children }: ArtikelLayoutProps) {
  const a = vindArtikel(slug)
  const gerelateerd = a.gerelateerd.map((s) => ARTIKELEN.find((x) => x.slug === s)).filter((x): x is NonNullable<typeof x> => Boolean(x))
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: a.titel,
        description: a.beschrijving,
        dateModified: a.bijgewerkt,
        inLanguage: 'nl-NL',
        mainEntityOfPage: absoluteUrl(artikelHref(slug)),
        publisher: { '@type': 'Organization', name: SITE.naam, url: absoluteUrl('/') },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Kennisbank', item: absoluteUrl('/kennisbank') },
          { '@type': 'ListItem', position: 3, name: a.kortTitel, item: absoluteUrl(artikelHref(slug)) },
        ],
      },
    ],
  }

  return (
    <Container breedte="smal" as="article">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <nav aria-label="Kruimelpad" className="mb-4 text-sm text-gray-500">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/kennisbank" className="transition-colors hover:text-primary">
              Kennisbank
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li aria-current="page" className="text-gray-700">
            {a.kortTitel}
          </li>
        </ol>
      </nav>

      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-primary">{a.categorie}</span>
          {a.status && <StatusBadge status={a.status} tooltipKant="links" />}
        </div>
        <h1 className="text-2xl font-semibold leading-tight text-gray-900 sm:text-3xl">{a.titel}</h1>
        <p className="mt-2 text-xs text-gray-500">
          Bijgewerkt op <time dateTime={a.bijgewerkt}>{formatDatum(a.bijgewerkt)}</time> · {a.leestijdMinuten} minuten lezen
        </p>
        <div className="mt-4 text-lg leading-relaxed text-gray-700">{intro}</div>
      </header>

      {statusNoot && (
        <Alert variant="info" titel="Nog niet alles staat vast" className="mb-8">
          {statusNoot}
        </Alert>
      )}

      <div className="kb-prose">{children}</div>

      <aside aria-label="Rekenen" className="mt-12 flex flex-col gap-4 rounded-2xl border-2 border-primary/30 bg-white p-5 shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calculator className="h-5 w-5" />
          </span>
          <div>
            <p className="font-medium text-gray-900">Reken het na met je eigen cijfers</p>
            <p className="mt-0.5 text-sm text-gray-600">Met uitleg per regel en bij elk cijfer of het al vaststaat.</p>
          </div>
        </div>
        <ButtonLink href={a.calculator.href} className="flex-shrink-0">
          {a.calculator.label}
        </ButtonLink>
      </aside>

      <Bronnen bronnen={bronnen} />

      <p className="mt-6 text-xs leading-relaxed text-gray-500">
        {SITE.disclaimer}. Deze uitleg is algemeen en houdt geen rekening met jouw situatie. Bedragen kunnen nog wijzigen door nieuwe wetgeving of rechtspraak.
      </p>

      {gerelateerd.length > 0 && (
        <section aria-labelledby="gerelateerd-titel" className="mt-12">
          <h2 id="gerelateerd-titel" className="mb-4 text-lg font-semibold text-gray-900">
            Verder lezen
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {gerelateerd.map((g) => (
              <ArtikelKaart key={g.slug} artikel={g} kopNiveau="h3" />
            ))}
          </div>
        </section>
      )}
    </Container>
  )
}
