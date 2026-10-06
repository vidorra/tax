/**
 * Contract van het fiscaal rapport: één model, twee weergaven (PDF en Excel).
 *
 * De opbouw volgt het fiscaal rapport aangifte inkomstenbelasting zoals een accountant dat maakt
 * (voorblad, inhoudsopgave, hoofdstuk 1 persoonlijke gegevens tot en met 6 ondernemersaftrek), één
 * rapport per belastingplichtige. In plaats van de brief van de accountant staat er een verantwoording:
 * indicatieve berekening, bron van de cijfers, rekenparameters met status, methoden en wat niet is meegenomen.
 *
 *  - lib/rapport/bouw.ts         bouwRapport(): puur, uit invoer, uitkomst en parameters; secties in lib/rapport/secties/.
 *  - lib/rapport/nummering.ts    nummer(): nummert doorlopend over de secties die er zijn en geeft de inhoudsopgave.
 *  - lib/rapport/notatie.ts      bedragen '127.935', '-13.260', percentages, datums.
 *  - lib/rapport/plat.ts         platte regels voor het tabblad Gegevens en pad-waardeparen voor het tabblad Invoer.
 *  - components/dossier/rapport-pdf.ts   jsPDF, Times, twee doorlopen (opmaak, dan tekenen met paginanummers).
 *  - components/dossier/rapport-xlsx.ts  write-excel-file, tabblad per persoon plus Gegevens, Invoer, Parameters, Samenvatting.
 *
 * Regels: geen rekenlogica van de engine dupliceren (ontbrekende uitkomstvelden additief in lib/tax/types.ts
 * toevoegen en in de engine vullen); geen jaartallen als voorwaarde (verschillen volgen uit params en uitkomst);
 * geen BSN; een sectie zonder gegevens valt weg en de verantwoording zegt dat.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId, Status, TaxYearParams } from '@/lib/tax/types'
import type { DossierStatus } from '@/lib/dossier/status'

/** Bedragkolommen van het standaardraster: N (nummer), Z, A, B, C (van links naar rechts, rechts uitgelijnd). */
export type Kolom = 'N' | 'Z' | 'A' | 'B' | 'C'

/** Afwijkende kolomindelingen; de renderer kent de x-posities per raster. */
export type Raster = 'standaard' | 'lijfrente' | 'balans' | 'investeringsaftrek'

export const RAPPORT_MODEL_VERSIE = 1 as const

export interface RapportDocument {
  modelVersie: typeof RAPPORT_MODEL_VERSIE
  jaar: number
  persoon: PersoonId
  /** 'Fiscaal rapport aangifte inkomstenbelasting 2024' */
  titel: string
  /** Naam van de belastingplichtige, met terugval 'Persoon A'. */
  naam: string
  /** Kopregel op elke rapportpagina. Links de titel met naam; rechts bijvoorbeeld 'Berekend op: 4 oktober 2026'. 'pagina: n' zet de renderer. */
  kopregel: { links: string; rechts: string[] }
  voorblad: Voorblad
  verantwoording: Verantwoording
  /** Hoofdstukken (niveau 1), in volgorde; nummers vult nummer() in. */
  hoofdstukken: Sectie[]
  /**
   * Ronde 2 (A3). Er staan nog fouten open in een jaar dat niet is ingediend: het woord CONCEPT op elke pagina (PDF) en
   * bovenaan elk rapporttabblad (Excel). Bij status Ingediend nooit (besluit na de nacontrole).
   */
  concept?: boolean
}

export interface Voorblad {
  /** Naam en adres (adres alleen als ingevuld bij de persoonlijke gegevens van het huishouden). */
  adresregels: string[]
  /** Bijvoorbeeld: Opgesteld met, Datum, Status. */
  regels: Array<{ label: string; waarde: string }>
}

export interface Verantwoording {
  /** Uitkomstenblok: te betalen of te ontvangen IB en Zvw van deze persoon, daarna partner en huishouden. */
  uitkomsten: Array<{ label: string; bedrag: number; afsluiting?: 'enkel' | 'dubbel' }>
  /** 'Indicatieve berekening, geen advies. ...' */
  statusZin: string
  bronnen: Array<{ onderdeel: string; bron: string }>
  parameters: Array<{ blok: string; status: Status; bron?: string }>
  methoden: Array<{ label: string; waarde: string }>
  /** Wat niet is meegenomen of weggelaten, met reden (bijvoorbeeld 'Balans niet opgenomen: geen gegevens ingevoerd'). */
  nietMeegenomen: string[]
  /** Verschillen met de accountant, als die bedragen in het dossier staan. */
  verschillen: Array<{ label: string; accountant: number | null; berekend: number; toelichting?: string }>
  meldingen: Array<{ ernst: 'info' | 'let-op' | 'actie'; tekst: string }>
  /** ISO-datum van de berekening. */
  berekendOp: string
  toolVersie: string
  /** Ronde 2 (A3). Controles: open fouten (concept), open controles (ingediend) en bewust genegeerde controles. */
  controles?: VerantwoordingControles
}

/** Ronde 2 (A3). Controles in de verantwoording; zie lib/rapport/controles.ts. */
export interface VerantwoordingControles {
  /** Kopregel bovenaan de verantwoording: "Concept: er staan nog 2 fouten open." of "Ingediend, met 1 open controle". */
  kop?: string
  /** Titel van de lijst open controles: "Open fouten" (concept) of "Open controles" (ingediend). */
  openTitel?: string
  open: Array<{ titel: string; waar?: string; uitleg: string }>
  genegeerd: Array<{ titel: string; waar?: string; reden?: string; datum: string; ernst: 'fout' | 'let-op' | 'info' }>
}

/**
 * Ronde 2 (A3). Wat de exportpagina over de controles aan het rapport meegeeft (uit `controleerAlles`). Puur gegevens:
 * het rapport rekent zelf geen controles.
 */
export interface RapportControles {
  /** Open fouten in een concept of bij Gecontroleerd (`exportConcept`): CONCEPT en `-concept` in de bestandsnaam. */
  concept: boolean
  /** Status Ingediend met open fouten (`exportIngediendOpen`): het aantal, voor de kopregel; anders 0. */
  ingediendOpen: number
  /** De open fouten, in de volgorde van de controles. */
  open: Array<{ titel: string; waar?: string; uitleg: string }>
  /** Bewust genegeerde controles (met reden) en als gezien afgevinkte let op met een notitie. */
  genegeerd: Array<{ titel: string; waar?: string; reden?: string; op: string; ernst: 'fout' | 'let-op' | 'info' }>
}

export interface Sectie {
  /** Ingevuld door nummer(): '2', '2.2', '2.2.1'. */
  nummer?: string
  titel: string
  niveau: 1 | 2 | 3
  /** Kolomkoppen op de regel van de titel zelf ('Fiscaal begin' / 'Fiscaal eind', 'Fiscaal 2024'). */
  kopKolommen?: KolomKop[]
  blokken: Blok[]
  secties: Sectie[]
  /** Hoofdstukken beginnen op een nieuwe pagina. */
  nieuwePagina?: boolean
  /** Niet over twee pagina's splitsen als het past. */
  bijElkaar?: boolean
}

export type Blok = TabelBlok | TekstBlok | VraagBlok | GegevensBlok

export interface KolomKop {
  /** Bedragkolom, of de naam van een tekstkolom ('omschrijving', 'rekening', 'soort', 'datum'). */
  kolom: Kolom | string
  /** Meerregelige kop, onderaan uitgelijnd. */
  regels: string[]
  /** 'kop' = vet cursief; 'datum' = vet (peildatum of Fiscaal begin/eind). */
  stijl: 'kop' | 'datum'
  streepOnder?: boolean
  /** Uitlijning in een bedragkolom; standaard rechts. 'links' = op de linkerrand van de cel (5.6.1 Begin/Einde). */
  uitlijning?: 'links' | 'rechts'
}

export interface TabelBlok {
  soort: 'tabel'
  raster: Raster
  /** Groepskop die op elke vervolgpagina terugkomt (bijlage lijfrente). */
  herhaalKop?: string
  koppen?: KolomKop[]
  regels: Regel[]
  bijElkaar?: boolean
}

export interface Regel {
  /** Stabiel id ('2.2.1.schijf-1'); voor het tabblad Gegevens en voor tests. Uniek binnen het document. */
  id: string
  /** Ontbreekt bij een subtotaal zonder omschrijving. */
  label?: string
  soort: 'post' | 'groepskop' | 'subkop' | 'subtotaal' | 'totaal'
  bedragen?: Partial<Record<Kolom, number>>
  /** Percentage als fractie (0.0932) per kolom, bijvoorbeeld de box 3-rendementstabel. */
  percentages?: Partial<Record<Kolom, number>>
  /** Tekstcellen per tekstkolom (sleutel = kolomnaam uit de koppen). */
  teksten?: Record<string, string>
  /** Bedragkolommen waarin een tekstcel links wordt uitgelijnd (op de linkerrand van de cel) in plaats van rechts. */
  tekstLinks?: Kolom[]
  /** 'regel' = label en bedrag vet; 'bedrag' = alleen het bedrag vet. */
  vet?: 'regel' | 'bedrag'
  cursief?: boolean
  streepBoven?: Kolom[]
  streepOnder?: Kolom[]
  dubbelOnder?: Kolom[]
  /** Witregels vóór deze regel. */
  witVoor?: 1 | 2
  /** Peildatum per bedragkolom, voor het tabblad Gegevens. */
  peildatum?: Partial<Record<Kolom, 'begin' | 'eind'>>
  /** Waar het bedrag vandaan komt ('personen[0].box1.schijven[0].belasting'), voor het tabblad Gegevens. */
  herkomst?: string
}

export interface TekstBlok {
  soort: 'tekst'
  tekst: string
  stijl?: 'gewoon' | 'vet' | 'cursief' | 'opsomming'
  witVoor?: 1 | 2
}

export interface VraagBlok {
  soort: 'vraag'
  id: string
  vraag: string
  antwoord: string
  /** Standaard staat het antwoord rechts op de rand van kolom C. Met een kolom staat het links uitgelijnd op de linkerrand van die cel (5.6.1: B). */
  antwoordKolom?: Kolom
  witVoor?: 1 | 2
}

export interface GegevensBlok {
  soort: 'gegevens'
  rijen: Array<{ label: string; waarde?: string; kop?: boolean; witVoor?: 1 | 2 }>
}

/** Persoonlijke gegevens buiten de engine, versleuteld in households.gegevens_enc (zie lib/dossier/gegevens.ts). */
export interface HuishoudenGegevens {
  adres?: { straat: string; postcode: string; plaats: string }
  /** Informatief, voor hoofdstuk 1. Fiscaal partnerschap zelf staat in de invoer van het jaar. */
  samenlevingsvorm?: 'gehuwd' | 'geregistreerd-partner' | 'samenwonend-met-contract' | 'samenwonend' | 'alleenstaand'
}

export interface RapportOpties {
  persoon: PersoonId
  /** ISO-datum van vandaag (de bouwfunctie roept geen Date.now() aan). */
  vandaag: string
  dossierStatus: DossierStatus
  gegevens?: HuishoudenGegevens
  /** Accountantsbedragen van dit jaar uit het dossier, voor de verschillenlijst; null of weg = geen. */
  accountant?: unknown
  toolVersie: string
  /** Naam per persoon zoals de UI die toont (terugval 'Persoon A'). */
  naam: (id: PersoonId) => string
  /** Ronde 2 (A3). Controles van het jaar; zonder: geen CONCEPT en geen lijsten in de verantwoording. */
  controles?: RapportControles
}

/** Bouwt het rapport van één belastingplichtige. Puur. */
export type BouwRapport = (invoer: HuishoudenInvoer, resultaat: HuishoudenResultaat, params: TaxYearParams, opties: RapportOpties) => RapportDocument

/** Eén regel van de inhoudsopgave; paginanummers vult de PDF-renderer in. */
export interface InhoudRegel {
  nummer: string
  titel: string
  niveau: 1 | 2 | 3
  sectie: Sectie
}
