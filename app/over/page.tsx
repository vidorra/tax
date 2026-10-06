import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SITE } from '@/lib/site'

const BESCHRIJVING = `Wat de ${SITE.naam} doet, hoe hij rekent en waar de cijfers vandaan komen.`

export const metadata: Metadata = {
  title: 'Over deze tool',
  description: BESCHRIJVING,
  alternates: { canonical: '/over/' },
  openGraph: { title: 'Over deze tool', description: BESCHRIJVING, url: '/over/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

export default function OverPagina() {
  return (
    <Container breedte="smal">
      <PageHeader kicker="Over" titel="Over deze tool" intro={<p>Een rekenhulp voor zzp&apos;ers die hun inkomstenbelasting willen begrijpen en narekenen.</p>} />
      <div className="kb-prose">
        <h2>Wat de tool doet</h2>
        <p>
          De calculator rekent je inkomstenbelasting door zoals een fiscaal rapport dat doet: van winst naar belastbare winst, box 1, 2 en 3, heffingskortingen en de
          Zvw-bijdrage. Bij elke regel zie je de formule met de echte getallen en de regel waar het getal vandaan komt. Zo kun je de uitkomst naast je aangifte of het rapport
          van je adviseur leggen.
        </p>
        <h2>Waar de cijfers vandaan komen</h2>
        <p>
          Alle bedragen en percentages staan per belastingjaar op één plek in de code, met een bron en een status. De bronnen zijn zoveel mogelijk primair: de bijlage
          Fiscale parameters van het ministerie van Financiën, de jaarpagina&apos;s van de Belastingdienst en publicaties in de Staatscourant en het Staatsblad.
        </p>
        <p>Elk cijfer heeft een van deze statussen:</p>
        <ul>
          <li>
            <strong>definitief</strong>: vastgesteld in wet of regeling;
          </li>
          <li>
            <strong>voorlopig</strong>: bekend, maar nog niet definitief (zoals de box 3-percentages voor bank en schulden);
          </li>
          <li>
            <strong>voorstel</strong>: staat in een wetsvoorstel dat nog in behandeling is;
          </li>
          <li>
            <strong>geschat</strong>: nog niet gepubliceerd en door ons geschat;
          </li>
          <li>
            <strong>rechtspraak</strong>: een regel die op uitspraken van de rechter berust.
          </li>
        </ul>
        <p>Als er nieuwe cijfers verschijnen, rond Prinsjesdag, in november, half december en in februari, werken we de jaren bij.</p>
        <h2>Wat de tool niet doet</h2>
        <ul>
          <li>Hij dient geen aangifte in. Dat doe je zelf in Mijn Belastingdienst of via je adviseur.</li>
          <li>Hij geeft geen fiscaal of juridisch advies, en geen oordeel over je arbeidsrelatie.</li>
          <li>Hij rekent niet met buitenlandse situaties, behalve de verrekening van buitenlandse bronbelasting op dividend.</li>
        </ul>
        <h2>Onafhankelijk</h2>
        <p>
          Deze tool is een onafhankelijk project en is niet verbonden aan de Belastingdienst of een andere overheidsinstantie. Lees ook de{' '}
          <Link href="/disclaimer">disclaimer</Link> en de <Link href="/privacy">privacyverklaring</Link>.
        </p>
      </div>
    </Container>
  )
}
