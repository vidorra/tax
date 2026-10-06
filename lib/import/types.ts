/**
 * Ronde 2, contract: import van broker-CSV (box 3) en van de eigen JSON-export. Zie ontwerp-ronde2.md, onderdeel 4, en
 * ronde2/broker-import.md (formaten, valkuilen, voorbeeldbestanden in ronde2/csv-voorbeelden met verwacht.json).
 *
 * Broker-CSV wordt in de browser gelezen; alleen wat de gebruiker overneemt, gaat in de invoer (zonder namen of
 * rekeningnummers). Alles in lib/import is puur: geen React, geen fetch, geen Date.now(); de rekeningsleutel
 * (lib/import/sleutel.ts) gebruikt SubtleCrypto met een geheim per huishouden dat de server afleidt.
 *
 * Afspraken na de toets:
 * - Land van de bronbelasting: eerst wat de broker meldt, dan het ISIN-voorvoegsel. Past het ingehouden percentage niet
 *   bij het ISIN-land (bijvoorbeeld 21% op een US-ISIN: een ADR van een Taiwanese uitgever), dan een vraag "Uit welk
 *   land komt dit dividend?" in plaats van een gok.
 * - Een import van een rekening vervangt de jaartotalen van die rekening door die uit alle bestanden die de gebruiker
 *   in één keer kiest (niet optellen). Overlappende perioden tussen die bestanden of met eerder ingelezen bestanden
 *   (`PositieHerkomst.bestanden`) geven een melding.
 * - Omschrijvingen uit een import: alleen spaties weghalen. Bescherming tegen formules hoort in de schrijver
 *   (rapport-xlsx schrijft strings als tekst; een test bewaakt dat), niet in de import.
 */
import type { Eigenaar, HuishoudenInvoer, PersoonId, VermogensPositie } from '@/lib/tax/types'
import type { DossierStatus } from '@/lib/dossier/status'

// ---------------------------------------------------------------------------
// Broker-CSV
// ---------------------------------------------------------------------------

export type BrokerFormaat =
  | 'degiro-rekening'
  | 'degiro-portefeuille'
  | 'ibkr-activity'
  | 'trading212'
  | 'saxo'
  | 'bux'
  | 'rabobank'
  | 'bitvavo'
  | 'coinbase'
  | 'generiek'

/** Zekerheid van een preset (broker-import.md 3.1): kolomkoppen gezien in een echte export, of alleen deels. */
export type PresetZekerheid = 'geverifieerd' | 'deels'

/** Een gelezen CSV-bestand (na sniffing van scheiding, decimaal, BOM, regeleinden en voorloopregels). */
export interface CsvBestand {
  naam: string
  scheiding: ',' | ';' | '\t'
  decimaal: ',' | '.'
  /** Regels vóór de kopregel (Coinbase 'Transactions', 'User,...'); nooit opslaan, kan namen bevatten. */
  voorloop: string[][]
  kop: string[]
  regels: string[][]
}

export type GebeurtenisSoort =
  | 'storting'
  | 'opname'
  | 'koop'
  | 'verkoop'
  | 'dividend'
  | 'dividendbelasting'
  | 'rente'
  | 'kosten'
  | 'valutaIntern'
  | 'cryptoIn'
  | 'cryptoUit'
  | 'staking'
  | 'kapitaalterugbetaling'
  | 'corporateAction'
  | 'negeren'

/** Genormaliseerde regel uit een export (broker-import.md 4.2). */
export interface Gebeurtenis {
  formaat: BrokerFormaat
  /** Rekeningsleutel (gehasht), zie `rekeningSleutel`. */
  rekening: string
  /** Regelnummer in het bestand, voor "uit 4 dividendregels". */
  regel: number
  /** Transactie-id van de broker, als die er is. */
  id?: string
  /** yyyy-mm-dd in Europe/Amsterdam (UTC-tijden zijn omgezet). */
  datum: string
  soort: GebeurtenisSoort
  /** Met teken, in `valuta`. */
  bedrag: number
  valuta: string
  /** Bedrag in euro's als de broker omrekent of de koers bekend is. */
  eur?: number
  koersBron?: 'broker' | 'gebruiker'
  isin?: string
  /** ISO 3166-1 alpha-2. */
  land?: string
  landBron?: 'broker' | 'isin' | 'gebruiker'
  aantal?: number
  /** ISIN of munt. */
  activum?: string
  omschrijving: string
  /** Ronde 2 (A4): de export geeft alleen het netto dividend (Saxo, BUX zonder bruto); het bruto staat in het jaaroverzicht. */
  brutoOnbekend?: boolean
  /** Ronde 2 (A4): opbrengst die geen dividend in verdragszin is (IBKR Payment in Lieu): telt niet mee in het bruto per land. */
  geenVerdragsdividend?: boolean
  /** Ronde 2 (A4): crypto ging naar of kwam van een extern adres (eigen wallet of niet: alleen de gebruiker weet het). */
  extern?: boolean
  /** Ronde 2 (A4): ingehouden belasting op rente (soort dividendbelasting): hoort bij het geld, soort 'rente'. */
  opRente?: boolean
}

/** Stand van een rekening op een peildatum (31-12, de waarde op 1 januari van het jaar erna). */
export interface Stand {
  rekening: string
  datum: string
  regels: Array<{ activum: string; naam: string; aantal?: number; eur: number; soort: 'effect' | 'geld' | 'crypto' }>
}

export interface ImportMelding {
  id: string
  ernst: 'info' | 'let-op' | 'fout'
  tekst: string
  /** Regelnummers in het bestand waar het over gaat. */
  regels?: number[]
}

/** Uitkomst van één preset op één bestand. */
export interface PresetUitkomst {
  formaat: BrokerFormaat
  rekening: string
  gebeurtenissen: Gebeurtenis[]
  standen: Stand[]
  /** Eerste en laatste datum in het bestand; null zonder datums (portefeuille: datum uit de bestandsnaam of de vraag). */
  dekking: { van: string; tot: string } | null
  meldingen: ImportMelding[]
  /**
   * Ronde 2 (A4): het gelezen bestand, voor herkomst.bestanden: hash van de genormaliseerde regels (zonder voorloopregels)
   * en het aantal regels. De component zet het na het lezen; presets laten het leeg.
   */
  bestand?: { naam: string; hash: string; regels: number }
}

export interface Preset {
  formaat: BrokerFormaat
  /** Naam in de UI: "DEGIRO rekeningoverzicht". */
  naam: string
  zekerheid: PresetZekerheid
  /** Herkenning op de kopregel en de voorloopregels, niet op de bestandsnaam. */
  herken: (bestand: CsvBestand) => boolean
  lees: (bestand: CsvBestand, opties: { jaar: number }) => PresetUitkomst
  /**
   * Ronde 2 (A4): rekening- of portefeuillenummer uit het bestand (IBKR Account, Rabobank Portefeuille), alleen in het
   * geheugen van de browser: het wordt direct een HMAC-sleutel (lib/import/sleutel.ts) en nooit bewaard. Ontbreekt de
   * functie of geeft hij null, dan kiest de gebruiker een bestaande rekening of "Nieuwe rekening".
   */
  rekeningnummer?: (bestand: CsvBestand) => string | null
}

export type KolomBetekenis =
  | 'datum'
  | 'soort'
  | 'omschrijving'
  | 'bedrag'
  | 'valuta'
  | 'isin'
  | 'aantal'
  | 'waarde'
  | 'bronbelasting'
  | 'land'
  | 'negeren'

/** Generieke kolomkoppeling (broker-import.md 4.4), onthouden per kopregel. */
export interface KolomKoppeling {
  /** Hash van de kopregel; dezelfde koppen geven dezelfde koppeling. */
  kopSleutel: string
  scheiding: CsvBestand['scheiding']
  decimaal: CsvBestand['decimaal']
  /** Betekenis per kolomindex. */
  kolommen: Record<number, KolomBetekenis>
  /**
   * Unieke waarden uit de kolom Soort (of Omschrijving) naar een soort. Alleen onthouden als de kolom hooguit
   * `KOPPELING_WAARDEN.max` unieke waarden heeft, elk hooguit `KOPPELING_WAARDEN.maxLengte` tekens en zonder een reeks
   * van `KOPPELING_WAARDEN.maxCijfers` of meer cijfers (geen IBAN's, rekeningnummers of namen van tegenpartijen in
   * localStorage); anders wordt `waarden` niet bewaard.
   */
  waarden?: Record<string, GebeurtenisSoort>
  /** Wat het bestand is: een stand op 1 januari van het jaar, op 1 januari van het jaar erna, of transacties. */
  inhoud: 'stand-begin' | 'stand-eind' | 'transacties'
}

/** Grenzen voor het onthouden van kolomwaarden in de browser (privacy, zie `KolomKoppeling.waarden`). */
export const KOPPELING_WAARDEN = { max: 30, maxLengte: 40, maxCijfers: 6 } as const

/** Eén zichtbare wijziging in het voorstel (Gegeven · Nu · Wordt). */
export interface ImportWijziging {
  label: string
  nu: number | string | null
  wordt: number | string | null
  /** Regelnummers waar het bedrag uit komt. */
  regels?: number[]
  /** Ronde 2 (A4): korte toelichting onder het bedrag, bijvoorbeeld "waarvan kosten € 10,40". */
  toelichting?: string
}

/** Een vraag die alleen de gebruiker kan beantwoorden (eigen wallet? peildatum? staat de rekening al in de VIA?). */
export interface ImportVraag {
  id: string
  tekst: string
  opties: Array<{ waarde: string; label: string }>
  gekozen?: string
  /** Ronde 2 (A4): zonder antwoord kan de gebruiker niet overnemen (VIA, waar het geld staat). */
  verplicht?: boolean
  /** Ronde 2 (A4): bij de optie 'anders' kiest de gebruiker een land uit een lijst (land van een dividend of van rente). */
  land?: boolean
}

/**
 * Voorstel per rekening: wat er in box 3 verandert. Twee of drie posities: effecten, geld, crypto (ze vallen in de
 * aangifte in een andere categorie). Het paneel toont eerst `samenvatting` voor de hele rekening en daaronder per
 * positie een uitklap met de doelbezitting en de interne stromen (een aankoop is een storting bij de effecten en een
 * opname bij het geld).
 */
export interface ImportVoorstel {
  rekening: string
  formaat: BrokerFormaat
  /** "DEGIRO beleggingsrekening". */
  naam: string
  eigenaar: Eigenaar
  /**
   * Ronde 2 (na de toets): de rekening als geheel, zonder interne stromen: "DEGIRO, Persoon A: gestort € 6.000,
   * dividend € 1.380, waarde op 1 januari € 61.240". null = niet bekend.
   */
  samenvatting: {
    gestort: number
    opgenomen: number
    dividendBruto: number
    rente: number
    kosten: number
    bronbelasting: number
    dividendbelasting: number
    waardeBegin: number | null
    waardeEind: number | null
  }
  /** Periode van alle gekozen bestanden samen en of die overlappen (met elkaar of met eerder ingelezen bestanden). */
  periode: { van: string; tot: string } | null
  overlap: Array<{ van: string; tot: string; bron: 'gekozen-bestanden' | 'eerder-ingelezen' }>
  posities: Array<{
    rol: 'effecten' | 'geld' | 'crypto'
    /** Bestaande positie met dezelfde herkomst-sleutel en rol, of de gekozen positie; null = nieuw. */
    bestaandId: string | null
    wordt: VermogensPositie
    wijzigingen: ImportWijziging[]
  }>
  /** Wat nog nodig is, met uitleg waar het getal staat (bijvoorbeeld de waarde op 31 december). */
  ontbreekt: Array<{ rol: 'effecten' | 'geld' | 'crypto'; veld: 'waardeBegin' | 'waardeEind' | 'koers'; uitleg: string }>
  vragen: ImportVraag[]
  meldingen: ImportMelding[]
  /**
   * Hetzelfde bestand (dezelfde hash van de genormaliseerde regels) is al ingelezen. Geen blokkade: een melding "Dit
   * bestand lijkt al ingelezen op {datum}. Er verandert niets, tenzij je iets anders kiest." met de knop "Toch opnieuw
   * inlezen" (bijvoorbeeld na een verkeerde peildatum).
   */
  alIngelezen: boolean
  /** Ronde 2 (A4): datum van de vorige import (yyyy-mm-dd), voor "Dit bestand lijkt al ingelezen op {datum}". */
  ingelezenOp?: string
  /**
   * Ronde 2 (A4): interne stromen tussen effecten (of crypto) en geld, voor de zin "De aankopen (€ 1.239) tellen als
   * storting bij de effecten en als opname bij het geld."; `netto` is het netto dividend en de rente op het geld.
   */
  stromen?: { aankopen: number; verkopen: number; netto: number; kosten: number }
  /** Ronde 2 (A4): de rekening is van twee personen die geen fiscale partners zijn; elke bezitting is in twee helften gesplitst. */
  samen?: boolean
}

/**
 * Ronde 2 (na de toets): ongedaan maken van een broker-import in de editor. Alleen de posities die de import heeft
 * veranderd of toegevoegd gaan terug; wat de gebruiker daarna bij andere bezittingen typte blijft staan. Is een van deze
 * posities na de import nog aangepast (`naImport` verschilt van de huidige), dan eerst bevestigen: "Je latere
 * wijzigingen bij {naam} gaan ook verloren. Doorgaan?". Kan tot de volgende import of het verlaten van de pagina.
 */
export interface BrokerOngedaan {
  /** Per positie-id de positie vóór de import (null = nieuw toegevoegd) en direct na de import. */
  posities: Array<{ id: string; voor: VermogensPositie | null; naImport: VermogensPositie }>
}

// ---------------------------------------------------------------------------
// JSON-import (eigen export)
// ---------------------------------------------------------------------------

/** De twee bestaande formaten: ExportPagina (één jaar) en lib/dossier/opslag.ts exporteer() (het hele dossier). */
export type JsonFormaat = 'ibcalculator-jaar' | 'ibcalculator-dossier-export'

export type JsonJaarActie = 'toevoegen' | 'vervangen' | 'overslaan'

/** Eén jaar uit het bestand, zoals het panel het toont. */
export interface JsonImportJaar {
  jaar: number
  /** Kan de tool dit jaar berekenen (parameters bekend, invoer geldig)? */
  mogelijk: boolean
  /** Validatiefouten met pad, maximaal twaalf. */
  fouten: string[]
  bestaat: boolean
  /** Standaard: 'toevoegen' als het jaar nieuw is, 'overslaan' als het al bestaat. */
  standaard: JsonJaarActie
  bestand: { bijgewerkt?: string; status?: DossierStatus; teBetalenIB?: number; personen: number; ondernemingen: number; posities: number }
  /** Het jaar zoals het nu in het dossier staat (status: Ingediend blijft Ingediend bij Vervangen). */
  dossier?: { bijgewerkt: string; teBetalenIB?: number; status?: DossierStatus }
  /** Opnieuw berekend met de huidige parameters (de samenvatting in het bestand vertrouwen we niet). */
  berekend?: { teBetalenIB: number }
  /** De versie in het dossier is nieuwer dan die in het bestand. */
  dossierNieuwer: boolean
  heeft: { accountant: boolean; aangiftestaat: boolean }
}

export interface JsonImportVoorstel {
  formaat: JsonFormaat
  versie: number
  geexporteerd?: string
  jaren: JsonImportJaar[]
  /**
   * Gegevens buiten de jaren die het bestand bevat. Moneybird-koppelingen neemt de import nooit mee (er zit geen token
   * in het bestand); het panel noemt ze niet.
   */
  ookBeschikbaar: { gegevens: boolean }
  /** Fouten in het bestand als geheel (geen JSON, ander formaat, nieuwere versie). */
  fouten: string[]
}

/**
 * Verzoek aan POST /api/dossier/import. De browser stuurt alleen de gekozen jaren (actie toevoegen of vervangen) en
 * alleen de gekozen onderdelen; overgeslagen jaren en persoonlijke gegevens met de schakelaar uit gaan niet naar de
 * server. De server valideert alles opnieuw (valideerInvoer, schoonStaat, accountantregels) en vertrouwt geen
 * samenvatting uit het bestand.
 */
export interface JsonImportVerzoek {
  formaat: JsonFormaat
  versie: number
  jaren: Array<{
    jaar: number
    actie: Exclude<JsonJaarActie, 'overslaan'>
    invoer: unknown
    variant?: string | null
    /** Status uit het bestand: 'ingediend' blijft ingediend, 'gecontroleerd' wordt 'concept' (de controles kunnen nu anders uitkomen). */
    status?: DossierStatus
    accountant?: unknown
    aangiftestaat?: unknown
  }>
  /** Alleen als de schakelaar "Persoonlijke gegevens" aan staat. */
  gegevens?: unknown
}

export interface JsonImportResultaat {
  toegevoegd: number[]
  vervangen: number[]
  overgeslagen: number[]
  /** Herstelpunt om de import ongedaan te maken (tabel herstelpunten); null als er niets is vervangen of toegevoegd. */
  herstelpuntId: number | null
  /** Tot wanneer ongedaan maken kan (ISO-datum): aanmaakdatum + HERSTELPUNT_BEWAARDAGEN. */
  herstelpuntTot: string | null
  /** Bijvoorbeeld "2023 staat op Ingediend, zoals in het bestand; 2024 stond op Gecontroleerd en staat nu op Concept." */
  meldingen: string[]
}

/** Een herstelpunt wordt na zoveel dagen opgeruimd; de melding na de import noemt de datum. */
export const HERSTELPUNT_BEWAARDAGEN = 30

/**
 * Het herstelpunt van de laatste JSON-import dat nog geldig is, voor de regel "Ongedaan maken" op het overzicht. Blijft
 * na herladen staan tot `tot`; daarna is het herstelpunt weg (opgeruimd door de server).
 */
export interface ActiefHerstelpunt {
  herstelpuntId: number
  /** Datum van de import (yyyy-mm-dd, Europe/Amsterdam). */
  aangemaakt: string
  /** Tot wanneer ongedaan maken kan (yyyy-mm-dd, Europe/Amsterdam). */
  tot: string
  toegevoegd: number[]
  vervangen: number[]
  /** De import verving ook de persoonlijke gegevens. */
  gegevens: boolean
}

/**
 * Herstelpunt van een JSON-import: wat er vóór de import was, per jaar (null = het jaar bestond niet), en de versie
 * van het jaar direct na de import. Is het jaar daarna nog opgeslagen (versie verschilt), dan vraagt herstel eerst om
 * bevestiging, zodat latere wijzigingen niet stil verdwijnen.
 */
export interface ImportHerstelpunt {
  reden: 'json-import'
  jaren: Array<{
    jaar: number
    vorige: null | { invoer: HuishoudenInvoer; status: DossierStatus; variant: string | null; accountant: unknown | null; aangiftestaat: unknown | null }
    /** `dossier_years.versie` direct na de import. */
    versieNaImport: number
  }>
}

/** Antwoord van POST /api/dossier/import/herstel zonder `bevestigd`: welke jaren na de import zijn gewijzigd. */
export interface HerstelVoorstel {
  herstelpuntId: number
  jaren: Array<{ jaar: number; actie: 'terugzetten' | 'verwijderen'; gewijzigdNaImport: boolean }>
  tot: string
}

/** Verzoek aan POST /api/dossier/import/herstel. Zonder `bevestigd` alleen het voorstel; met `bevestigd` uitvoeren. */
export interface HerstelVerzoek {
  herstelpuntId: number
  bevestigd?: boolean
}

/** Personen in een voorstel, voor de eigenaarkeuze. */
export type ImportPersonen = Array<{ id: PersoonId | `kind:${string}`; naam: string }>

// ---------------------------------------------------------------------------
// Ronde 2 (A4): aanvullingen bij het bouwen
// ---------------------------------------------------------------------------

/** Rol van een bezitting binnen een brokerrekening. */
export type ImportRol = 'effecten' | 'geld' | 'crypto'

/** Een ontbrekend gegeven met, bij een koers, de valuta of munt waar het om gaat. */
export type OntbreektItem = ImportVoorstel['ontbreekt'][number] & { valuta?: string; aantal?: number; /** Waar het getal staat ("Waar vind ik die?"). */ waar?: string }

/** Grenzen per bestand (taak-A4 5): groter of langer weigert de import met een melding. */
/** maxBestanden: zoveel CSV-bestanden tegelijk in de broker-import (twaalf maandoverzichten van twee rekeningen passen). */
export const IMPORT_GRENZEN = { maxBytes: 5 * 1024 * 1024, maxRegels: 50_000, maxBestanden: 24 } as const

/** Ronde 2 (A4): aanvullingen op het herstelpunt (interface-samenvoeging). */
export interface ImportHerstelpunt {
  /** Persoonlijke gegevens van vóór de import, alleen als de import ze verving. */
  gegevens?: { vorige: unknown }
  /** Moment van indienen per jaar van vóór de import, zodat herstel ook dat terugzet. */
  ingediend?: Array<{ jaar: number; op: string; gewijzigdNa: boolean }>
}

/** Ronde 2 (A4): antwoord van POST /api/dossier/import/herstel met `bevestigd`. */
export interface HerstelResultaat {
  /** Jaren die weer zo staan als vóór de import. */
  teruggezet: number[]
  /** Jaren die de import had toegevoegd en die weer weg zijn. */
  verwijderd: number[]
  meldingen: string[]
}
