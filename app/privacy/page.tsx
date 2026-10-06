import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SITE } from '@/lib/site'

const BESCHRIJVING = 'Welke gegevens de IB-calculator verwerkt: de publieke calculator bewaart niets, het dossier is versleuteld en statistieken zijn zonder cookies.'

export const metadata: Metadata = {
  title: 'Privacy',
  description: BESCHRIJVING,
  alternates: { canonical: '/privacy/' },
  openGraph: { title: 'Privacy', description: BESCHRIJVING, url: '/privacy/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

export default function PrivacyPagina() {
  return (
    <Container breedte="smal">
      <PageHeader kicker="Privacy" titel="Privacy" intro={<p>Financiële gegevens zijn gevoelig. Daarom verwerken we zo weinig mogelijk, en wat we wel verwerken, leggen we hier uit.</p>} />
      <div className="kb-prose">
        <h2>De publieke calculator</h2>
        <p>
          Voor de calculator heb je geen account nodig. We bewaren je invoer niet op onze server. Als de berekening op de server draait, wordt je invoer alleen gebruikt om de
          uitkomst te berekenen en daarna niet opgeslagen. Voor je gemak kan je browser je laatste invoer lokaal onthouden (localStorage). Die gegevens blijven op je eigen
          apparaat en kun je wissen door je browsergegevens te verwijderen.
        </p>
        <p>
          Deel je een berekening via een link, dan staat je invoer in die link. Iedereen met de link kan de berekening zien, dus deel hem alleen met wie je vertrouwt.
        </p>
        <h2>Het dossier</h2>
        <p>Het dossier is bedoeld om je eigen situatie per jaar vast te leggen. Daarvoor gelden extra maatregelen:</p>
        <ul>
          <li>Inloggen gaat met een wachtwoord en een tweede factor (een code uit een authenticator-app).</li>
          <li>Je invoer wordt versleuteld opgeslagen. De database is niet van buitenaf bereikbaar.</li>
          <li>We vragen nooit om je BSN of volledige rekeningnummers. Rekeningen geef je een eigen naam, zoals &quot;spaarrekening&quot;.</li>
          <li>Je kunt je dossier exporteren en volledig laten verwijderen.</li>
        </ul>
        <h2>Statistieken zonder cookies</h2>
        <p>
          We meten het bezoek met Umami, op een eigen server. Umami gebruikt geen cookies en slaat geen IP-adressen of andere persoonsgegevens op. We sturen geen bedragen of
          andere invoer mee, ook niet via de link. Daardoor is er geen cookiebanner nodig.
        </p>
        <h2>Cookies</h2>
        <p>
          De publieke site plaatst geen cookies. Alleen als je inlogt in het dossier, gebruiken we een functionele cookie om je ingelogd te houden. Die is nodig om het dossier
          te laten werken en wordt niet gebruikt om je te volgen.
        </p>
        <h2>Je rechten</h2>
        <p>
          Je hebt op grond van de AVG het recht om je gegevens in te zien, te laten corrigeren en te laten verwijderen. Voor het dossier kan dat grotendeels zelf. Lees ook de{' '}
          <Link href="/disclaimer">disclaimer</Link>.
        </p>
      </div>
    </Container>
  )
}
