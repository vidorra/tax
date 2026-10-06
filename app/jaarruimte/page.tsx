import type { Metadata } from 'next'
import { JaarruimteCalculator } from '@/components/deel/JaarruimteCalculator'
import { DeelPagina } from '@/components/deel/Opbouw'
import { artikelHref } from '@/components/kennisbank/artikelen'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatEuro, formatPct } from '@/components/ui/format'
import { STANDAARD_JAAR, getJaar } from '@/lib/tax/years'
import { SITE } from '@/lib/site'

const TITEL = 'Jaarruimte en reserveringsruimte berekenen'
const BESCHRIJVING =
  "Bereken hoeveel lijfrentepremie je als zzp'er mag aftrekken: jaarruimte, reserveringsruimte van tien jaar terug, wat het eerst vervalt en wat je inleg netto kost."

export const metadata: Metadata = {
  title: TITEL,
  description: BESCHRIJVING,
  alternates: { canonical: '/jaarruimte/' },
  openGraph: { title: TITEL, description: BESCHRIJVING, url: '/jaarruimte/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

export default function JaarruimtePagina() {
  const p = getJaar(STANDAARD_JAAR)
  const blok = p.inkomensvoorziening
  const lp = blok.waarde.lijfrente
  const status = blok.veldStatus?.lijfrente ?? blok.status
  return (
    <DeelPagina
      titel={TITEL}
      badge={status !== 'definitief' ? <StatusBadge status={status} /> : undefined}
      intro={
        <p>
          Lijfrentepremie mag je aftrekken binnen je jaarruimte. In {STANDAARD_JAAR} is dat {formatPct(lp.pct)} van je inkomen van vorig jaar, begrensd op{' '}
          {formatEuro(lp.inkomensgrens)} en verminderd met een franchise van {formatEuro(lp.franchise)}, met een maximum van {formatEuro(lp.maxJaarruimte)}. Jaarruimte die
          je niet gebruikt, kun je nog {lp.terugkijkJaren} jaar inhalen als reserveringsruimte, tot {formatEuro(lp.maxReserveringsruimte)} per jaar.
        </p>
      }
      lezen={[
        { href: artikelHref('jaarruimte-en-reserveringsruimte'), label: 'Jaarruimte en reserveringsruimte uitgelegd' },
        { href: artikelHref('wat-verandert-er-in-2027'), label: "Wat verandert er in 2027 voor zzp'ers?" },
      ]}
    >
      <JaarruimteCalculator />
    </DeelPagina>
  )
}
