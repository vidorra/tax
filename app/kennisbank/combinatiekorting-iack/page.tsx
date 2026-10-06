import Link from 'next/link'
import { ArtikelLayout, artikelMetadata } from '@/components/kennisbank/ArtikelLayout'
import { BRONNEN } from '@/components/kennisbank/bronnen-lijst'
import { Tabel } from '@/components/kennisbank/Tabel'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge } from '@/components/ui/StatusBadge'

const SLUG = 'combinatiekorting-iack'

export const metadata = artikelMetadata(SLUG)

export default function Pagina() {
  return (
    <ArtikelLayout
      slug={SLUG}
      intro={
        <p>
          De inkomensafhankelijke combinatiekorting (IACK) is een heffingskorting voor werkende ouders met een jong kind. Voor zzp-ouders kan die oplopen tot € 3.032 in 2026.
          Er is geen geboortedatumgrens: ook ouders van kinderen die vanaf 2025 zijn geboren hebben recht.
        </p>
      }
      statusNoot={
        <p>
          De verlaging van de IACK vanaf 2027 staat in de wet. De precieze bedragen voor 2027 (drempel € 6.316, maximum € 2.918) komen uit het Belastingplan 2027 en worden pas
          definitief als de Eerste Kamer op 15 december 2026 instemt.
        </p>
      }
      bronnen={[BRONNEN.bdIack, BRONNEN.amendementIack, BRONNEN.bdArbeidsinkomen, BRONNEN.minfin2026, BRONNEN.belastingplan2027, BRONNEN.wetIb]}
    >
      <h2 id="geen-grens">Geen geboortedatumgrens meer</h2>
      <p>
        Lange tijd stond in de wet dat alleen kinderen die vóór 1 januari 2025 zijn geboren recht gaven op de IACK. Die grens is geschrapt met het amendement Grinwis c.s. bij
        het Belastingplan 2024. In plaats daarvan bouwt de korting voor alle ouders af: vanaf 2027 daalt het maximum elk jaar, tot de regeling op 1 januari 2035 vervalt.
      </p>

      <h2 id="voorwaarden">De voorwaarden</h2>
      <ul>
        <li>
          Je kind is op 1 januari van het jaar <strong>jonger dan 12 jaar</strong>.
        </li>
        <li>
          Je kind hoort <strong>ten minste zes maanden</strong> van dat kalenderjaar bij je huishouden (staat op je adres ingeschreven). Bij co-ouderschap moet het kind
          minimaal 156 dagen in elk huishouden wonen.
        </li>
        <li>
          Je <strong>arbeidsinkomen</strong> is hoger dan de drempel (2026: € 6.239).
        </li>
        <li>
          Heb je een fiscale partner, dan krijgt alleen <strong>de partner met het laagste arbeidsinkomen</strong> de korting.
        </li>
      </ul>

      <h3 id="zes-maanden">De zesmaandenregel bij een geboorte</h3>
      <p>
        De zes maanden tellen vanaf de inschrijving van je kind op je adres. Wordt je kind bijvoorbeeld eind juli geboren, dan hoort het dat jaar minder dan zes maanden bij
        je huishouden en is er in het geboortejaar geen recht. Het jaar daarna wel, en dan voor het hele jaar. Bij een geboorte in de eerste helft van het jaar haal je de zes
        maanden in het geboortejaar zelf.
      </p>

      <h3 id="minstverdienende">Wie is de minstverdienende partner?</h3>
      <p>
        Het gaat om het arbeidsinkomen, niet om het totale inkomen. Voor een ondernemer is dat de winst uit onderneming vóór de ondernemersaftrek en de MKB-winstvrijstelling,
        plus loon en resultaat uit overig werk. Een zwangerschapsuitkering voor zelfstandigen (ZEZ) via het UWV telt als loon mee. Zijn jullie allebei zzp&apos;er, dan
        vergelijk je dus de winsten vóór aftrekposten.
      </p>

      <h2 id="berekening">Zo wordt de korting berekend</h2>
      <p>
        De korting is 11,45% van het arbeidsinkomen boven de drempel, met een maximum. In 2026 is dat 11,45% × (arbeidsinkomen − € 6.239), maximaal € 3.032. Dat maximum
        bereik je bij een arbeidsinkomen van € 32.720.
      </p>
      <Tabel
        bijschrift="IACK per jaar"
        kop={['Jaar', 'Percentage', 'Drempel', 'Maximum', 'Status']}
        rijen={[
          ['2024', '11,45%', '€ 6.073', '€ 2.950', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['2025', '11,45%', '€ 6.145', '€ 2.986', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['2026', '11,45%', '€ 6.239', '€ 3.032', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['2027', '11,45%', '€ 6.316', '€ 2.918', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
        ]}
      />

      <h2 id="afbouw">De afbouw tot 2035</h2>
      <p>
        De wet verlaagt het maximum in 2027 met € 134 en van 2028 tot en met 2034 met € 320 per jaar. Die bedragen zijn in prijspeil 2023 en worden elk jaar geïndexeerd. Op 1
        januari 2035 vervalt artikel 8.14a Wet IB 2001, en daarmee de IACK. Dit geldt voor alle ouders, ongeacht wanneer het kind is geboren.
      </p>

      <h2 id="verzilveren">Kun je de korting helemaal gebruiken?</h2>
      <p>
        Heffingskortingen verlagen je belasting en premies, maar nooit verder dan nul. Betaalt de minstverdienende partner weinig belasting, dan blijft een deel van de korting
        onbenut. Uitbetaling van een niet-gebruikte korting aan de minstverdienende partner bestaat alleen nog voor wie vóór 1963 is geboren.
      </p>

      <Alert variant="actie" titel="Controleer je voorlopige aanslag">
        Krijg je dit jaar voor het eerst recht op de IACK? Kijk of de voorlopige aanslag van de minstverdienende partner er rekening mee houdt. Zo niet, dan kun je die
        aanpassen in Mijn Belastingdienst.
      </Alert>

      <p>
        Werk je met kinderopvang? Lees dan ook het artikel over <Link href="/kennisbank/kinderopvangtoeslag-voor-zzpers">kinderopvangtoeslag voor zzp&apos;ers</Link>.
      </p>
    </ArtikelLayout>
  )
}
