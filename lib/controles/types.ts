/**
 * Ronde 2, contract: controles vóór het afronden van een jaar. Zie ontwerp-ronde2.md, onderdeel 3 (hoofdstuk 6).
 *
 * Wat blokkeren betekent (besluit na de toets):
 * - Alleen de status Gecontroleerd vraagt dat alle fouten zijn opgelost of bewust genegeerd met een reden. Concept en
 *   Ingediend kunnen altijd. Ingediend is een feit (de aangifte is verstuurd) en wordt nooit geblokkeerd en nooit
 *   automatisch teruggezet; met open fouten vraagt de pagina één bevestiging en komt er een let op ingediend-met-fouten.
 * - Export met open fouten geeft in een concept (en bij Gecontroleerd) een download met CONCEPT-stempel en de lijst open
 *   fouten in de verantwoording. Besluit na de nacontrole: bij status Ingediend géén CONCEPT-stempel, wel de kopregel
 *   "Ingediend, met {n} open controles" in de verantwoording en de lijst van die open controles (`exportIngediendOpen`).
 * - Elke fout heeft een uitweg: oplossen, of negeren met een reden die in de verantwoording komt. Alleen een fout over
 *   ontbrekende gegevens die de berekening of het aangifteprogramma echt nodig heeft (geboortedatum, naam of
 *   omschrijving, land, datum van staking, dagwaarde) is niet te negeren ('nee'): die is er om in te vullen (bevestigd
 *   na de nacontrole, ook als een lege naam geen rekenfout geeft). Regels over interpretatie of over beperkingen van het
 *   online programma zijn een let op, geen fout.
 * - Rustig invullen: in een conceptjaar dat nog niet "streng" is (`controlesStreng`), zijn de controles ingeklapt met
 *   een neutraal (grijs) aantal en staat er geen foutknop in de mobiele balk. Rood verschijnt pas als de gebruiker het
 *   jaar op Gecontroleerd wil zetten, de invulhulp of de export opent, of het controlepaneel zelf openklapt; dat moment
 *   staat in de aangiftestaat (`controles.streng`) en blijft gelden. Besluit na de nacontrole: een veld dat de gebruiker
 *   net verliet, mag ook in een rustig conceptjaar zijn eigen fout tonen (gewone veldvalidatie bij dat veld); het blok
 *   Controles, de teller en de mobiele foutknop blijven rustig tot dat moment.
 *
 * Opbouw:
 * - lib/controles/regels/*.ts: pure regels (geen React, geen I/O), elk `(ctx) => Controle[]`; register in regels/index.ts.
 * - lib/controles/index.ts: `controleer(ctx): ControleUitkomst` (alle regels, ontdubbelen, sorteren, genegeerd toepassen
 *   met `beoordeelNegering` uit lib/controles/negeren.ts). Staat al in het contract, zodat elke agent hem in de eigen
 *   worktree kan gebruiken; A3 is daarna eigenaar.
 * - Genegeerde controles staan in de aangiftestaat per jaar (lib/dossier/aangiftestaat.ts, `genegeerd`), niet in de invoer.
 *
 * Een Controle is iets om na te kijken of te doen vóór het indienen. Meldingen van de engine (`Waarschuwing`) blijven
 * uitleg bij de berekening; een melding die als controle terugkomt, toont de UI alleen bij de controles.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId, TaxYearParams, Bron } from '@/lib/tax/types'
import type { VeldId } from '@/lib/dossier/veld'
import type { AangifteStaat } from '@/lib/dossier/aangiftestaat'
import type { DossierStatus } from '@/lib/dossier/status'

/**
 * fout: maakt de aangifte onjuist of onmogelijk; houdt de status Gecontroleerd tegen tot hij is opgelost of met een
 * reden is genegeerd, en geeft een CONCEPT-export. let-op: waarschijnlijk niet goed, kan een bewuste keuze zijn, of een
 * beperking van het programma. info: kans of goed om te weten.
 */
export type ControleErnst = 'fout' | 'let-op' | 'info'

/**
 * Hoe een controle weg kan zonder op te lossen:
 *  - 'met-reden': negeren met een verplichte reden (komt in het rapport onder "Bewust genegeerde controles");
 *  - 'gezien': afvinken als gezien, notitie optioneel (let op);
 *  - 'nee': moet worden ingevuld. Alleen voor ontbrekende gegevens die de berekening of het aangifteprogramma echt
 *    nodig heeft (geboortedatum, land bij bronbelasting, datum van staking, dagwaarde youngtimer).
 * Info kan altijd worden ingeklapt; dat wordt niet bewaard.
 */
export type ControleNegeren = 'met-reden' | 'gezien' | 'nee'

/** Volgorde op de pagina, zodat "Naar het veld" van boven naar beneden werkt. */
export type ControleGebied =
  | 'huishouden'
  | 'onderneming'
  | 'loon'
  | 'pensioen'
  | 'aanslag'
  | 'woning'
  | 'box3'
  | 'aftrek'
  | 'box2'
  | 'verdeling'
  | 'invulhulp'
  | 'planning'
  | 'parameters'

export const GEBIED_VOLGORDE: readonly ControleGebied[] = [
  'huishouden',
  'onderneming',
  'loon',
  'pensioen',
  'aanslag',
  'woning',
  'box3',
  'aftrek',
  'box2',
  'verdeling',
  'invulhulp',
  'planning',
  'parameters',
]

/**
 * Kapitaalsvergelijking: een verschil tot `max(tolerantieMin, tolerantiePerPost × ingevulde balansposten)` is
 * afronding (Moneybird rondt per balanspost af); boven € 1 maar binnen die tolerantie een let op, daarboven een fout
 * (met-reden). Geen fiscaal getal: een tolerantie van de tool.
 */
export const KAPITAALSVERGELIJKING = { ondergrens: 1, tolerantieMin: 10, tolerantiePerPost: 1 } as const

/** va-te-laag slaat pas aan als de verwachte belastingrente over het verschil minstens dit bedrag is (tooldrempel). */
export const VA_RENTE_DREMPEL = 25

/**
 * Ronde 2 (A3). Grenzen van het online aangifteprogramma van de Belastingdienst (geen fiscale getallen): het programma
 * kent hooguit drie ondernemingen per persoon (belastingdienst-volgorde.md 4.1). Controle ondernemingen-max.
 */
export const ONLINE_PROGRAMMA = { maxOndernemingenPerPersoon: 3 } as const

/** Een snelle oplossing die de invoer wijzigt zoals typen dat doet; daarna slaat de gebruiker op. */
export interface ControleOplossing {
  /** Knoptekst, bijvoorbeeld "Gebruik € 41.200 uit de balans". */
  label: string
  /** Wijzigt een kopie van de invoer (de editor roept dit aan via `wijzig`). */
  pas?: (d: HuishoudenInvoer) => void
  /** Of een actie die de UI kent. */
  actie?: 'saldi-opnieuw-overnemen' | 'naar-invulhulp' | 'naar-planning'
}

export interface Controle {
  /**
   * Stabiel per regel en onderwerp: `${regel}` of `${regel}:${onderwerp}`, bijvoorbeeld 'kapitaalsvergelijking:A:ond-1'
   * of 'bron-land:positie-ab12cd:bb-x9'. Onderwerpen met een vaste id (lib/dossier/ids.ts) gebruiken die id, nooit een
   * index. Sleutel voor negeren.
   */
  id: string
  /** Id van de regel, bijvoorbeeld 'kapitaalsvergelijking'. */
  regel: string
  ernst: ControleErnst
  /** Kort, zonder punt: "Kapitaalsvergelijking sluit niet". */
  titel: string
  /** Eén of twee zinnen met de echte bedragen, in gewoon Nederlands. */
  uitleg: string
  /** Waar het over gaat, voor in de lijst: "Ontwerpstudio · Persoon A". */
  waar?: string
  persoon?: PersoonId
  gebied: ControleGebied
  /** Veld om naartoe te springen; null als er geen veld is (dan de sectie, de invulhulp of een actie). */
  veld: VeldId | null
  /** Sectie-id als er geen veld is (bijvoorbeeld 'vermogen'). */
  sectie?: string
  /** Sleutel van een rij in de invulhulp (`Veld.sleutel`), voor regels van de invulhulp: "Naar de rij". */
  invulhulpSleutel?: string
  /** Of een vaste link (bijvoorbeeld '/dossier/2025/planning/#voorlopige-aanslag'). */
  href?: string
  negeren: ControleNegeren
  /**
   * Vingerafdruk van alleen het beslissende gegeven (niet van alle balanswaarden), zodat een negering blijft gelden
   * zolang het materiële verschil gelijk is. Voorbeelden: kapitaalsvergelijking 'verschil=312'; hir-afboeking
   * 'afboeking=7000|max=5000'; bron-onbekend-land 'land=ZA|bruto=1000'. Verandert die, dan staat een genegeerde controle
   * weer open ("Je had deze fout genegeerd, maar de bedragen zijn sindsdien veranderd").
   */
  vingerafdruk: string
  oplossing?: ControleOplossing
  bron?: Bron
  /**
   * Ronde 2 (A3). Meer velden om naartoe te springen, elk met een label (verplicht-leeg: hooguit vijf). `veld` is dan
   * het eerste.
   */
  velden?: Array<{ veld: VeldId; label: string }>
  /**
   * Ronde 2 (A3). Id van de melding van de engine (`Waarschuwing.id`) die deze controle vervangt. Die melding staat dan
   * alleen bij de controles en niet ook bij Meldingen in het uitkomstpaneel (`verborgenMeldingen` in index.ts).
   */
  melding?: string
  /** Ronde 2 (A3). Tekst van de knop bij `href` of `sectie` ("Naar de planning", "Bekijk de status"); anders "Naar het veld". */
  linkLabel?: string
}

/** Een bewust genegeerde of als gezien afgevinkte controle, per jaar bewaard in de aangiftestaat. */
export interface GenegeerdeControle {
  id: string
  ernst: ControleErnst
  /** Titel op het moment van negeren (voor het rapport, ook als de regel later verandert). */
  titel: string
  vingerafdruk: string
  /** Verplicht bij 'met-reden'; optioneel bij 'gezien'. Maximaal 500 tekens. */
  reden?: string
  /** ISO-tijdstip. */
  op: string
}

export interface ControleTelling {
  fouten: number
  letOp: number
  info: number
  genegeerd: number
}

export interface ControleUitkomst {
  /** Alle controles, gesorteerd: ernst (fout, let op, info), dan gebied, dan de volgorde van de regels. */
  alle: Controle[]
  /** Niet (geldig) genegeerd, of genegeerd met een andere vingerafdruk. */
  open: Controle[]
  /** Geldig genegeerd met dezelfde vingerafdruk (zie `geldigeNegering`). */
  genegeerd: Array<{ controle: Controle; negering: GenegeerdeControle }>
  /** Genegeerd, maar de bedragen zijn veranderd: staat weer open, met de melding "Kijk opnieuw". */
  weerOpen: Controle[]
  telling: ControleTelling
  /** Open fouten > 0: de status Gecontroleerd kan niet. Concept en Ingediend kunnen altijd. */
  blokkeertGecontroleerd: boolean
  /**
   * Open fouten > 0 en de status is niet Ingediend: de export (PDF en Excel) krijgt een CONCEPT-stempel, `-concept` in de
   * bestandsnaam en de open fouten in de verantwoording.
   */
  exportConcept: boolean
  /**
   * Ronde 2 (besluit na de nacontrole). Status Ingediend met open fouten: het aantal open fouten. De export krijgt dan
   * géén CONCEPT-stempel, wel de kopregel "Ingediend, met {n} open controles" in de verantwoording en de lijst van die
   * open controles. 0 in alle andere gevallen.
   */
  exportIngediendOpen: number
  /** De berekening lukte niet; dan zijn alleen de controles op de invoer uitgevoerd. */
  zonderBerekening: boolean
}

export interface ControleContext {
  jaar: number
  invoer: HuishoudenInvoer
  /** null als de berekening niet lukt. */
  resultaat: HuishoudenResultaat | null
  params: TaxYearParams
  /** Ronde 2 (na de toets). Status van het jaar; in de editor de gekozen status (nog niet opgeslagen mag). */
  status: DossierStatus
  /**
   * Ronde 2 (na de toets). Wanneer het jaar op Ingediend is gezet (server, kolom dossier_years.ingediend_op) en of de
   * invoer daarna nog is gewijzigd (server bij het opslaan; de editor ook zolang er niet-opgeslagen wijzigingen zijn).
   * null of ontbreekt als het jaar niet ingediend is. Voor de regel ingediend-gewijzigd.
   */
  ingediend?: { op: string; gewijzigdNa: boolean } | null
  /** Aangiftestaat van dit jaar (genegeerde controles, invulhulp, VIA-bedragen, `controles.streng`). */
  staat?: AangifteStaat | null
  /** Vorig jaar uit het dossier, voor aansluiting van beginbalans en saldi. */
  vorig?: { invoer: HuishoudenInvoer; resultaat: HuishoudenResultaat | null } | null
  /** ISO-datum van vandaag (van de server), voor termijnen; nooit Date.now() in een regel. */
  vandaag: string
}

export type ControleRegel = (ctx: ControleContext) => Controle[]
