import Link from 'next/link'
import { ArtikelLayout, artikelMetadata } from '@/components/kennisbank/ArtikelLayout'
import { BRONNEN } from '@/components/kennisbank/bronnen-lijst'
import { Tabel } from '@/components/kennisbank/Tabel'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge } from '@/components/ui/StatusBadge'

const SLUG = 'jaarruimte-en-reserveringsruimte'

export const metadata = artikelMetadata(SLUG)

export default function Pagina() {
  return (
    <ArtikelLayout
      slug={SLUG}
      intro={
        <p>
          Als zzp&apos;er bouw je zelf pensioen op. Premies voor een lijfrente mag je aftrekken, binnen je jaarruimte en je reserveringsruimte. Hoe je die berekent, in welke
          volgorde je ze gebruikt en wat er met je oude oudedagsreserve kan.
        </p>
      }
      bronnen={[BRONNEN.bdLijfrente, BRONNEN.wetIb, BRONNEN.minfin2026, BRONNEN.minfin2024, BRONNEN.kennisgroepen, BRONNEN.bedragIneens, BRONNEN.baz36912]}
    >
      <h2 id="jaarruimte">Jaarruimte</h2>
      <p>
        De jaarruimte is het bedrag dat je in een jaar mag aftrekken voor lijfrentepremie. Je rekent met het inkomen van het jaar ervoor, de premiegrondslag:
      </p>
      <ol>
        <li>
          Tel op: je winst uit onderneming vóór ondernemersaftrek en MKB-winstvrijstelling, je loon, resultaat uit overig werk en periodieke uitkeringen van vorig jaar.
        </li>
        <li>Begrens dat op de inkomensgrens (€ 137.800).</li>
        <li>Trek de AOW-franchise af (2026: € 19.172).</li>
        <li>Neem 30% van wat overblijft.</li>
        <li>Trek je pensioenopbouw af als je ook in loondienst pensioen opbouwt (6,27 × factor A, of de Wtp-premie).</li>
      </ol>
      <p>
        De Belastingdienst rondt de uitkomst naar boven af op hele euro&apos;s. Een voorbeeld: 30% van een premiegrondslag van € 74.854 is € 22.456,20, en dat wordt € 22.457.
        Tot en met 2022 was het percentage 13,3% en gold een lager maximum; voor oude jaren reken je met de regels van dat jaar.
      </p>
      <Tabel
        bijschrift="Grenzen lijfrenteaftrek"
        kop={['', '2024', '2025', '2026', '2027']}
        rijen={[
          ['Percentage', '30%', '30%', '30%', '30%'],
          ['AOW-franchise', '€ 17.545', '€ 18.475', '€ 19.172', <span key="f">n.n.b. <StatusBadge status="geschat" klein tooltip={false} /></span>],
          ['Inkomensgrens', '€ 137.800', '€ 137.800', '€ 137.800', '€ 137.800'],
          ['Maximum jaarruimte', '€ 36.077', '€ 35.798', '€ 35.589', <span key="m">circa € 35.400 <StatusBadge status="geschat" klein tooltip={false} /></span>],
          ['Maximum reserveringsruimte', '€ 41.608', '€ 42.108', '€ 42.753', <span key="r">circa € 43.287 <StatusBadge status="geschat" klein tooltip={false} /></span>],
        ]}
        noot="Volgens het Belastingplan 2027 blijft de inkomensgrens van € 137.800 bevroren tot en met 2032 (voorstel). De franchise voor 2027 wordt geschat op circa € 19.550 à € 19.750."
      />

      <h2 id="reserveringsruimte">Reserveringsruimte</h2>
      <p>
        Jaarruimte die je niet gebruikt, vervalt niet meteen. Je mag hem tot tien jaar later alsnog benutten: dat heet reserveringsruimte. Per jaar is de aftrek uit
        reserveringsruimte begrensd (2026: € 42.753). Tot en met 2022 kon je zeven jaar terugkijken.
      </p>

      <h3 id="volgorde">Eerst je oudste reserveringsruimte</h3>
      <p>
        Leg je in, dan wijs je de premie eerst toe aan je reserveringsruimte, te beginnen bij het oudste jaar. Pas daarna gebruik je de jaarruimte van het jaar zelf. Dat is
        ook wat de Belastingdienst adviseert: zo voorkom je dat eerder opgebouwde ruimte verloren gaat. Ruimte uit 2022 vervalt in 2033, ruimte uit 2024 pas in 2035. De
        jaarruimte van dit jaar kun je later nog als reserveringsruimte gebruiken.
      </p>

      <h3 id="te-veel">Te veel ingelegd?</h3>
      <p>
        Het deel van je premie dat boven je jaarruimte en reserveringsruimte uitkomt, is niet aftrekbaar en schuift niet door naar een later jaar. Vraag in dat geval een
        verklaring niet-afgetrokken premies aan, zodat je later niet dubbel belasting betaalt. Gaat het om niet meer dan € 2.269 per jaar, dan kan dat ook via de saldomethode.
      </p>

      <h2 id="persoonlijk">Persoonlijk, niet te verdelen</h2>
      <p>
        Lijfrente- en AOV-premies zijn uitgaven voor inkomensvoorzieningen. Die blijven bij de partner die ze betaalt en kun je niet verdelen tussen fiscale partners, anders
        dan bijvoorbeeld de eigen woning of box 3. Elke partner heeft dus een eigen jaarruimte. Aftrek kan tot en met vijf jaar na het jaar waarin je de AOW-leeftijd bereikt.
      </p>
      <p>
        De aftrek valt niet onder de tariefmaatregel. Valt je inkomen in het toptarief, dan levert elke afgetrokken euro dus 49,5% op.
      </p>

      <h2 id="for">Je oude FOR omzetten</h2>
      <p>
        Sinds 2023 kun je niets meer toevoegen aan de fiscale oudedagsreserve (FOR). Een bestaande FOR blijft staan tot hij verplicht afneemt. Dat gebeurt bij staking van
        je onderneming, als je op 1 januari de AOW-leeftijd hebt bereikt, of als je twee jaar achter elkaar het urencriterium niet haalt. De FOR neemt dan af met het
        deel dat hoger is dan je ondernemingsvermogen aan het einde van het jaar (art. 3.70 Wet IB 2001 zoals dat eind 2022 luidde). Staak je de hele onderneming, dan
        valt alles vrij. Een FOR die hoger is dan je ondernemingsvermogen is op zichzelf geen reden voor een afname.
      </p>
      <p>
        Je kunt de FOR ook omzetten in een lijfrente. Die premie is aftrekbaar bovenop je jaarruimte en reserveringsruimte (art. 10a.29 lid 12 Wet IB 2001). De FOR valt dan
        vrij als winst, en de aftrek van de premie heft dat op. De premie moet uiterlijk 30 juni van het jaar erna zijn betaald.
      </p>

      <h2 id="aov">Arbeidsongeschiktheidsverzekering</h2>
      <p>
        Premies voor een echte arbeidsongeschiktheidsverzekering (AOV) zijn volledig aftrekbaar, los van je jaarruimte. Bij een schenkkring zoals een broodfonds werkt het
        anders: de vaste bijdrage is een bedrijfskost en de schenkingen zelf zijn niet aftrekbaar.
      </p>
      <p>
        Een verplichte basisverzekering voor zelfstandigen (wetsvoorstel 36912) is in de maak, maar komt er niet vóór 2030 <StatusBadge status="voorstel" klein tooltip={false} />.
      </p>

      <h2 id="boven-grens">Inkomen boven de grens</h2>
      <p>
        Verdien je meer dan € 137.800, dan bouw je over het meerdere geen aftrekbare ruimte op. Wel kun je een nettolijfrente afsluiten: geen aftrek, maar het opgebouwde
        kapitaal is vrijgesteld in box 3.
      </p>
      <p>
        Vanaf 1 januari 2029 mag je bij de ingang van een lijfrente of pensioen eenmalig 10% als bedrag ineens opnemen.
      </p>

      <Alert variant="actie" titel="Vóór 31 december">
        Premie die je uiterlijk 31 december betaalt, telt voor dit jaar. Reken eerst je ruimte uit, zodat je niet meer inlegt dan je kunt aftrekken.
      </Alert>
      <p>
        Bereken je eigen ruimte met de <Link href="/jaarruimte">jaarruimte-calculator</Link>.
      </p>
    </ArtikelLayout>
  )
}
