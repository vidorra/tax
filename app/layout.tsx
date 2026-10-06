import type { Metadata, Viewport } from 'next'
import { Lexend_Deca } from 'next/font/google'
import type { ReactNode } from 'react'
import Layout from '@/components/Layout'
import UmamiScript from '@/components/UmamiScript'
import { SITE, absoluteUrl } from '@/lib/site'
import './globals.css'

const lexendDeca = Lexend_Deca({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
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
