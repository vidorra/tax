/**
 * Ronde 2 (contract, na de toets): veldregister en regelingen voor springen en zoeken.
 *
 * Springen werkt op de pagina zelf (useSpringNaar, A3): het element met `data-veld` staat al in de DOM, ook in een
 * dichte uitklap (Disclosure rendert met `hidden`); de sprong klapt open wat dicht is en zet de focus. Het register
 * levert alleen wat de DOM niet weet: een leesbaar label ("Naar Saldo fiscale winstberekening, Ontwerpstudio, Persoon A"),
 * de sectie om naartoe te gaan als het veld niet meer bestaat, en zoekwoorden.
 *
 * Elk onderdeel registreert zijn eigen velden en regelingen in een eigen bestand in deze map (basis.ts A3, prive.ts A2,
 * bronbelasting-partner.ts A5, regelingen-onderneming.ts A6, invulhulp.ts A1 als nodig) en zet het op zijn eigen regel
 * in index.ts, net als de controleregels. Het zoekveld (RegelingZoeker, A3) leest alleen index.ts en kent zo na de
 * integratie ook de velden en regelingen van de andere onderdelen.
 */
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'

/** Delen van een veld-id die bij een patroon passen: de sleutels op de plekken van '*'. */
export interface VeldMatch {
  id: string
  persoon?: PersoonId
  sleutels: string[]
}

export interface VeldregisterItem {
  /**
   * Patroon van een veld-id, segment voor segment; '*' past op precies één sleutel. Bijvoorbeeld
   * 'persoon:*\/onderneming:*\/herinvesteringsreserve:*\/voornemen' (zonder de backslashes).
   */
  patroon: string
  /** Label zoals in de editor; met de invoer om namen in te vullen (onderneming, bezitting). */
  label: string | ((m: VeldMatch, invoer: HuishoudenInvoer) => string)
  /** Sectie-id (anker op de jaarpagina) als het veld niet meer bestaat: "Je staat nu bij {sectie}". */
  sectie: string
  /** Leesbare naam van de sectie voor die melding ("Ondernemingen", "Vermogen"). */
  sectieNaam: string
  /** Zoekwoorden naast het label (ux-ronde2.md 8.7). */
  synoniemen?: string[]
  /**
   * Staat dit veld nu op de pagina? Voor velden in een blok dat er alleen is als een onderdeel bestaat (de auto, een
   * staking, een verkoop) of als een keuze is gemaakt (winst uitgesplitst). Zonder: het veld staat er zodra de lijsten
   * en onderdelen uit het patroon in de invoer bestaan (`instanties`). Het zoekveld toont alleen velden die er staan.
   */
  bestaat?: (m: VeldMatch, invoer: HuishoudenInvoer) => boolean
  /**
   * Een ingang voor iets dat nog leeg is: de schakelaar Eigen woning, de knop Investering toevoegen. Het zoekveld zet er
   * "nog niet ingevuld" bij, zodat een eerste zoekopdracht ("hypotheek", "kia") ook in een leeg jaar ergens heen leidt.
   */
  nogNietIngevuld?: (m: VeldMatch, invoer: HuishoudenInvoer) => boolean
}

/** Plaats van een bijzondere situatie (ux-ronde2.md 8.2). */
export type RegelingPlaats = 'onderneming' | 'woning' | 'box2' | 'box3' | 'aanslag' | 'pensioen' | 'loon'

export interface RegelingItem {
  /** Id van de optie in de SituatieKiezer (bijvoorbeeld 'hir', 'staking', 'partner', 'verhuisd'). */
  id: string
  /** Naam in de zoekresultaten: "Herinvesteringsreserve". */
  naam: string
  /** Eén zin uitleg, zoals bij de optie in de kiezer. */
  uitleg: string
  synoniemen: string[]
  plaats: RegelingPlaats
  /**
   * Waar de regeling al actief is: per plek het veld om naartoe te springen. Leeg = nog nergens; dan opent het zoekveld
   * de kiezer met OPEN_VERZOEK en zet de focus op de optie (nooit ongevraagd toevoegen).
   */
  actiefBij: (invoer: HuishoudenInvoer) => Array<{ veld: string; waar: string }>
  /** Id's van de elementen met de SituatieKiezer waar deze optie in staat (per persoon en onderneming). */
  kiezers: (invoer: HuishoudenInvoer) => Array<{ elementId: string; waar: string }>
}
