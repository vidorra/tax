import type { Metadata } from 'next'
import { MiddelingCalculator } from '@/components/deel/MiddelingCalculator'
import { DeelPagina } from '@/components/deel/Opbouw'
import { artikelHref } from '@/components/kennisbank/artikelen'
import { formatEuro } from '@/components/ui/format'
import { STANDAARD_JAAR, getJaar } from '@/lib/tax/years'
import { SITE } from '@/lib/site'

const TITEL = 'Middeling 2022 tot en met 2024 berekenen'
const BESCHRIJVING =
  'Wisselde je inkomen sterk tussen 2022 en 2024? Bereken of middeling belasting terugbrengt, hoe de drempel werkt en tot wanneer je het verzoek kunt indienen.'

export const metadata: Metadata = {
  title: TITEL,
  description: BESCHRIJVING,
  alternates: { canonical: '/middeling/' },
  openGraph: { title: TITEL, description: BESCHRIJVING, url: '/middeling/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

export default function MiddelingPagina() {
  const m = getJaar(STANDAARD_JAAR).overig.waarde.middeling
  const [eerste, , laatste] = m.laatsteTijdvak
  return (
    <DeelPagina
      titel={TITEL}
      intro={
        <p>
          Met middeling rekent de Belastingdienst je box 1-belasting over drie aaneengesloten jaren opnieuw uit, alsof je elk jaar het gemiddelde had verdiend. Wie een jaar
          veel en een jaar weinig verdiende, betaalt daardoor soms te veel. Het verschil boven een drempel van {formatEuro(m.drempel)} krijg je terug. {eerste} tot en met{' '}
          {laatste} is het laatste tijdvak: daarna is de regeling afgeschaft. Je hebt {m.termijnMaanden} maanden na de laatste definitieve aanslag om het aan te vragen.
        </p>
      }
      lezen={[
        { href: artikelHref('wat-verandert-er-in-2027'), label: "Wat verandert er in 2027 voor zzp'ers?" },
        { href: '/kennisbank/', label: 'Alle artikelen in de kennisbank' },
      ]}
    >
      <MiddelingCalculator />
    </DeelPagina>
  )
}
