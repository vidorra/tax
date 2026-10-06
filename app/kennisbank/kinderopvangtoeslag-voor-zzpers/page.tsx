import Link from 'next/link'
import { ArtikelLayout, artikelMetadata } from '@/components/kennisbank/ArtikelLayout'
import { BRONNEN } from '@/components/kennisbank/bronnen-lijst'
import { Tabel } from '@/components/kennisbank/Tabel'
import { Alert } from '@/components/ui/Alert'

const SLUG = 'kinderopvangtoeslag-voor-zzpers'

export const metadata = artikelMetadata(SLUG)

export default function Pagina() {
  return (
    <ArtikelLayout
      slug={SLUG}
      intro={
        <p>
          De kinderopvangtoeslag hangt af van je gezamenlijke inkomen in het jaar zelf. Voor zzp&apos;ers is dat lastig, want je winst ken je pas achteraf. Hoe de toeslag werkt,
          wat er in 2027 verandert en wat er vanaf 2029 gepland is.
        </p>
      }
      statusNoot={
        <p>
          De bedragen voor 2027 komen uit de plannen van Prinsjesdag 2026. Het definitieve besluit kinderopvangtoeslag 2027 verschijnt half oktober 2026 in het Staatsblad. De
          stelselwijziging per 2029 is een wetsvoorstel.
        </p>
      }
      bronnen={[BRONNEN.kot2026, BRONNEN.toeslagenkaart2026, BRONNEN.szw2027, BRONNEN.kotStelsel, BRONNEN.belastingplan2027]}
    >
      <h2 id="hoe-werkt-het">Hoe de toeslag werkt</h2>
      <p>Per kind krijg je een percentage van de opvangkosten vergoed. Dat percentage hangt af van:</p>
      <ul>
        <li>
          je <strong>toetsingsinkomen</strong>: het verzamelinkomen van jou en je toeslagpartner samen in dat jaar;
        </li>
        <li>
          het <strong>kind</strong>: voor het eerste kind is het percentage lager dan voor de volgende kinderen;
        </li>
        <li>
          de <strong>maximum uurprijs</strong>: boven dat uurtarief betaal je alles zelf.
        </li>
      </ul>
      <p>
        Je krijgt toeslag voor maximaal 230 uur per kind per maand. Sinds 2023 hoeven die uren niet meer te passen bij het aantal uren dat je werkt. Voor de
        kinderopvangtoeslag geldt geen vermogensgrens.
      </p>

      <h2 id="bedragen">Bedragen 2026 en 2027</h2>
      <Tabel
        bijschrift="Kinderopvangtoeslag in hoofdlijnen"
        kop={['', '2026', '2027']}
        rijen={[
          ['Maximum uurprijs dagopvang', '€ 11,23', '€ 11,60'],
          ['Maximum uurprijs buitenschoolse opvang', '€ 9,98', '€ 10,31'],
          ['Maximum uurprijs gastouderopvang', '€ 8,49', '€ 8,77'],
          ['96% vergoed tot toetsingsinkomen (eerste kind)', '€ 56.412', '€ 71.903'],
          ['Laagste percentage eerste kind', '36,5% vanaf € 165.658', '39,1% vanaf circa € 179.459'],
          ['Laagste percentage volgende kinderen', '68,2% vanaf € 235.698', 'circa 69,7% vanaf circa € 243.877'],
          ['Maximaal aantal uren per kind per maand', '230', '230'],
        ]}
        noot="2027 is een voorstel. Tussen € 71.904 en € 175.430 ligt het percentage voor het eerste kind in 2027 ongeveer 5,1 procentpunt hoger dan in 2026."
      />

      <h3 id="voorbeeld">Rekenvoorbeeld 2026</h3>
      <p>
        Drie dagen dagopvang van 11 uur, gemiddeld 4,33 weken per maand, is 143 uur. Tegen € 11,23 per uur kost dat € 1.606 per maand. Bij het laagste percentage van 36,5%
        is de toeslag € 586 en betaal je zelf € 1.020 per maand.
      </p>

      <h2 id="zzp">Waar zzp&apos;ers op letten</h2>
      <ul>
        <li>
          <strong>Schat je inkomen realistisch in.</strong> De toeslag wordt als voorschot betaald op basis van het inkomen dat je opgeeft. Na de aanslag inkomstenbelasting
          volgt de definitieve berekening. Heb je te laag geschat, dan moet je terugbetalen.
        </li>
        <li>
          <strong>Je verzamelinkomen telt, niet je omzet.</strong> Het gaat om je winst na ondernemersaftrek en MKB-winstvrijstelling, min je lijfrentepremie, plus je
          inkomen uit box 2 en 3. Extra inleg in je lijfrente verlaagt je toetsingsinkomen en kan zo je toeslag verhogen.
        </li>
        <li>
          <strong>Box 3 telt mee.</strong> Lever je tegenbewijs in box 3, dan telt het lagere werkelijke rendement ook voor de toeslag.
        </li>
        <li>
          <strong>Vraag op tijd aan.</strong> Je kunt maximaal drie maanden terug aanvragen. Vraag je later aan, dan mis je toeslag over de eerste maanden.
        </li>
      </ul>

      <Alert variant="actie" titel="Inkomen veranderd?">
        Pas je geschatte inkomen bij Toeslagen aan zodra je ziet dat je winst flink afwijkt. Dan is de kans op een grote terugbetaling achteraf kleiner.
      </Alert>

      <h2 id="2029">Vanaf 2029: nieuwe financiering</h2>
      <p>
        Per 1 januari 2029 wil het kabinet de kinderopvang anders financieren. Alle werkende ouders krijgen dan 95,6% vergoed, ongeacht hun inkomen, en het geld gaat
        rechtstreeks naar de opvangorganisatie. Je betaalt zelf een eigen bijdrage van 4,4%, plus alles boven de maximum uurprijs. Het wetsvoorstel ligt sinds 21 september
        2026 bij de Raad van State.
      </p>
      <p>
        Wil je weten wat je kunt verwachten? Gebruik de <Link href="/kinderopvangtoeslag">kinderopvangtoeslag-calculator</Link>, en lees ook over de{' '}
        <Link href="/kennisbank/combinatiekorting-iack">combinatiekorting</Link>.
      </p>
    </ArtikelLayout>
  )
}
