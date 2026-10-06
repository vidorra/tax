import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SITE } from '@/lib/site'

const BESCHRIJVING = 'De IB-calculator geeft een indicatieve berekening en geen fiscaal advies. Lees wat dat betekent.'

export const metadata: Metadata = {
  title: 'Disclaimer',
  description: BESCHRIJVING,
  alternates: { canonical: '/disclaimer/' },
  openGraph: { title: 'Disclaimer', description: BESCHRIJVING, url: '/disclaimer/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

export default function DisclaimerPagina() {
  return (
    <Container breedte="smal">
      <PageHeader kicker="Disclaimer" titel="Disclaimer" />
      <Alert variant="info" titel={`${SITE.disclaimer}.`} className="mb-8">
        De uitkomsten helpen je om je belasting te begrijpen en te plannen. Ze vervangen geen aangifte, aanslag of advies.
      </Alert>
      <div className="kb-prose">
        <h2>Indicatief</h2>
        <p>
          We doen ons best om de regels en bedragen correct en actueel te houden. Toch kan een berekening afwijken van je aanslag, bijvoorbeeld door afronding, een situatie die
          de tool niet kent, of een regel die na onze laatste update is veranderd. De Belastingdienst stelt je belasting vast, niet deze tool.
        </p>
        <h2>Voorstellen en schattingen</h2>
        <p>
          Voor toekomstige jaren rekent de tool met wetsvoorstellen en schattingen. Bij elk cijfer staat de status: definitief, voorlopig, voorstel, geschat of rechtspraak.
          Bedragen met de status voorstel of geschat kunnen nog veranderen, bijvoorbeeld na stemmingen in de Tweede en Eerste Kamer.
        </p>
        <h2>Geen advies</h2>
        <p>
          De tool geeft geen fiscaal, juridisch of financieel advies. Ook de meldingen en tips zijn algemeen. Neem belangrijke beslissingen, zoals een grote lijfrente-inleg,
          een investering of de overstap naar een BV, niet alleen op basis van deze berekening. Overleg met een belastingadviseur of controleer het bij de Belastingdienst.
        </p>
        <h2>Arbeidsrelatie</h2>
        <p>
          Waarschuwingen over opdrachtgevers, uurtarieven of de Wet DBA zijn signalen, geen oordeel. Of er sprake is van loondienst, hangt af van alle feiten en
          omstandigheden.
        </p>
        <h2>Aansprakelijkheid</h2>
        <p>
          We zijn niet aansprakelijk voor schade die ontstaat door het gebruik van deze tool of de informatie op deze site. Links naar externe bronnen zijn bedoeld ter
          verificatie; voor de inhoud daarvan zijn we niet verantwoordelijk.
        </p>
        <p>
          Meer over hoe de tool werkt, lees je op <Link href="/over">over deze tool</Link>.
        </p>
      </div>
    </Container>
  )
}
