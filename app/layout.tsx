import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import Layout from '@/components/Layout'
import UmamiScript from '@/components/UmamiScript'
import { SITE, absoluteUrl } from '@/lib/site'
import './globals.css'

// Lexend Deca staat in de repository (variabel, 300 tot 700, Latijn; OFL-licentie in app/fonts/OFL.txt). Zo hangt de
// build niet af van Google Fonts: de loader van next/font/google faalde in GitHub Actions op een antwoord van Google.
const lexendDeca = localFont({
  src: './fonts/LexendDeca-latin.woff2',
  weight: '300 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-lexend-deca',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: SITE.themaKleur,
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.titel,
    template: `%s | ${SITE.naam}`,
  },
  description: SITE.beschrijving,
  applicationName: SITE.naam,
  // Geen canonical op siteniveau: elke pagina zet haar eigen canonical.
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    siteName: SITE.naam,
    title: SITE.titel,
    description: SITE.beschrijving,
    url: '/',
  },
  // Alleen het kaarttype: titel en beschrijving per pagina komen uit og:title en og:description.
  twitter: { card: 'summary' },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.naam,
  description: SITE.beschrijving,
  url: absoluteUrl('/'),
  inLanguage: 'nl-NL',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={lexendDeca.variable}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
        <Layout>{children}</Layout>
        <UmamiScript />
      </body>
    </html>
  )
}
