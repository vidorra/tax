# ibcalculator: conventies

IB-aangiftetool voor zzp-huishoudens. Het plan (versie 2) staat buiten deze repository. Stack: Next.js 15 App Router, React 19, Tailwind 3.4, Drizzle + SQLite (better-sqlite3, één bestand in DATABASE_PATH), Docker (CapRover). Tests met vitest.

## Rekenkern (`lib/tax`)

- `types.ts` is het contract. Wijzig het alleen als het echt nodig is en houd bestaande velden stabiel.
- **Geen fiscaal getal buiten `lib/tax/years/`.** Modules lezen alles uit `TaxYearParams`. Ook geen jaartallen als regel (`if (jaar >= 2025)`): gebruik een vlag in de params.
- Elke module is puur: geen React, geen fetch, geen `Date.now()`, geen I/O. Invoer en params erin, uitkomst met `uitleg: Uitlegregel[]` en `waarschuwingen: Waarschuwing[]` eruit.
- Afrondingen alleen via `AFRONDING` uit `rounding.ts`, zodat elke afronding een naam heeft.
- Uitlegregels via `regel()` uit `uitleg.ts`; label in gewone Nederlandse taal, `formule` met de echte getallen, `parameter` met het pad in de params.
- Datums via `datum.ts`.
- Tests naast de module in `lib/tax/__tests__/modules/<module>.spec.ts`. Publieke tests rekenen met het verzonnen voorbeeldhuishouden in `lib/voorbeeld/` (`voorbeeldInvoer(2024)` of `voorbeeldInvoer(2021)`) of met eigen verzonnen getallen.
- Regressietests tegen echte aangiftes staan met hun fixtures in mappen `prive/` (onder andere `lib/tax/__tests__/prive/`, `lib/rapport/__tests__/prive/`), die git negeert (`**/prive/` in `.gitignore`). Ze draaien alleen lokaal en laden hun fixture met `laadPrive` (`lib/__tests__/prive.ts`) en `describe.skipIf`, zodat een schone kloon compileert en groen is. Nooit een privé-JSON statisch importeren.
- Geen echte bedragen, namen, datums, rekening- of polisnummers, bank- of verzekeraarsnamen of gegevens van de accountant in bestanden die git volgt, ook niet in commentaar of kennisbankvoorbeelden. Brondocumenten (PDF's, schermafbeeldingen) blijven buiten de repository.

## Jaarparameters (`lib/tax/years`)

- Eén bestand per jaar, registreren in `years/index.ts`.
- Elke wijziging krijgt een `changelog`-regel met datum en bron. Status per blok, afwijkingen per veld via `veldStatus`.
- Varianten (twee voorstellen tegelijk, zoals 2027) via `varianten[].pas`.
- Primaire bronnen gaan voor: MinFin-bijlage "Fiscale parameters", Belastingdienst jaarpagina's, Staatscourant/Staatsblad.

## Database (`lib/db`)

- Eén SQLite-bestand (`DATABASE_PATH`, standaard `data/ibcalculator.db` in de werkmap; in de container `/app/data`, een Persistent Directory). Geen databaseserver, geen `DATABASE_URL`. Instance count 1.
- `getDb()` (Drizzle) en `getSqlite()` (ruw) openen lui. Schrijven dat uit meer dan één statement bestaat of eerst leest, gaat via `schrijf((tx) => ...)` (BEGIN IMMEDIATE). Die functie is synchroon: `.all()`, `.get()`, `.run()`, geen `await`. Async werk (hashen, fetch) ervoor of erna. Geen advisory locks of `FOR UPDATE`.
- Tijdstippen zijn `Date` in de code en ISO-tekst (UTC) in de database (kolomtype `tijdstip`), booleans 0/1, JSON als tekst. In ruwe SQL geef je een `Date` als `.toISOString()` mee.
- Schemawijziging: een nieuw bestand in `migrations/` (nooit een bestaand wijzigen) en `lib/db/schema.ts` gelijk houden; `lib/db/__tests__/schema.spec.ts` vergelijkt ze. Een tabel opnieuw opbouwen kan met de markering `-- migratie: zonder-foreign-keys` (zie `lib/db/migreer.ts`).
- Tests met een database gebruiken `gebruikTijdelijkeDb()` uit `lib/db/testdb.ts`: een eigen, gemigreerd bestand per test. Ze draaien altijd.
- Fouten van de database vertaal je met `dbFoutSoort(e)`; nooit inhoud van rijen in een melding of log.

## UI

- Kaarten `bg-white rounded-2xl border border-gray-200 shadow-sm`, chips voor keuzes, live herberekening, sticky resultaatpaneel op desktop, vaste balk onderin op mobiel. Geen wizards.
- Copy in natuurlijk Nederlands. Geen em-dashes, geen pijlen in lopende tekst, geen beloftes die we niet kunnen waarmaken ("indicatieve berekening, geen advies").
- Hover alleen kleurverandering, geen transform.
