import type { Metadata } from 'next'
import Link from 'next/link'
import { Inhoudsopgave } from '@/components/handleiding/Inhoudsopgave'
import { Alert } from '@/components/ui/Alert'
import { ButtonLink } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { PRESETS } from '@/lib/import/presets'
import { HERSTELPUNT_BEWAARDAGEN } from '@/lib/import/types'
import { SITE } from '@/lib/site'
import { VOORBEELD_JAAR } from '@/lib/voorbeeld'

const TITEL = 'Handleiding: zo stel je de tool in en gebruik je hem'
const BESCHRIJVING =
  'Zo stel je je account in, koppel je Moneybird voor jezelf en je partner, lees je bank- en brokeroverzichten in en maak je het fiscaal rapport.'

export const metadata: Metadata = {
  title: 'Handleiding',
  description: BESCHRIJVING,
  alternates: { canonical: '/handleiding/' },
  openGraph: { title: TITEL, description: BESCHRIJVING, url: '/handleiding/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

/** Secties in de volgorde van de pagina; de inhoudsopgave en de koppen komen allebei hieruit. */
const SECTIES = [
  { id: 'wat-de-tool-doet', kort: 'Wat de tool doet', titel: 'Wat de tool doet en wat niet' },
  { id: 'account', kort: 'Je account instellen', titel: 'Je account instellen' },
  { id: 'huishouden', kort: 'Huishouden en partner', titel: 'Je huishouden en partner' },
  { id: 'jaar-beginnen', kort: 'Een jaar beginnen', titel: 'Een jaar beginnen' },
  { id: 'moneybird', kort: 'Moneybird koppelen', titel: 'Moneybird koppelen, ook voor je partner' },
  { id: 'bank-en-broker', kort: 'Bank en broker importeren', titel: 'Bank- en brokeroverzichten importeren' },
  { id: 'controleren-en-invullen', kort: 'Controleren en invullen', titel: 'Controleren en invullen' },
  { id: 'exporteren', kort: 'Exporteren', titel: 'Exporteren' },
  { id: 'privacy-en-veiligheid', kort: 'Privacy en veiligheid', titel: 'Privacy en veiligheid' },
  { id: 'veelgestelde-vragen', kort: 'Veelgestelde vragen', titel: 'Veelgestelde vragen' },
] as const

type SectieId = (typeof SECTIES)[number]['id']

function Kop({ id }: { id: SectieId }) {
  return <h2 id={id}>{SECTIES.find((s) => s.id === id)?.titel}</h2>
}

export default function HandleidingPagina() {
  return (
    <Container breedte="smal">
      <PageHeader
        kicker="Handleiding"
        titel={TITEL}
        intro={<p>Van de eerste keer inloggen tot het fiscaal rapport. Lees hem van boven naar beneden, of spring naar het onderdeel dat je nodig hebt.</p>}
      />

      <Inhoudsopgave items={SECTIES.map((s) => ({ id: s.id, label: s.kort }))} />

      <div className="kb-prose">
        <Kop id="wat-de-tool-doet" />
        <p>
          De tool rekent je inkomstenbelasting en je Zvw-bijdrage uit, voor jou als zzp&apos;er en voor je partner. Per belastingjaar maak je een dossier met je invoer, de
          berekening met uitleg per regel, controles en een planning. Uit elk jaar maak je een fiscaal rapport als PDF en als Excel-bestand, opgebouwd zoals een accountant dat
          doet.
        </p>
        <p>Wat de tool niet doet:</p>
        <ul>
          <li>Hij geeft geen advies. De uitkomst is een indicatieve berekening; controleer je aangifte zelf of met je adviseur.</li>
          <li>
            Hij dient niets in. De aangifte doe je zelf bij de Belastingdienst, in Mijn Belastingdienst. Het tabblad Aangifte invullen helpt je daarbij.
          </li>
        </ul>
        <p>
          Je gegevens staan versleuteld op de server, en na het inloggen zie je alleen je eigen dossier. Hoe dat werkt, lees je bij{' '}
          <a href="#privacy-en-veiligheid">Privacy en veiligheid</a>.
        </p>

        <Kop id="account" />
        <p>
          Een account maak je niet zelf aan. De beheerder stuurt je een uitnodiging per mail. De link in die mail is 7 dagen geldig en werkt één keer.
        </p>
        <p>
          De link opent de pagina <strong>Account instellen</strong>. Die heeft twee stappen:
        </p>
        <ol>
          <li>
            Kies een wachtwoord van minimaal 12 tekens, vul het nog een keer in bij <strong>Herhaal wachtwoord</strong> en klik op <strong>Verder</strong>. Een zin van een paar
            woorden werkt goed. Inloggen doe je met het e-mailadres waarop je de uitnodiging kreeg.
          </li>
          <li>
            Scan de QR-code met een authenticator-app op je telefoon, bijvoorbeeld Google Authenticator, Microsoft Authenticator of 1Password. Lukt scannen niet, typ dan de
            sleutel onder de QR-code over in de app. Vul de code van 6 cijfers uit de app in en klik op <strong>Bevestigen en naar je dossier</strong>.
          </li>
        </ol>
        <p>Daarna ben je ingelogd en kom je in je dossier. Dat is dan nog leeg.</p>

        <h3>Inloggen</h3>
        <p>
          Voortaan log je in op de pagina <Link href="/dossier/login/">Inloggen</Link>. Vul je e-mailadres en wachtwoord in en klik op <strong>Verder</strong>. Daarna vraagt
          de tool de code uit je authenticator-app, die elke 30 seconden verandert; vul hem in en klik op <strong>Inloggen</strong>. Uitloggen doe je met <strong>Uitloggen</strong>, onderaan het overzicht van je jaren.
        </p>

        <h3>Telefoon kwijt of wachtwoord vergeten</h3>
        <p>
          Vraag de beheerder om een herstellink. Die is 48 uur geldig en werkt ook één keer. Met de link kies je een nieuw wachtwoord en koppel je opnieuw een
          authenticator-app, net als bij het instellen. Tot je dat hebt afgerond, werkt je oude wachtwoord nog; daarna word je overal uitgelogd waar je nog ingelogd was. Je
          dossier blijft gewoon staan, want de versleuteling hangt niet af van je wachtwoord.
        </p>

        <Kop id="huishouden" />
        <p>
          Je huishouden leg je per jaar vast, bovenaan het tabblad <strong>Invoer en resultaat</strong> in het blok <strong>Huishouden</strong>.
        </p>
        <ul>
          <li>
            <strong>Persoon A</strong> ben jij. Vul bij <strong>Naam of roepnaam</strong> een naam in die je herkent, en je <strong>Geboortedatum</strong>. Zonder
            geboortedatum rekent de tool met een standaardleeftijd, zonder AOW.
          </li>
          <li>
            Zet <strong>Fiscaal partner het hele jaar</strong> aan als jullie getrouwd zijn, geregistreerd partner zijn, of samenwonen met een notarieel contract of een kind
            samen. Je partner komt er dan bij als <strong>Persoon B</strong>, en gemeenschappelijke posten kun je verdelen.
          </li>
          <li>
            Woon je samen zonder fiscaal partnerschap, voeg je partner dan toe met <strong>Tweede persoon toevoegen</strong>. Gemeenschappelijke posten worden dan niet
            verdeeld.
          </li>
        </ul>
        <p>
          Met twee personen kies je bij <strong>Gegevens invullen voor</strong> van wie je de onderneming, het loon, het pensioen en de voorlopige aanslag invult. De eigen
          woning, het vermogen in box 3, de persoonsgebonden aftrek en box 2 vul je één keer in voor het hele huishouden. Bij <strong>Verdeling tussen partners</strong> kies je
          hoe jullie de gemeenschappelijke posten verdelen.
        </p>

        <h3>Kinderen en kinderopvang</h3>
        <p>
          Met <strong>Kind toevoegen</strong> zet je een kind in het huishouden, met naam en geboortedatum. Kwam het kind later bij jullie wonen, vul dan{' '}
          <strong>In het huishouden vanaf</strong> in. Bij co-ouderschap vul je in hoeveel dagen per jaar het kind bij jullie is.
        </p>
        <p>
          Opvang voeg je per kind toe onder <strong>Kinderopvang</strong>, met <strong>Opvang toevoegen</strong>. Kies de soort (dagopvang, BSO of gastouder) en daarna bij{' '}
          <strong>Uren invullen</strong> hoe je de uren opgeeft:
        </p>
        <ul>
          <li>
            <strong>Vast per maand</strong>: de uren per maand, het uurtarief en het aantal maanden.
          </li>
          <li>
            <strong>Totaal uit jaaroverzicht</strong>: het totaal aantal uren uit het jaaroverzicht van de opvang, met het uurtarief en het aantal maanden met opvang. Handig als
            de uren per maand wisselden.
          </li>
        </ul>
        <p>
          De <strong>Startdatum</strong> gebruikt de tool voor de aanvraagtermijn van de kinderopvangtoeslag.
        </p>

        <h3>Opslaan</h3>
        <p>
          Wat je invult, rekent direct door in de uitkomst naast je invoer (op je telefoon in de balk onderin). Bewaren doe je met <strong>Opslaan</strong> in de balk bovenaan
          het jaar. Zolang je dat nog niet hebt gedaan, staat daar <strong>Niet opgeslagen wijzigingen</strong>.
        </p>

        <Kop id="jaar-beginnen" />
        <p>
          Na het inloggen zie je <strong>Je belastingjaren</strong>, het overzicht van je dossier. Een nieuw jaar maak je in het blok <strong>Nieuw jaar</strong>. Kies bij{' '}
          <strong>Beginnen met</strong> hoe je start:
        </p>
        <ul>
          <li>
            <strong>Leeg</strong>: een leeg jaar voor het belastingjaar dat je kiest.
          </li>
          <li>
            <strong>Kopie vorig jaar</strong>: neemt personen, ondernemingen en vermogen over uit het jaar ervoor. De eindwaarden van dat jaar worden de beginwaarden;
            voorlopige aanslagen en jaarbedragen beginnen leeg. Dit kan alleen als het vorige jaar al in je dossier staat.
          </li>
          <li>
            <strong>Voorbeeld {VOORBEELD_JAAR}</strong>: een verzonnen zzp-huishouden om de tool te leren kennen.
          </li>
        </ul>
        <p>
          Kies het <strong>Belastingjaar</strong> en klik op <strong>Jaar toevoegen</strong>. Staat er bij een jaar voorlopig of concept, dan liggen nog niet alle cijfers van
          dat jaar vast en kan de uitkomst nog veranderen.
        </p>

        <h3>Importeren uit een eerdere export</h3>
        <p>
          Heb je een exportbestand van deze tool, bijvoorbeeld een eigen back-up, lees het dan in met <strong>Importeren (JSON)</strong> op het overzicht. Kies het bestand dat
          je bij <strong>Alles exporteren (JSON)</strong> of <strong>Download JSON</strong> hebt gekregen. Per jaar kies je <strong>Toevoegen</strong>,{' '}
          <strong>Vervangen</strong> of <strong>Overslaan</strong>, en er verandert niets tot je bevestigt. Een import kun je {HERSTELPUNT_BEWAARDAGEN} dagen lang ongedaan
          maken.
        </p>

        <h3>Saldi uit het vorige jaar meenemen</h3>
        <p>
          Sommige bedragen schuiven door naar het volgende jaar: verliezen, niet-benutte zelfstandigenaftrek, het restant persoonsgebonden aftrek, de lijfrentehistorie, de
          oudedagsreserve, het urencriterium, de beginbalans en je bedrijfsmiddelen. Dat heet doorrollen. Bij <strong>Kopie vorig jaar</strong> neemt de tool die saldi meteen
          over uit de uitkomst van het vorige jaar.
        </p>
        <p>
          Begon je leeg, of pas je het vorige jaar later nog aan? Dan zie je bovenaan het jaar een blok met de saldi van het vorige jaar. Werk je aan 2026, dan heet dat blok{' '}
          <strong>Saldi uit 2025</strong>, en staat erin hoeveel saldi afwijken. Met <strong>Saldi uit 2025 opnieuw overnemen</strong> zie je eerst wat er verandert;{' '}
          <strong>Overnemen en opslaan</strong> zet het door. De rest van je invoer blijft staan.
        </p>

        <Kop id="moneybird" />
        <p>
          Boekhoud je in Moneybird, dan haalt de tool de cijfers van je onderneming daaruit op: de winst- en verliesrekening, de balans, je vaste activa, de omzet per klant en
          je geregistreerde uren. De koppeling leest alleen; in Moneybird verandert niets. Heeft je partner een eigen administratie, dan koppel je die op dezelfde manier.
        </p>

        <h3>Een token maken in Moneybird</h3>
        <ol>
          <li>Log in bij Moneybird en ga naar Instellingen, dan Ontwikkelaars, dan Persoonlijke API-tokens. Heet het bij jou anders, zoek dan naar API-tokens.</li>
          <li>Maak een nieuw persoonlijk API-token en geef het een naam die je herkent, bijvoorbeeld IB-calculator.</li>
          <li>
            Zet alleen de rechten aan die de tool nodig heeft: <code>sales_invoices</code>, <code>documents</code>, <code>bank</code>, <code>time_entries</code> en{' '}
            <code>settings</code>. De tool gebruikt ze alleen om te lezen.
          </li>
          <li>Kopieer het token.</li>
        </ol>
        <p>
          Het administratie-id staat in de adresbalk van Moneybird: het getal direct na moneybird.com/. Zo zie je welke administratie van wie is als jullie er allebei een
          hebben.
        </p>

        <h3>De koppeling toevoegen</h3>
        <ol>
          <li>
            Ga naar <strong>Koppelingen</strong>. Die link staat onder het overzicht van je jaren en bovenaan elk jaar.
          </li>
          <li>
            Ga naar <strong>Koppeling toevoegen</strong>. Geef de koppeling bij <strong>Naam van de koppeling</strong> een naam, bijvoorbeeld die van het bedrijf. Kies bij{' '}
            <strong>Van wie?</strong> of het jouw administratie is of die van je partner, en plak het token bij <strong>Persoonlijk API-token</strong>.
          </li>
          <li>
            Klik op <strong>Token controleren en toevoegen</strong>. Werkt het token, kies dan bij <strong>Administratie</strong> de juiste administratie en klik op{' '}
            <strong>Administratie koppelen</strong>.
          </li>
        </ol>
        <p>
          Voor de administratie van je partner voeg je een tweede koppeling toe, met een token dat je partner op dezelfde manier in de eigen Moneybird maakt. Kies dan bij{' '}
          <strong>Van wie?</strong> je partner. De onderneming van je partner gebruikt die koppeling, en je partner heeft daar geen eigen account voor nodig. Bij een bestaande
          koppeling pas je Van wie? aan in de lijst <strong>Je koppelingen</strong>.
        </p>
        <p>
          Het token wordt versleuteld opgeslagen. Daarna zie je het alleen gemaskeerd, met de laatste tekens. Intrekken kan altijd in Moneybird, bij dezelfde instelling.
        </p>

        <h3>De cijfers ophalen per onderneming</h3>
        <ol>
          <li>
            Open het jaar en ga op Invoer en resultaat naar <strong>Ondernemingen</strong>. Met twee personen kies je eerst bij <strong>Gegevens invullen voor</strong> de juiste
            persoon. Heeft die nog geen onderneming, klik dan op <strong>Onderneming toevoegen</strong>.
          </li>
          <li>
            Klik bij de onderneming op <strong>Importeer uit Moneybird</strong>. Staat er een keuzelijst <strong>Moneybird-koppeling</strong>, kies dan eerst de koppeling
            van deze persoon.
          </li>
          <li>
            Controleer de cijfers uit Moneybird. Kies per grootboekrekening hoe die fiscaal meetelt; die keuzes gelden ook voor volgende jaren. Onder{' '}
            <strong>Wat neem je over?</strong> zet je aan wat de tool mag vervangen, zoals investeringen, opdrachtgevers en de oudedagsreserve.
          </li>
          <li>
            Klik op <strong>Overnemen in deze onderneming</strong> en daarna bovenaan op <strong>Opslaan</strong>.
          </li>
        </ol>
        <p>
          Met <strong>Indeling bewaren</strong> bewaar je je keuzes per grootboekrekening zonder iets over te nemen. <strong>Sluiten zonder overnemen</strong> laat alles zoals
          het was. Zet <strong>Uren uit Moneybird gebruiken</strong> alleen aan als je ook indirecte uren, zoals administratie en acquisitie, in Moneybird schrijft.
        </p>

        <Kop id="bank-en-broker" />
        <p>
          Voor box 3 vul je per rekening de waarde op 1 januari van het jaar en van het jaar erna in. Dat kan met de hand, maar je kunt ook een export van je bank of broker
          inlezen.
        </p>
        <ol>
          <li>
            Ga op Invoer en resultaat naar <strong>Vermogen (box 3)</strong> en klik op <strong>Importeer uit een bestand</strong>.
          </li>
          <li>
            Kies of sleep een of meer CSV-bestanden, bijvoorbeeld je portefeuille op een peildatum en het rekeningoverzicht van het jaar. Kies de bestanden van één jaar
            tegelijk.
          </li>
          <li>
            Per rekening zie je wat er verandert. Beantwoord de vragen die erbij staan, zoals van wie de rekening is (<strong>Van wie?</strong>) en of hij al in je vooraf
            ingevulde aangifte staat.
          </li>
          <li>
            Klik op <strong>Overnemen in je bezittingen</strong> en daarna bovenaan op <strong>Opslaan</strong>.
          </li>
        </ol>
        <p>
          Klopt het niet, dan zet <strong>Ongedaan maken</strong> het terug. Ontbreekt een stand in het bestand, dan vraagt de tool erom; je vindt hem in het jaaroverzicht van
          je bank of broker.
        </p>

        <h3>Welke bestanden de tool herkent</h3>
        <ul>
          {PRESETS.map((p) => (
            <li key={p.formaat}>{p.naam}</li>
          ))}
        </ul>
        <p>
          Staat je bank of broker er niet bij, of heb je een gewoon rekeningoverzicht als CSV, dan koppel je de kolommen zelf. Je geeft per kolom aan wat erin staat, zoals
          Datum, Bedrag of Waarde in euro, en bij <strong>Wat staat er in het bestand?</strong> of het om een stand gaat of om de transacties van het jaar. Die koppeling kan je
          browser onthouden voor de volgende keer. Een PDF lees je niet in; die bedragen neem je over met de hand.
        </p>

        <Kop id="controleren-en-invullen" />
        <p>Voordat je de aangifte verstuurt, kijk je het jaar na en vul je de aangifte scherm voor scherm in. Planning laat zien wat je nog moet betalen of terugkrijgt, en wat uitstel kost.</p>
        <h3>Controles</h3>
        <p>
          Terwijl je invult, kijkt de tool je invoer na. In de balk bovenaan het jaar zie je bij <strong>Controles</strong> hoeveel er openstaan, en naast je invoer staat de
          lijst. Elke controle heeft een niveau:
        </p>
        <ul>
          <li>
            <strong>Fout</strong>: iets ontbreekt of klopt niet. Los het op, of kies <strong>Negeren</strong> en schrijf op waarom. Die reden komt in het rapport. Een
            verplicht veld kun je niet negeren.
          </li>
          <li>
            <strong>Let op</strong>: kijk ernaar en kies <strong>Gezien</strong> als het klopt.
          </li>
          <li>
            <strong>Info</strong>: achtergrond, er hoeft niets te gebeuren.
          </li>
        </ul>
        <p>
          Met <strong>Naar het veld</strong> spring je naar de plek waar het om gaat.
        </p>

        <h3>De status van een jaar</h3>
        <p>
          Bovenaan elk jaar kies je bij <strong>Status van dit jaar</strong> hoe ver je bent. Sla daarna op om de status te bewaren.
        </p>
        <ul>
          <li>
            <strong>Concept</strong>: je bent nog bezig. Een nieuw jaar begint als Concept.
          </li>
          <li>
            <strong>Gecontroleerd</strong>: nagekeken en klaar om in te dienen. Dit kan pas als alle fouten zijn opgelost of bewust genegeerd.
          </li>
          <li>
            <strong>Ingediend</strong>: je hebt de aangifte verstuurd. Staan er nog fouten open, dan vraagt de tool eerst of je het zeker weet.
          </li>
        </ul>
        <p>Zolang er fouten openstaan, staat in het fiscaal rapport het woord CONCEPT, behalve als het jaar op Ingediend staat.</p>
        <p>
          Heb je een fiscaal rapport of aangifte van een accountant, neem de bedragen daaruit dan over op het tabblad <strong>Accountantscheck</strong>. Je ziet per
          regel het verschil met de berekening, en de bedragen komen ook in je eigen rapport.
        </p>

        <h3>Aangifte invullen</h3>
        <p>
          Het tabblad <strong>Aangifte invullen</strong> volgt de schermen van de online aangifte van de Belastingdienst, in dezelfde volgorde. Per scherm zie je de bedragen uit
          je dossier. Open de aangifte in een ander venster en loop de schermen een voor een door:
        </p>
        <ul>
          <li>
            Een bedrag dat je zelf invult: kopieer het, plak het in de aangifte en vink <strong>Ingevuld</strong> aan.
          </li>
          <li>
            Een bedrag dat de Belastingdienst al heeft ingevuld: klopt het, klik dan op <strong>Klopt</strong>. Staat er iets anders, kies dan <strong>Wijkt af?</strong>, vul
            het bedrag van de Belastingdienst in en kies wat je aanhoudt.
          </li>
          <li>Een bedrag dat het aangifteprogramma zelf uitrekent, staat er ter controle bij.</li>
        </ul>
        <p>
          Met twee personen kies je bij <strong>Aangifte van</strong> wiens aangifte je invult. Bij <strong>Toon</strong> kun je filteren op <strong>Nog te doen</strong> of{' '}
          <strong>Verschillen</strong>. Onderaan vergelijk je het bedrag dat het aangifteprogramma uitrekent met de uitkomst van de tool. Is dat gelijk en klopt de rest ook,
          verstuur dan de aangifte en zet het jaar op Ingediend.
        </p>
        <p>
          Bij elk jaar staat of de volgorde al is nagekeken tegen het aangifteprogramma van dat jaar. Zo niet, dan kan een scherm net anders heten of op een andere plek staan.
        </p>

        <h3>Planning: voorlopige aanslag en belastingrente</h3>
        <p>
          Het tabblad <strong>Planning</strong> begint met <strong>Voorlopige aanslag en belastingrente</strong>. Per persoon zie je wat je nu via de voorlopige aanslag
          betaalt, wat je volgens de berekening verschuldigd bent en wat uitstel kost aan belastingrente. Onder <strong>Bedragen voor het formulier</strong> staan de bedragen
          om bij de Belastingdienst een voorlopige aanslag aan te vragen of te laten wijzigen.
        </p>
        <p>
          Je huidige voorlopige aanslag vul je in op Invoer en resultaat, bij <strong>Voorlopige aanslag en verliezen</strong>. Vul daar ook de dagtekening in en wat je al hebt
          betaald; daarmee rekent de tool de belastingrente.
        </p>
        <p>
          Verder staan op Planning de belastingpot (hoeveel je opzij zet voor de aanslag), wat een extra lijfrente-inleg of investering oplevert, je jaarruimte en een
          vergelijking tussen eenmanszaak en BV. Planning rekent met de opgeslagen invoer, dus sla eerst op als je net iets hebt gewijzigd.
        </p>

        <Kop id="exporteren" />
        <p>
          Op het tabblad <strong>Export</strong> maak je het fiscaal rapport, in de opbouw van een rapport van een accountant. Bij <strong>Rapport voor</strong> kies je de
          persoon; met een partner kan het rapport ook voor jullie allebei.
        </p>
        <ul>
          <li>
            <strong>Fiscaal rapport (PDF)</strong> om te lezen, te bewaren of met je adviseur te delen.
          </li>
          <li>
            <strong>Fiscaal rapport (Excel)</strong> met daarnaast elk bedrag met zijn herkomst, je invoer en de rekenparameters.
          </li>
        </ul>
        <p>
          Staan er nog fouten open, dan heten de knoppen <strong>Concept downloaden</strong> en staat CONCEPT in het rapport. Het rapport wordt in je browser gemaakt; er gaat
          niets naar een andere dienst. Wil je je adres op het voorblad, vul het dan in bij <strong>Persoonlijke gegevens</strong> op dezelfde pagina. Met{' '}
          <strong>Rekenuitleg (PDF)</strong> krijg je de berekening regel voor regel.
        </p>

        <h3>JSON als eigen back-up</h3>
        <p>
          Met <strong>Download JSON</strong> op Export bewaar je één jaar, met <strong>Alles exporteren (JSON)</strong> op het overzicht je hele dossier. Zo&apos;n bestand lees je
          later weer in met Importeren (JSON). Je Moneybird-token zit er niet in.
        </p>
        <Alert variant="let-op" titel="Een JSON-export is niet versleuteld">
          Iedereen die het bestand heeft, kan je gegevens lezen. Bewaar het op een veilige plek, bijvoorbeeld in je wachtwoordmanager of een versleutelde map, en niet in een
          gedeelde map.
        </Alert>

        <Kop id="privacy-en-veiligheid" />
        <p>
          Wat je in je dossier zet, wordt versleuteld voordat het in de database komt: je invoer, de berekeningen, de bedragen van je accountant, je vinkjes, je persoonlijke
          gegevens en je Moneybird-token. Dat gebeurt met AES-256-GCM, met een sleutel die op de server staat, los van de database. Wie alleen de database of een back-up in
          handen krijgt, kan je gegevens niet lezen.
        </p>
        <p>
          De server gebruikt die sleutel ook om je gegevens aan jou te tonen en door te rekenen. Het is dus geen eind-tot-eindversleuteling: wie de server beheert, kan er in
          principe bij. Niet versleuteld is wat nodig is om je dossier te vinden, zoals je e-mailadres en welke jaren erin staan met hun status. Je wachtwoord bewaart de tool
          niet, alleen een hash ervan.
        </p>
        <p>
          Inloggen kan alleen met je wachtwoord en de code uit je authenticator-app. Na het inloggen toont de tool alleen je eigen huishouden: andere gebruikers zien jouw
          dossier niet, en jij het hunne niet.
        </p>
        <p>
          Bestanden van je bank of broker worden in je browser gelezen. Alleen wat je overneemt, komt in je dossier, en rekeningnummers uit die bestanden bewaart de tool niet.
          Ook het fiscaal rapport wordt in je browser gemaakt.
        </p>
        <p>
          Twee keer per jaar maakt de server voor de beheerder een versleutelde back-up van alle gegevens. Zo&apos;n back-up is alleen terug te zetten met de sleutel van de
          server.
        </p>
        <p>
          Wil je alles weg, gebruik dan <strong>Alles verwijderen</strong> onderaan het overzicht. Dat wist al je jaren, berekeningen en bedragen van je accountant definitief.
          Exporteer eerst als je een kopie wilt houden. Een back-up die al eerder is gemaakt, verandert daar niet door. Meer staat in de{' '}
          <Link href="/privacy/">privacyverklaring</Link>.
        </p>

        <Kop id="veelgestelde-vragen" />
        <h3>De code uit mijn app wordt niet geaccepteerd</h3>
        <p>
          De code hangt af van de tijd op je telefoon. Zet datum en tijd op automatisch en probeer het met de volgende code. Een code wisselt elke 30 seconden, dus typ hem in
          voordat hij verloopt. Na te veel mislukte pogingen moet je even wachten; de melding zegt hoe lang.
        </p>
        <h3>Mijn uitnodiging is verlopen</h3>
        <p>Een uitnodiging is 7 dagen geldig en werkt één keer. Vraag de beheerder om een nieuwe; de oude link werkt dan niet meer.</p>
        <h3>Heeft mijn partner een eigen account nodig?</h3>
        <p>
          Nee. Je partner zit in jouw dossier als Persoon B. Jij vult de gegevens van jullie allebei in, en een eigen Moneybird-administratie van je partner koppel je met{' '}
          <strong>Van wie?</strong>.
        </p>
        <h3>Ik ben mijn wachtwoord vergeten of mijn telefoon kwijt</h3>
        <p>
          Vraag de beheerder om een herstellink. Hoe dat gaat, staat bij <a href="#account">Je account instellen</a>.
        </p>
        <h3>Mijn wijzigingen zijn weg</h3>
        <p>
          Wijzigingen worden pas bewaard als je op <strong>Opslaan</strong> klikt. Ga je met wijzigingen die nog niet zijn opgeslagen naar een ander tabblad van het jaar, dan
          vraagt de tool eerst of je wilt opslaan.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">Kom je er niet uit? Vraag het de beheerder die je heeft uitgenodigd.</p>
        <ButtonLink href="/dossier/" className="flex-shrink-0">
          Naar je dossier
        </ButtonLink>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-gray-500">{SITE.disclaimer}. Controleer je aangifte altijd zelf of met je adviseur.</p>
    </Container>
  )
}
