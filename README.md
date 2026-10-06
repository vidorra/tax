# IB-calculator voor zzp'ers

Rekent de inkomstenbelasting van een zzp-huishouden door zoals het fiscaal rapport van een accountant: winst, ondernemersaftrek, box 1, 2 en 3, heffingskortingen, Zvw, lijfrente-jaarruimte, eigen woning, toeslagen en kindregelingen. Met een planningslaag (belastingpot, voorlopige aanslag, what-ifs, BV-vergelijking, middeling) en een beveiligd dossier per belastingjaar.

Het plan en de verantwoording staan buiten deze repository. Conventies: `CLAUDE.md`.

## Stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind 3.4, Drizzle + Postgres, vitest. Deploy als Docker-container, bijvoorbeeld via CapRover.

## Ontwikkelen

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # rekenkern, jaarparameters, API, dossier, rapport
npm run typecheck
npx tsx scripts/tax-diff.ts 2026 2027                   # wat verandert er tussen twee jaren
npx tsx scripts/tax-diff.ts 2027 --variant brief-29-09  # jaar tegenover variant
npx tsx scripts/tax-diff.ts --check                     # validatie en changelog van alle jaren
npx tsx scripts/tax-derive.ts 2029 --from 2028          # skelet voor een nieuw jaar
```

### Tests

- De publieke tests rekenen met een verzonnen voorbeeldhuishouden (`lib/voorbeeld/`: 2024 en 2021, twee partners met elk een eenmanszaak, kind, eigen woning, box 3 en lijfrente). Een schone kloon draait volledig groen.
- De regressietests tegen echte aangiftes (de engine en het fiscaal rapport op de euro tegen het rapport van een accountant) staan met hun fixtures in mappen `prive/` die git negeert, zoals `lib/tax/__tests__/prive/` en `lib/rapport/__tests__/prive/`. Ze draaien alleen lokaal; zonder die mappen slaan ze zich over. Een privé-test laadt zijn fixture met `laadPrive` uit `lib/__tests__/prive.ts` en `describe.skipIf`, nooit met een statische import.
- Zet nooit echte bedragen, namen, datums, rekening- of polisnummers of gegevens van een accountant in bestanden die git volgt, ook niet in commentaar. Brondocumenten (PDF's, schermafbeeldingen) horen niet in de repository.
- De databasetests draaien als `IB_TEST_DATABASE_URL` naar een wegwerpdatabase wijst; anders slaan ze zich over.

De publieke calculator en de deel-calculators werken zonder database. Het dossier heeft Postgres en de geheimen hieronder nodig; zonder die variabelen tonen de dossierpagina's een configuratiemelding en geven de API's 503.

## Opbouw

- `lib/tax/types.ts`: contract voor parameters, invoer en uitkomst.
- `lib/tax/years/<jaar>.ts`: alle cijfers en regels per belastingjaar (2021 t/m 2027, 2028 als concept), met status per veld, bron en changelog. 2027 heeft de variant `brief-29-09`.
- `lib/tax/modules/*`: pure rekenmodules; `lib/tax/engine.ts` voegt ze samen in de volgorde van het fiscaal rapport.
- `lib/voorbeeld/`: het verzonnen voorbeeldhuishouden voor de voorbeeldaangifte in het dossier, de jaarruimte-calculator, `npm run rapport:voorbeeld` en de publieke tests.
- `lib/controles/`: controles vóór het afronden van een jaar (regels per onderdeel in `regels/`, negeren met reden, kapitaalsvergelijking).
- `lib/invulhulp/`: Aangifte invullen, per jaar de schermen van de online aangifte (`indeling/`), opbouw, voortgang en VIA-vergelijking.
- `lib/import/`: broker-CSV (presets per broker en een generieke kolomkoppeling) en de JSON-import, puur en in de browser.
- `lib/dossier/veldregister/`: alle velden en regelingen van de editor, voor springen naar een veld en het zoekveld.
- `app/`: home, jaarpagina's, deel-calculators, kennisbank, `/admin/jaren`, `/dossier`, API's.

## Omgevingsvariabelen

| Variabele | Nodig voor | Toelichting |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | alles | Publieke URL; ook als build-arg (canonical, sitemap) |
| `DATABASE_URL` | dossier | Postgres, bijvoorbeeld `postgresql://ibcalculator:wachtwoord@db-host:5432/ibcalculator` |
| `AUTH_SECRET` | dossier | Minimaal 32 tekens, willekeurig |
| `DOSSIER_KEY` | dossier | 32 bytes als base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `TRUSTED_PROXY_HOPS` | rate limits | Standaard 1 (één reverse proxy, zoals de nginx van CapRover); 2 met Cloudflare ervoor |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, `NEXT_PUBLIC_UMAMI_SRC` | statistiek | Optioneel, cookieless. Beide als build-arg; `NEXT_PUBLIC_UMAMI_SRC` is de URL van het script op je eigen Umami-server (bijvoorbeeld `https://stats.example.nl/script.js`), de CSP staat die host toe. Ontbreekt een van de twee, dan geen statistiek |
| `GIT_SHA` | `/api/health` | Optioneel |
| `MONEYBIRD_TOKEN`, `MONEYBIRD_ADMINISTRATION_ID` | Moneybird-koppeling | Optioneel; een koppeling uit de omgeving (id `env`) naast de koppelingen die je in het dossier toevoegt |
| `BACKUP_MAIL_TO` | back-up | Eén mailadres dat op 1 februari en 1 augustus de versleutelde back-up krijgt |
| `MAIL_FROM`, `MAIL_REPLY_TO` | back-up | Afzender op een geverifieerd domein, bijvoorbeeld `noreply@example.nl`; antwoordadres optioneel |
| `RESEND_API_KEY` | back-up | Mailen via Resend (voorkeur) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | back-up | Alternatief zonder Resend; poort standaard 587, bij 465 met TLS |

`DOSSIER_KEY` nooit wijzigen zonder herversleuteling: bestaande dossiers zijn dan niet meer te openen.

## Moneybird-koppeling

Het dossier kan per onderneming de cijfers van een jaar uit Moneybird halen (alleen lezen): winst- en verliesrekening per grootboekrekening met een voorgestelde fiscale categorie, balans (ondernemingsvermogen, FOR, onderhanden werk), vaste activa (investeringen, desinvesteringen en het activaregister), omzet per klant en geregistreerde uren.

- **Overnemen:** de oudedagsreserve begint met de stand op de beginbalans (1 januari); de eindbalans is alleen een controle, zodat een afname niet twee keer telt. Staat er geen FOR op de beginbalans, dan blijft een doorgerolde stand staan. Een register uit de activamodule geldt als volledig (alle bedrijfsmiddelen staan erin), dus de fiscale afschrijving vervangt de geboekte. Een middel dat Moneybird dit jaar afstootte en dat al in het register stond (uit een eerdere import of uit de investeringen van vorig jaar), krijgt daar de verkoopdatum en -prijs en gaat uit de lijst met verkochte bedrijfsmiddelen, zodat de bijtelling één keer telt. Het controlepaneel zegt vóór het overnemen wat er met zulke middelen gebeurt, en dat het boekresultaat op de verkoop in Moneybird dan op 'niet meenemen' moet.
- **Token:** maak in Moneybird een persoonlijk API-token via Instellingen > Ontwikkelaars met de scopes `sales_invoices`, `documents`, `bank`, `time_entries` en `settings`. Ontbreekt een scope, dan slaat de import dat onderdeel over met een waarschuwing (bijvoorbeeld zonder `time_entries` geen uren en geen uurtarief).

  | Onderdeel | Endpoint | Scope |
  |---|---|---|
  | Grootboekrekeningen (naam, RGS-code) | `ledger_accounts` | `settings` |
  | Winst- en verliesrekening, omzet per klant | `reports/profit_loss`, `reports/revenue_by_contact` | `sales_invoices` of `documents` |
  | Balans | `reports/balance_sheet` | `bank` |
  | Vaste activa | `assets` | `documents` |
  | Uren | `time_entries` | `time_entries` |
- **In het dossier:** voeg het token toe als koppeling. Het wordt eerst bij Moneybird gecontroleerd en daarna versleuteld opgeslagen (AES-256-GCM met `DOSSIER_KEY`, gebonden aan huishouden en rij); naar de browser gaat alleen een masker. Maximaal tien koppelingen per huishouden.
- **Uit de omgeving:** met `MONEYBIRD_TOKEN` en `MONEYBIRD_ADMINISTRATION_ID` verschijnt een extra koppeling `env`. Die kan niet in de app worden verwijderd; haar eigen indeling wordt in de database bewaard.
- **Limieten:** Moneybird staat 150 verzoeken per 5 minuten toe; één import kost ongeveer tien verzoeken plus een per klant zonder naam in het rapport. De app staat per huishouden tien imports per 5 minuten toe.
- Code: `lib/moneybird/` (contract in `types.ts`), routes onder `app/api/dossier/koppelingen/`, tabel `koppelingen` (migratie 0003).

## Dossier over meerdere jaren

**Activaregister.** Bij elke onderneming staat het blok *Bedrijfsmiddelen*: omschrijving, aanschafdatum, aanschafwaarde, restwaarde, levensduur en methode (lineair, direct, willekeurig voor starters, Vamil), met soort, WOZ bij een gebouw en een verkoop. De tool rekent per bedrijfsmiddel de fiscale afschrijving en de boekwaarde begin en eind, met de grenzen uit de jaarparameters: maximaal 20% van de aanschafwaarde per jaar (goodwill 10%), ook voor een gebouw, dat daarnaast niet onder de bodemwaarde gaat (art. 3.30 lid 2 en 3.30a), en onder de grens van de directe aftrek alles in het aanschafjaar. Na een willekeurige afschrijving als starter gaat de rest over de resterende gebruiksduur, in maanden vanaf de aanschafmaand (art. 3.30 lid 1). Eerdere jaren rekenen met de parameters en de starterstatus van dat jaar.

Het register telt alleen mee voor de winst als je aangeeft dat *al je bedrijfsmiddelen erin staan* (`activaVolledig`). Dan vervangt het bij een uitgesplitste winstberekening de afschrijving zoals geboekt, en corrigeert het bij een saldo het verschil met *Afschrijving in dit saldo, zoals geboekt*; zonder dat bedrag telt het niet mee en krijg je een melding. Staat de schakelaar uit, dan is het register een fiscale controle: de winst rekent met de afschrijving uit je boekhouding en een info-melding noemt de fiscale afschrijving en het verschil. Eén regel (`activaregisterTeltMee` in `lib/tax/modules/onderneming`) bepaalt dat voor de engine, de doorrol van de boekwaarde, het scherm en het rapport. Het fiscaal rapport toont de correctie als eigen regel in de kapitaalsvergelijking en bij de rubrieken; specificatie 5.4.1 toont het register alleen als het meetelt, met een totaal en de aansluiting op de balanspost (anders volgt 5.4.1 de balans en zegt de verantwoording waarom). Een Moneybird-import zet de vaste activa in het register (bron `moneybird`) en meldt een afschrijvingstermijn die fiscaal te kort is; wat je zelf toevoegt blijft staan.

**Investeringsaftrek en desinvestering.** Per investering kun je aangeven dat die eind van het jaar nog niet in gebruik was (dan telt alleen het betaalde deel), dat je hem van je fiscale partner kocht, en bij EIA en MIA of je hem bij RVO hebt gemeld. Het genoten percentage investeringsaftrek gaat met het bedrijfsmiddel mee. Verkoop je het binnen vijf jaar, dan volgt de desinvesteringsbijtelling vanzelf: het genoten percentage van de verkoopprijs, nooit meer dan de aftrek van toen. De drempel van art. 3.47 lid 1 telt de verkoopprijzen van alle goederen die je dat jaar verkocht: het register (ook zonder investeringsaftrek of van buiten de termijn), de lijst *Verkochte bedrijfsmiddelen buiten het register* en het veld voor andere verkopen (`overigeVerkopen`). Staat dezelfde verkoop in het register en in de lijst, ook met een andere naam maar hetzelfde investeringsjaar en dezelfde prijs, dan telt hij één keer, met een melding.

**Nieuw jaar en opnieuw overnemen.** Een nieuw jaar *uit vorig jaar* neemt de saldi over uit de uitkomst van dat jaar: verliezen na verrekening (vervallen jaren vallen weg), niet-benutte zelfstandigenaftrek, het restant persoonsgebonden aftrek, de lijfrentehistorie en het premiegrondslag-inkomen (vóór elke afname van de FOR), de stand van de oudedagsreserve aan het einde, of je het urencriterium haalde (per persoon, over al je ondernemingen samen), de eindbalans als beginbalans en het activaregister (verkochte bedrijfsmiddelen eruit, investeringen van vorig jaar erbij als bedrijfsmiddel met het genoten percentage). De fiscale boekwaarde aan het einde rolt alleen door als het register vorig jaar meetelde; anders blijft de boekwaarde begin leeg en vraagt een melding hem uit de aangifte of jaarrekening van vorig jaar over te nemen. Een bedrijfsmiddel uit een investering krijgt geen boekwaarde begin en de snelste levensduur die fiscaal mag, gemarkeerd tot je levensduur en restwaarde bevestigt. *Alle bedrijfsmiddelen in het register* blijft alleen aan als dat vorig jaar zo was. Elk doorgerold middel heeft een vaste herkomst (`inv:<jaar>:<nummer>` of `act:<jaar>:<nummer>`), zodat een aangepaste datum of een aangepast bedrag geen tweede middel geeft; verwijder je er een, dan onthoudt het dossier dat (`doorrolUitgesloten`) en zet opnieuw overnemen het niet terug, tot je *Toch weer overnemen* kiest. Staat een investering ook al in het register, dan krijgt dat middel de genoten investeringsaftrek. Was een investering eind vorig jaar nog niet in gebruik, dan staat de rest (bedrag min wat al betaald was) klaar bij de investeringen van het nieuwe jaar. Een nieuw verlies van vorig jaar gaat eerst terug naar eerdere jaren; dat vul je zelf in na de verliesbeschikking. Pas je het vorige jaar later aan, dan toont de kaart *Saldi uit 2025* (in het dossier 2026) boven aan de editor welke saldi afwijken, als lijst van nu naar wordt. *Opnieuw overnemen* zet alleen die saldi en laat de rest van je invoer staan, ook een verkoop of een levensduur die je dit jaar invulde. Twee keer overnemen geeft hetzelfde. Code: `lib/dossier/doorrol.ts`, route `app/api/dossier/jaren/[jaar]/doorrollen/` (GET toont, POST met `versie` slaat op).

**Oudedagsreserve.** De FOR neemt alleen verplicht af bij staking, als je op 1 januari de AOW-leeftijd hebt, of als je het urencriterium dit en vorig jaar niet haalde (art. 3.70 Wet IB 2001 zoals dat eind 2022 luidde). Het urencriterium geldt per persoon, over al je ondernemingen samen, ook voor de twee-jaarregel. De vrijwillige afname (lid 1 onder a) komt eerst en is ten hoogste de lijfrentepremies die je dat jaar aftrekt, inclusief de premie voor omzetting van de FOR; die omzettingspremie is op haar beurt ten hoogste de vrijwillige afname (art. 3.128, tekst 2022). De verplichte afname is daarna het deel van de FOR boven het ondernemingsvermogen aan het einde van het jaar; bij staking van de hele onderneming valt de rest vrij, met een melding over de stakingslijfrente. Een FOR boven het ondernemingsvermogen geeft zonder zo'n grond alleen een melding. Ontbreekt het ondernemingsvermogen, dan gebruikt de tool de eindbalans van de jaarrekening.

**Tegenbewijs box 3.** Per bezitting vul je in wat je erbij zette, wat je eraf haalde en de rente, het dividend of de huur, bij vastgoed vanaf 2026 ook de dagen eigen gebruik, en bij schulden de betaalde rente. De velden staan open als tegenbewijs aan staat of de tool denkt dat het loont, en zijn anders per bezitting uit te klappen. Daalde een bezitting zonder ingevulde opname, dan zegt de tool niet dat tegenbewijs loont maar vraagt hij eerst om de opnames (0 invullen betekent: echt verlies). Steeg een bezitting zonder ingevulde storting terwijl tegenbewijs niet lijkt te lonen, dan vraagt de tool of je er geld bij zette en klappen de velden open (melding `box3-tegenbewijs-storting`). In het werkelijk rendement tellen groene beleggingen en contant geld volledig mee: de vrijstellingen en de schuldendrempel gelden daar niet (art. 5.26 lid 3); alleen een vrijgestelde nettolijfrente telt niet mee. Rente die op een rekening in box 3 binnenkwam tel je daar ook bij gestort, en geld waarmee je een schuld in box 3 aflost bij opgenomen; zo telt de formule van de tool alles één keer. Voor 2021 en 2022 rekent de tool tegenbewijs niet door en zegt dat.

## Aangifte invullen, controles en import (ronde 2)

Een jaar in het dossier heeft vijf tabs: Invoer en resultaat, Planning, Accountantscheck, Aangifte invullen en Export. Een badge in de tabrij toont open fouten (bij Invoer, zodra de controles nadrukkelijk zijn) en de voortgang van Aangifte invullen ("4/78"), nooit op de actieve tab.

**Aangifte invullen** (`/dossier/<jaar>/aangifte/`). Per scherm van de online aangifte, in de volgorde en met de woorden van de Belastingdienst, de bedragen uit het dossier. Rijen *Invullen* kopieer je en vink je af; rijen *Controleren* (vooraf ingevuld door de Belastingdienst) krijgen één klik *Klopt*, of bij *Wijkt af?* het bedrag van de Belastingdienst met de keuze Mijn bedrag, Bedrag Belastingdienst of Nog uitzoeken. Onderaan per persoon de eindcontrole: het te betalen of terug te krijgen bedrag volgens het programma naast dat van de tool. Filters Alles, Nog te doen en Verschillen; afdrukken geeft alle rijen. De indeling staat per jaar in `lib/invulhulp/indeling/` (2024, 2025, 2026; 2026 is *verwacht* en moet na 1 maart 2027 worden nagekeken tegen het echte programma). Vinkjes, VIA-bedragen en keuzes staan in de versleutelde aangiftestaat van het jaar (tabel `aangifte_staat`).

**Controles.** Elke controle is een fout, let op of info, met een uitweg: oplossen (vaak met een knop), of negeren met een reden die in de verantwoording van het rapport komt (een let op vink je af als gezien). Alleen gegevens die de berekening echt nodig heeft, kun je niet negeren. In een conceptjaar blijven de controles rustig (ingeklapt, een grijs aantal) tot je het jaar op Gecontroleerd wilt zetten, Aangifte invullen of Export opent, of het blok zelf openklapt; een veld dat je net verliet, toont wel zijn eigen fout. Alleen Gecontroleerd vraagt dat alle fouten zijn opgelost of genegeerd; komt er later weer een fout bij, dan zet opslaan de status terug naar Concept. Ingediend kan altijd, met één bevestiging bij open fouten, en de server zet het nooit terug. Export met open fouten geeft in een concept een download met CONCEPT op elke pagina en `-concept` in de bestandsnaam; bij Ingediend geen CONCEPT, wel de kopregel "Ingediend, met {n} open controles" en de lijst. *Naar het veld* springt naar het veld op Invoer (klapt secties open, kiest de persoon, ring om het veld) met een knop terug; het zoekveld boven de editor vindt velden en regelingen op hun naam of een synoniem (bijvoorbeeld "HIR", "verhuizen", "oude auto").

**Planning.** Per persoon de voorlopige aanslag tegenover wat verschuldigd is, met de belastingrente uit de periodetabel (`lib/tax/years/data/belastingrente.ts`: elk tijdvak met zijn eigen percentage, zoals de Belastingdienst ze publiceert) en de aanslag- en teruggaafgrens; het grote bedrag in het uitkomstpaneel volgt die grenzen. De inhoud hangt af van de fase van het jaar (lopend, verstreken zonder aangifte, ingediend). Terugvragen in het buitenland staat er met een status per verzoek.

**Regelingen.** Per onderneming via *Bijzondere situatie toevoegen*: staking (één bedrag of per onderdeel, met stakingsaftrek, vrijval van reserves en de ruimte voor een stakingslijfrente), herinvesteringsreserve, kostenegalisatiereserve en de partner die meewerkt of iets ter beschikking stelt. Eén vraag per onderneming, *Waar komt de winst vandaan?* (boekhouding of fiscaal rapport), bepaalt per regeling of die al in het saldo zit; je kunt het per regeling aanpassen. De auto van de zaak kent de youngtimer (dagwaarde, overgangsrecht) en de btw-correctie privégebruik. Bij de eigen woning: verhuisd, gekocht of verkocht (eigenwoningreserve op datum, bijleenregeling, splitsing van de lening per leningdeel met het deel in box 3). In box 2: een verlies met verrekening, terugwenteling en de belastingkorting. In box 3: buitenlandse bronbelasting per land met verdragstarief (landentabel `lib/tax/years/data/bronbelasting-landen.ts`, 25 landen, status geschat), voortwenteling naar volgend jaar en een terugvraaglijst met termijnen.

**Import.**
- *Broker-CSV* (bij Vermogen, *Importeer uit een bestand*): DEGIRO (rekeningoverzicht en portefeuille), Interactive Brokers, Trading 212, Saxo, BUX, Rabobank Beleggen, Bitvavo en Coinbase, en elk ander CSV-bestand met een kolomkoppeling die per browser wordt onthouden. Het bestand wordt in de browser gelezen; naar de server gaan alleen de bedragen die je overneemt en een rekeningsleutel (HMAC, zonder rekeningnummer). Per rekening één samenvatting en per bezitting een uitklap; een import vervangt de jaartotalen van die rekening en is ongedaan te maken. Het land van de bronbelasting komt van de broker, het ISIN of een vraag als het ingehouden percentage niet bij het land past. Voorbeeldbestanden en de verwachte uitkomst staan in `lib/import/__tests__/fixtures/`.
- *JSON* (op het overzicht, *Importeren (JSON)*): een export van het hele dossier of van één jaar. Per jaar Toevoegen, Vervangen of Overslaan, optioneel met de bedragen van de accountant en de vinkjes van Aangifte invullen. Alles gebeurt in één transactie; daarvoor bewaart de server een herstelpunt (30 dagen) en *Ongedaan maken* zet de vorige versie terug.

**Ontwikkelen met worktrees.** `scripts/ronde2-worktree.sh <agent> <poort>` maakt een git-worktree met een eigen branch, poort, `.env.local` en databaseschema; `scripts/dev-account.ts` maakt in dat schema een ontwikkelaccount met 2FA (`--code` geeft de huidige code).

## Fiscaal rapport (PDF en Excel)

Op de exportpagina van een jaar (`/dossier/<jaar>/export/`) maak je het fiscaal rapport aangifte inkomstenbelasting in dezelfde opbouw als het rapport van een accountant: voorblad, inhoudsopgave, 1 persoonlijke gegevens, 2 inkomstenbelasting en premieheffing, 3 belastbaar inkomen, 4 bijlagen, 5 winstaangifte per onderneming en 6 ondernemersaftrek. Eén rapport per persoon; je kiest persoon A, persoon B of beide partners (twee rapporten achter elkaar, elk met een eigen voorblad en paginanummering). Een onderdeel zonder gegevens valt weg en de nummering loopt door.

- **PDF:** A4, Times, de bedragen in kolommen zoals bij de accountant. Wordt in de browser gemaakt.
- **Excel:** een tabblad per persoon met dezelfde regels (bedragen als getal), plus *Gegevens* (elk bedrag met hoofdstuk, regel-id, kolom, peildatum en herkomst), *Invoer* (je invoer als pad en waarde), *Parameters* (rekenparameters met status en bron) en *Samenvatting*.
- **Persoonlijke gegevens:** adres en samenlevingsvorm vul je op dezelfde pagina in (versleuteld per huishouden). Zonder adres staat op het voorblad alleen je naam.
- **Accountant:** de bedragen die je op de pagina Accountant invult, staan in de verantwoording naast de berekening, met het verschil.
- **Hoofdstuk 5 (winstaangifte):** de winst komt uit de berekening. Voor de kapitaalsvergelijking, de fiscale vermogensopstelling, de winst- en verliesrekening in rubrieken en de specificaties van de balans vul je bij de onderneming de *Jaarrekening voor het rapport* in: balans begin en eind, privé-onttrekkingen en -stortingen, rubrieken van de winst- en verliesrekening en specificaties. Of je neemt hem over uit Moneybird: de import deelt de balans in op de RGS-code, haalt aanschaf- en restwaarde uit de vaste activa en zet de privérekeningen om in onttrekkingen en stortingen (bron `moneybird`). Zonder jaarrekening toont hoofdstuk 5 alleen de winst, de oudedagsreserve en het eindvermogen, en de verantwoording zegt dat. De berekening verandert niet door de jaarrekening.

Bewust anders dan bij de accountant:

- **Geen BSN.** De tool vraagt en bewaart geen burgerservicenummers; rekening- en polisnummers staan er ook niet in. Rechts in de kopregel staat `Berekend op: <datum>` in plaats van de indieningsdatum.
- **Geen brief.** Op de plek van de samenstellingsverklaring staat een verantwoording: de uitkomsten (te betalen of te ontvangen, per persoon en voor het huishouden), dat het een indicatieve berekening is en geen advies, de bron van de cijfers, de rekenparameters met hun status (definitief, voorlopig of geschat), de gekozen methoden, wat niet is meegenomen of is weggelaten en waarom, en de verschillen met je accountant. Geen naam of logo van een kantoor.
- **Notatie:** hele euro's met een punt als duizendtalscheiding, geen euroteken in tabellen, percentages als `20,00%`.

Een voorbeeld zonder dossier maak je met `npm run rapport:voorbeeld -- <map>` (optioneel `--datum 2026-10-04`): het rapport van persoon A en van beide partners als PDF en Excel, uit het voorbeeldhuishouden 2024 en 2021 (met jaarrekening) en, alleen lokaal, uit de privé-fixtures als die er zijn. Die laatste uitvoer bevat echte bedragen: schrijf hem buiten de repository. Code: `lib/rapport/` (model in `model.ts`, bouw in `bouw.ts` en `secties/`), `components/dossier/rapport-pdf.ts` en `rapport-xlsx.ts`.

## Back-up

Op 1 februari en 1 augustus (Nederlandse tijd) maakt de server een volledige back-up van de database en mailt die als bijlage naar `BACKUP_MAIL_TO`.

- **Wat erin zit:** alle tabellen van het dossier: accounts (e-mail, wachtwoordhash en TOTP-geheim), huishoudens, belastingjaren, snapshots, accountantsregels en Moneybird-koppelingen. De administratie van de back-ups zelf en `_migrations` gaan niet mee; die bouwt het herstel opnieuw op.
- **Versleuteling:** het hele bestand (`.ibcbak`) is gzip plus AES-256-GCM, met per back-up een eigen sleutel die is afgeleid van `DOSSIER_KEY` (HKDF). Elke gewijzigde byte valt op bij het openen. De mail zelf bevat alleen datum, grootte, SHA-256, aantallen rijen per tabel en de herstelstappen, geen financiële gegevens en geen adressen van gebruikers.
- **Waarom je `DOSSIER_KEY` apart bewaart:** zonder die sleutel is de back-up niet te openen, en de dossiers erin ook niet. Gaat de server verloren, dan heb je de mail én de sleutel nodig. Bewaar de sleutel daarom op een andere plek dan de mailbox, bijvoorbeeld in je wachtwoordmanager.
- **Wanneer precies:** de scheduler start met de server (`instrumentation.ts`) en kijkt elk uur. Was de server op 1 februari niet bereikbaar, dan haalt hij de back-up tot 30 dagen later in. Na een mislukte poging wacht hij 1, 2, 4, 8, 16 en daarna 24 uur. Een back-up groter dan 20 MB gaat niet per mail (status te groot); maak die met het script hieronder.
- **Inrichten:** zet `BACKUP_MAIL_TO`, `MAIL_FROM` en `RESEND_API_KEY` (of de `SMTP_*`-variabelen). `MAIL_FROM` moet op een domein staan dat bij je mailprovider is geverifieerd, bijvoorbeeld `noreply@example.nl`. Na een herstart logt de server `Back-up: gepland op 1 februari en 1 augustus ...` of `Back-up: niet ingericht (ontbreekt: ...)`.
- **Testen:** in het dossieroverzicht staat de kaart Back-up met de laatste en de volgende back-up. De knop **Nu een back-up mailen** stuurt er meteen een (maximaal drie per uur). Kijk of de mail met bijlage aankomt en controleer de bijlage met `bekijk` hieronder.

### Terugzetten

1. Sla de bijlage op, bijvoorbeeld als `backups/ibcalculator-backup-2027-02-01.ibcbak`. De map `backups/` staat in `.gitignore` en `.dockerignore`.
2. Zet `DATABASE_URL` op de database waarin je wilt terugzetten en `DOSSIER_KEY` op de sleutel waarmee de back-up is gemaakt. Gebruik een versie van de app die minstens zo nieuw is als die in de back-up.
3. Controleer het bestand: `npm run backup -- bekijk backups/ibcalculator-backup-2027-02-01.ibcbak`. Je ziet datum, versie van de app, migraties en rijen per tabel. Met een andere sleutel krijg je een melding met de sleutel-id van het bestand.
4. Zet het terug: `npm run backup -- herstel backups/ibcalculator-backup-2027-02-01.ibcbak`. Het script maakt eerst precies de tabellen van de back-up aan (de migraties uit het bestand), zet de rijen terug in één transactie en voert daarna nieuwere migraties uit, zodat die ook over de teruggezette gegevens lopen. Het stopt zonder iets te wijzigen als:
   - de database tabellen van een andere app bevat (kies dan een lege database);
   - er al gegevens in staan (met `--overschrijf` vervang je ze; het script meldt hoeveel accounts verdwijnen die niet in de back-up zitten);
   - de database al verder gemigreerd is dan de back-up. Dat is normaal als de app al draait, want `start.sh` migreert bij elke start. Gebruik dan `--schema-opnieuw`: dat verwijdert de tabellen van ibcalculator in die database en bouwt ze op tot de stand van de back-up. Staan er gegevens in, dan is daarnaast `--overschrijf` nodig.
5. Na elk herstel zijn alle bestaande sessies ingetrokken, ook sessies die iemand intussen op een lege installatie heeft verkregen. Start de app opnieuw. Inloggen gaat met het account en de tweestapsverificatie uit de back-up.

Na een volledige uitval (nieuwe Postgres, app opnieuw gedeployed) is de snelste route in de container: `npx tsx scripts/backup.ts herstel <bestand> --schema-opnieuw --overschrijf`. Zet eerst het bestand in de container en controleer met `bekijk` dat de sleutel klopt.

Verder:

- `npm run backup -- maak` schrijft een back-up naar `./backups/`. Met `--uit <map>` kies je een andere map, met `--mail` gaat hij ook per mail (en telt hij als back-up op verzoek).
- `npm run backup -- ontsleutel <bestand> <uit.json>` schrijft de ontsleutelde inhoud als JSON. Daarin staan gevoelige gegevens (adressen, wachtwoordhashes, TOTP-geheimen); verwijder het bestand na gebruik.
- In de container op de server werkt hetzelfde script: `npx tsx scripts/backup.ts maak --mail`.
- Code: `lib/backup/` (contract in `types.ts`), tabel `backups` (migratie 0004), route `app/api/dossier/backup`, kaart `components/dossier/BackupKaart.tsx`.

## Deploy (CapRover)

1. Maak in CapRover een app voor ibcalculator en een Postgres-app voor de database.
2. Zet de omgevingsvariabelen hierboven (de `NEXT_PUBLIC_*`-variabelen ook als build-arg), voor de back-up ook `BACKUP_MAIL_TO` en de mailvariabelen.
3. Zet in GitHub de secrets `CAPROVER_SERVER`, `APP_NAME` en `APP_TOKEN`; zonder die secrets slaat de workflow de deploy over en draait alleen test en build.
4. `start.sh` voert bij elke start `scripts/migrate.ts` uit als `DATABASE_URL` is gezet (idempotent, per bestand een transactie).
5. Open `/dossier/setup` direct na de eerste deploy: de eerste die daar een account aanmaakt, claimt de instantie.
6. Controleer `/api/health` (laatste definitieve jaar, varianten, versie).

## Onderhoud van de jaarparameters

Zie de onderhoudskalender in het plan (hoofdstuk 6.5). Elke wijziging in `lib/tax/years` krijgt een changelogregel met bron; `npx tsx scripts/tax-diff.ts --check` draait in CI. Eerstvolgende momenten: KOT-besluit 2027 (half oktober 2026), Zvw en minimumloon (november), stemmingen Belastingplan 2027 (Tweede Kamer 12 november, Eerste Kamer 15 december 2026), definitieve box 3-forfaits 2026 (februari 2027). Daarnaast: de belastingrente vanaf 1 januari 2027 (nu 5,5% geschat) nakijken na 1 november en na de publicatie in december; de landentabel van de bronbelasting bij de primaire bronnen nakijken (alle landen staan op geschat); de indeling van Aangifte invullen 2026 nakijken zodra het programma op 1 maart 2027 opent.

Indicatieve berekening, geen fiscaal advies.
