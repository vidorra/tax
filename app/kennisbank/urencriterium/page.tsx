import Link from 'next/link'
import { ArtikelLayout, artikelMetadata } from '@/components/kennisbank/ArtikelLayout'
import { BRONNEN } from '@/components/kennisbank/bronnen-lijst'
import { Tabel } from '@/components/kennisbank/Tabel'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge } from '@/components/ui/StatusBadge'

const SLUG = 'urencriterium'

export const metadata = artikelMetadata(SLUG)

export default function Pagina() {
  return (
    <ArtikelLayout
      slug={SLUG}
      intro={
        <p>
          Voor de zelfstandigenaftrek en de startersaftrek moet je het urencriterium halen: minstens 1.225 uur per jaar aan je onderneming. Wat telt mee, wat als je met verlof
          bent, en hoe zit het met de Wet DBA?
        </p>
      }
      statusNoot={
        <p>
          Het urencriterium zelf staat vast. Over de Zelfstandigenwet loopt nog een consultatie; die wet is beoogd per 1 januari 2028 en kan nog veranderen.
        </p>
      }
      bronnen={[
        BRONNEN.wetIb,
        { titel: 'Hoge Raad 24 januari 2025, ECLI:NL:HR:2025:111 (bewijslast urencriterium)', url: 'https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:HR:2025:111' },
        BRONNEN.minfin2026,
        BRONNEN.bdHandhaving,
        BRONNEN.rechtsvermoeden,
        BRONNEN.zelfstandigenwet,
      ]}
    >
      <h2 id="wat">Wat is het urencriterium?</h2>
      <p>Je haalt het urencriterium als je in een kalenderjaar aan twee eisen voldoet:</p>
      <ol>
        <li>
          Je besteedt <strong>minstens 1.225 uur</strong> aan je onderneming.
        </li>
        <li>
          Je besteedt <strong>meer dan de helft</strong> van je totale werktijd aan je onderneming (het grotendeelscriterium). Werk je daarnaast in loondienst, dan moeten je
          ondernemersuren dus zwaarder wegen. Starters zijn de eerste vijf jaar vrijgesteld van deze tweede eis.
        </li>
      </ol>
      <p>
        Voor starters die arbeidsongeschikt zijn, geldt een verlaagd criterium van 800 uur voor de startersaftrek bij arbeidsongeschiktheid.
      </p>

      <h2 id="wat-telt">Welke uren tellen mee?</h2>
      <p>
        Niet alleen declarabele uren. Ook indirecte uren tellen mee, zoals acquisitie, administratie, offertes maken en bijscholing. Die indirecte uren vragen wel om een goede
        onderbouwing, zeker als ze een groot deel van je totaal zijn.
      </p>

      <h3 id="verlof">Zwangerschaps- en bevallingsverlof</h3>
      <p>
        De weken zwangerschaps- en bevallingsverlof, tot 16 weken, tellen mee als gewerkte uren (art. 3.6 lid 5 Wet IB 2001). Je rekent met het gemiddelde aantal uren dat je
        vóór het verlof per week aan je onderneming besteedde, en telt dat aantal voor elke verlofweek.
      </p>
      <p>
        Krijg je in die periode een zwangerschapsuitkering voor zelfstandigen (ZEZ) van het UWV? Die uitkering is loon, geen winst. Ze telt wel mee voor je arbeidsinkomen,
        bijvoorbeeld voor de arbeidskorting en de combinatiekorting.
      </p>

      <h2 id="bewijs">Jij moet het kunnen aantonen</h2>
      <p>
        Volgens de Hoge Raad (24 januari 2025) ligt de bewijslast bij de ondernemer. Twijfelt de Belastingdienst, dan moet jij laten zien dat je de uren hebt gemaakt. Een
        globale schatting achteraf is dan meestal niet genoeg.
      </p>
      <Alert variant="actie" titel="Houd je uren bij">
        Schrijf je uren door het jaar heen op, ook de indirecte. Een agenda, urenregistratie of facturen met tijdsbesteding helpen als je het later moet onderbouwen.
      </Alert>

      <h2 id="gevolgen">Wat hangt ervan af?</h2>
      <ul>
        <li>de zelfstandigenaftrek (2026: € 1.200, 2027: € 900);</li>
        <li>de startersaftrek;</li>
        <li>
          je fiscale oudedagsreserve (FOR): haal je het urencriterium twee jaar achter elkaar niet, dan neemt die verplicht af met het deel boven je ondernemingsvermogen. Zie{' '}
          <Link href="/kennisbank/jaarruimte-en-reserveringsruimte">jaarruimte en reserveringsruimte</Link>.
        </li>
      </ul>

      <h2 id="dba">Urencriterium en de Wet DBA zijn twee verschillende dingen</h2>
      <p>
        Het urencriterium gaat over je aftrekposten in de inkomstenbelasting. De Wet DBA gaat over de vraag of je bij een opdrachtgever eigenlijk in loondienst werkt. Je kunt
        ruim boven de 1.225 uur zitten en toch een arbeidsrelatie hebben die op loondienst lijkt.
      </p>
      <Tabel
        bijschrift="Handhaving van de Wet DBA"
        kop={['Jaar', 'Handhaving']}
        getallenVanaf={9}
        rijen={[
          ['2024', 'Handhavingsmoratorium'],
          ['2025', 'Moratorium opgeheven, nog geen boetes'],
          ['2026', 'Boetes alleen bij opzet of grove schuld'],
          ['2027', 'Reguliere handhaving, ook verzuimboetes'],
        ]}
      />
      <p>
        Vanaf 31 december 2026 geldt bovendien een rechtsvermoeden: bij een uurtarief van € 38 of minder wordt een arbeidsovereenkomst vermoed, tenzij het tegendeel blijkt
        (art. 7:610aa BW). Dat bedrag stijgt mee met het minimumloon. Goedgekeurde modelovereenkomsten blijven geldig tot en met 31 december 2029.
      </p>
      <p>
        Over de Zelfstandigenwet loopt van 1 tot en met 29 oktober 2026 een consultatie <StatusBadge status="voorstel" klein tooltip={false} />. Het voorstel introduceert een
        zelfstandigentoets, onder meer met minstens drie opdrachtgevers in twee jaar. De beoogde ingangsdatum is 1 januari 2028.
      </p>
      <p>
        De calculator geeft geen oordeel over je arbeidsrelatie. Wil je dat laten toetsen, gebruik dan de webmodule van de overheid of vraag een adviseur. Lees ook over de{' '}
        <Link href="/kennisbank/zelfstandigenaftrek-en-mkb-vrijstelling">zelfstandigenaftrek en de MKB-winstvrijstelling</Link>.
      </p>
    </ArtikelLayout>
  )
}
