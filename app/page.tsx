import { BookOpen, Calculator } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { IbCalculator } from '@/components/calculator/IbCalculator'
import { artikelHref } from '@/components/kennisbank/artikelen'
import { Container } from '@/components/ui/Container'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { REKENTOOLS, SITE, absoluteUrl, pad } from '@/lib/site'
import { STANDAARD_JAAR, getJaar, laagsteStatus } from '@/lib/tax/years'

export const metadata: Metadata = {
  title: { absolute: SITE.titel },
  description: SITE.beschrijving,
  alternates: { canonical: '/' },
}

const webApplicatie = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE.naam,
  description: SITE.beschrijving,
  url: absoluteUrl('/'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Alle',
  inLanguage: 'nl-NL',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
}

const BLOKKEN = [
  {
    slug: 'wat-verandert-er-in-2027',
    titel: 'Wat verandert er in 2027?',
    tekst: 'De zelfstandigenaftrek daalt naar € 900, box 1 krijgt nieuwe tarieven en voor box 3 liggen twee varianten op tafel. Per maatregel wat vaststaat en wat nog voorstel is.',
  },
  {
    slug: 'combinatiekorting-iack',
    titel: 'Combinatiekorting voor zzp-ouders',
    tekst: 'Werk je en heb je een kind jonger dan 12? Dan heb je mogelijk recht op de inkomensafhankelijke combinatiekorting. Bij partners krijgt de minstverdienende hem.',
  },
  {
    slug: 'jaarruimte-en-reserveringsruimte',
    titel: 'Jaarruimte en lijfrente',
    tekst: 'Met een lijfrentepremie binnen je jaarruimte verlaag je je belastbaar inkomen. Lees hoe je de ruimte berekent en waarom je oude reserveringsruimte eerst gebruikt.',
  },
]

export default function Home() {
  const status = laagsteStatus(getJaar(STANDAARD_JAAR))
  const deelCalculators = REKENTOOLS.filter((t) => t.href !== '/')

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicatie) }} />
      <Container breedte="breed">
        <header className="mb-6 max-w-3xl sm:mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
              <Calculator aria-hidden="true" className="h-4 w-4" />
              Inkomstenbelasting {STANDAARD_JAAR}
            </span>
            {status !== 'definitief' && <StatusBadge status={status} />}
          </div>
          <h1 className="text-2xl font-semibold leading-tight text-gray-900 sm:text-3xl">Bereken je inkomstenbelasting als zzp&apos;er</h1>
          <p className="mt-3 text-base leading-relaxed text-gray-600">
            Vul je omzet en kosten in en zie direct wat je aan inkomstenbelasting en Zvw betaalt, met de opbouw per regel zoals in een fiscaal rapport. Ook voor 2027 en met je
            partner, kinderen, woning en vermogen.
          </p>
          <p className="mt-2 text-xs text-gray-500">{SITE.disclaimer}.</p>
        </header>

        <IbCalculator />

        <section aria-labelledby="meer-weten" className="mt-12">
          <h2 id="meer-weten" className="mb-4 text-lg font-semibold text-gray-900">
            Meer weten
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {BLOKKEN.map((b) => (
              <article key={b.slug} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-base font-medium text-gray-900">{b.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{b.tekst}</p>
                <Link
                  href={pad(artikelHref(b.slug))}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:text-primary-dark hover:underline"
                >
                  <BookOpen aria-hidden="true" className="h-4 w-4" />
                  Lees het artikel<span className="sr-only">: {b.titel}</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="rekentools" className="mt-10">
          <h2 id="rekentools" className="mb-2 text-lg font-semibold text-gray-900">
            Losse rekentools
          </h2>
          <p className="mb-4 text-sm text-gray-600">Wil je één onderdeel uitzoeken? Deze tools rekenen met dezelfde rekenkern.</p>
          <ul className="flex flex-wrap gap-2">
            {deelCalculators.map((t) => (
              <li key={t.href}>
                <Link
                  href={pad(t.href)}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:border-primary hover:text-primary"
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Container>
    </>
  )
}
