/**
 * Ronde 2, contract: invulhulp in de volgorde van de online aangifte IB van de Belastingdienst, met vergelijking met de
 * vooraf ingevulde aangifte (VIA). Zie ontwerp-ronde2.md, onderdeel 1, en ronde2/belastingdienst-volgorde.md.
 *
 * - lib/invulhulp/indeling/<aangiftejaar>.ts: de schermen als data (labels letterlijk, OLA-id's), één bestand per
 *   aangiftejaar met een status 'nagekeken' of 'verwacht'. Een wijziging in het aangifteprogramma raakt één bestand.
 * - lib/invulhulp/opbouw.ts: `bouwInvulhulp(ctx): InvulhulpOpbouw` vult de schermen met de bedragen uit invoer en uitkomst.
 * - lib/invulhulp/voortgang.ts: tellen, status per veld, vingerafdrukken.
 * De voortgang (vinkjes, VIA-bedragen, keuzes) staat per jaar in de aangiftestaat (lib/dossier/aangiftestaat.ts).
 * Alles puur: geen React, geen I/O.
 */
import type { Bron, HuishoudenInvoer, HuishoudenResultaat, PersoonId, TaxYearParams } from '@/lib/tax/types'
import type { VeldId } from '@/lib/dossier/veld'

/**
 * Soort veld in het programma: V = vooraf ingevuld (VIA of de aangifte van vorig jaar), controleren; Z = zelf invullen;
 * B = berekent de Belastingdienst, alleen ter controle; K = ja/nee- of keuzevraag die bepaalt welke schermen verschijnen.
 */
export type VeldSoort = 'V' | 'Z' | 'B' | 'K'

/**
 * Ronde 2 (na de toets): twee soorten rijen om af te handelen, plus rijen ter controle.
 * - 'invullen' (Z en K): bedrag kopiëren of het antwoord overnemen en afvinken; label "Ingevuld".
 * - 'controleren' (V): de Belastingdienst heeft het al ingevuld. Eén klik "Klopt" vinkt af en zet `via` gelijk aan het
 *   dossierbedrag; alleen bij "Wijkt af" komen het invoerveld voor het bedrag van de Belastingdienst en de keuze
 *   tevoorschijn. Label "Gecontroleerd".
 * - 'berekend' (B): rekent het programma zelf; "Ter controle: € …", geen vinkje.
 * Voortgang: 'invullen' en 'controleren' tellen mee (ook keuzevragen), 'berekend' niet.
 */
export type RijSoort = 'invullen' | 'controleren' | 'berekend'

export const RIJ_SOORT: Record<VeldSoort, RijSoort> = { V: 'controleren', Z: 'invullen', K: 'invullen', B: 'berekend' }

/** Telt een rij van deze soort mee in "18 van 42"? */
export const TELT_MEE: Record<RijSoort, boolean> = { invullen: true, controleren: true, berekend: false }

/** Kolom bij een tabel in het programma (balans, materiële vaste activa, vorderingen). */
export type InvulhulpKolom = 'begin' | 'eind' | 'kosten' | 'restwaarde' | 'nominaal'

export interface InvulhulpContext {
  /** Belastingjaar van het dossier. */
  jaar: number
  /** Opgeslagen invoer, met vaste id's (lib/dossier/ids.ts `vulIds`, deterministisch). */
  invoer: HuishoudenInvoer
  resultaat: HuishoudenResultaat
  params: TaxYearParams
  /** Voor wie dit scherm wordt opgebouwd. */
  persoon: PersoonId
  /** Bij schermen per onderneming: de index in `personen[persoon].ondernemingen` (om de invoer te lezen). */
  ondernemingIndex?: number
  /** Bij schermen per onderneming: `OndernemingInvoer.id` (voor sleutels; nooit de index). */
  ondernemingId?: string
  /** Bij een herhalende rubriek: het item waarvoor de velden worden opgebouwd. */
  item?: InvulhulpItem
}

/**
 * Ronde 2 (na de toets): een item van een herhalende rubriek (per werkgever, uitkering, bankrekening, belegging,
 * bronbelastingregel, schuld, leningdeel, investering, onderneming, box 2-belang). `id` is de vaste id van het item
 * (LoonInvoer.id, VermogensPositie.id, BronbelastingRegel.id, SchuldPositie.id, LeningdeelInvoer.id, InvesteringInvoer.id,
 * Box2Invoer.id); `index` alleen om de invoer te lezen.
 */
export interface InvulhulpItem {
  soort: 'loon' | 'positie' | 'bronbelasting' | 'schuld' | 'leningdeel' | 'investering' | 'box2' | 'land'
  id: string
  index: number
  /** Bij een bronbelastingregel: de positie waar hij bij hoort. */
  ouderId?: string
}

/** Waarde van een veld: een bedrag, bedragen per kolom, een antwoord op een keuzevraag, of tekst. null = leeg. */
export type VeldWaarde =
  | { soort: 'bedrag'; bedrag: number | null }
  | { soort: 'kolommen'; bedragen: Partial<Record<InvulhulpKolom, number | null>> }
  | { soort: 'antwoord'; antwoord: string | null }
  | { soort: 'tekst'; tekst: string | null }

export interface VeldHerkomst {
  /** "Uit: Ontwerpstudio, saldo fiscale winstberekening". */
  label: string
  /** Veld om naartoe te springen met Aanpassen. */
  veld?: VeldId
}

/** Wie het veld vooraf invult en hoe zeker dat is (belastingdienst-volgorde.md hoofdstuk 5). */
export interface ViaInfo {
  bron: string
  /** false = misschien vooraf ingevuld (bijvoorbeeld lijfrentepremies): wel vergelijken, zachte tekst. */
  zeker: boolean
}

export interface VeldDefinitie {
  /** Uniek binnen het scherm; samen met de schermsleutel de sleutel van de voortgang. Liefst het OLA-id. */
  id: string
  /** Label letterlijk zoals in het programma; plaatshouders <persoon>, <partner>, <onderneming>, [jaar], [j-1]. */
  label: string
  olaId?: string
  soort: VeldSoort
  waarde: (ctx: InvulhulpContext) => VeldWaarde
  herkomst?: (ctx: InvulhulpContext) => VeldHerkomst | null
  via?: ViaInfo
  /** Ook tonen als de waarde leeg is (VIA-velden worden altijd getoond). */
  altijd?: boolean
  toon?: (ctx: InvulhulpContext) => boolean
  /** Korte hulptekst onder het veld, bijvoorbeeld bij de auto- en transportkosten zonder geboekte bijtelling. */
  hint?: (ctx: InvulhulpContext) => string | null
}

export interface RubriekDefinitie {
  id: string
  titel?: string
  kolommen?: InvulhulpKolom[]
  velden: VeldDefinitie[]
  /**
   * Ronde 2 (na de toets): herhalende rubriek. Geeft per item een eigen context (met `item`); de velden worden per item
   * opgebouwd. `sleutel` is de vaste id van het item; `titel` bijvoorbeeld "Acme BV" of "DEGIRO · Verenigde Staten".
   * De voortgangssleutel wordt `${scherm.sleutel}/${rubriek.id}:${sleutel}/${veld.id}`, zodat het weghalen van een item
   * geen vinkjes of VIA-bedragen naar een ander item schuift.
   */
  herhaal?: (ctx: InvulhulpContext) => Array<{ sleutel: string; titel: string; ctx: InvulhulpContext }>
}

export interface SchermDefinitie {
  id: string
  /** Kop zoals in het programma. */
  titel: string
  /** Pad in het linkermenu van het programma. */
  menu: string[]
  /** Eén keer per persoon, per onderneming van die persoon, of één keer voor beide partners samen. */
  herhaling: 'persoon' | 'onderneming' | 'samen'
  toon?: (ctx: InvulhulpContext) => boolean
  toelichting?: (ctx: InvulhulpContext) => string | null
  rubrieken: RubriekDefinitie[]
  /**
   * Ronde 2 (A1). Melding bovenaan het scherm, eventueel met een link naar een veld in de invoer, bijvoorbeeld "Het
   * aangifteprogramma vraagt hier de winst-en-verliesrekening van Ontwerpstudio. …" met "Naar de jaarrekening".
   */
  melding?: (ctx: InvulhulpContext) => SchermMelding | null
}

/** Ronde 2 (A1). Melding bij een scherm (zie `SchermDefinitie.melding`). */
export interface SchermMelding {
  tekst: string
  /** 'info' (standaard) of 'let-op' (een grens van het online programma, bijvoorbeeld hooguit drie ondernemingen). */
  variant?: 'info' | 'let-op'
  link?: { label: string; veld: VeldId }
}

/** De schermen van één aangiftejaar. */
export interface InvulhulpIndeling {
  aangiftejaar: number
  /** 'nagekeken' tegen het programma (simulatie of echte aangifte), 'verwacht' = afgeleid (bijvoorbeeld 2026). */
  status: 'nagekeken' | 'verwacht'
  nagekekenOp?: string
  bron: Bron
  schermen: SchermDefinitie[]
  /**
   * Ronde 2 (A1). Dag waarop de aangifte over een jaar opent, als 'MM-DD' in het jaar erna ('03-01'). Daarmee toont de
   * pagina voor een lopend jaar "De aangifte over {jaar} opent op 1 maart {jaar + 1}."
   */
  opentOp?: string
  /**
   * Ronde 2 (A1). Keuzes van het programma die per aangiftejaar als tekst in het formulier staan (geen fiscale
   * getallen): de klassen van "Jaar waarin deze lening is afgesloten" als [van, tot] (tot null = het aangiftejaar zelf).
   */
  leningjaarKlassen?: Array<{ label: string; van: number | null; tot: number | null }>
}

// ---------------------------------------------------------------------------
// Opgebouwd voor een dossierjaar
// ---------------------------------------------------------------------------

export interface Veld {
  /**
   * Sleutel van de voortgang: `${scherm.sleutel}/${definitie.id}`, of bij een herhalende rubriek
   * `${scherm.sleutel}/${rubriek.id}:${item.id}/${definitie.id}`. Alleen tekens uit [A-Za-z0-9:/._-] (aangiftestaat).
   */
  sleutel: string
  id: string
  label: string
  olaId?: string
  soort: VeldSoort
  /** Ronde 2: `RIJ_SOORT[soort]`. */
  rij: RijSoort
  waarde: VeldWaarde
  herkomst: VeldHerkomst | null
  via: ViaInfo | null
  hint: string | null
  /** Vingerafdruk van de waarde; verandert die na het afvinken, dan gaat het vinkje uit ("Bedrag gewijzigd"). */
  vingerafdruk: string
  /**
   * Ronde 2 (A1). Leeg (geen bedrag, antwoord of tekst) en daarom standaard verborgen: "{n} velden zonder bedrag
   * verborgen · Toon". Nooit bij V-velden en velden met `altijd`. Een leeg veld telt niet mee in de voortgang.
   */
  leeg?: boolean
}

export interface Rubriek {
  /** `${definitie.id}` of bij een herhalende rubriek `${definitie.id}:${item.id}`. */
  id: string
  titel?: string
  kolommen?: InvulhulpKolom[]
  velden: Veld[]
}

export interface Scherm {
  /**
   * `${definitie.id}`, of `${definitie.id}:o-${ondernemingId}` bij een onderneming (de vaste id, nooit de index), of
   * `${id}:${persoon}`.
   */
  sleutel: string
  id: string
  titel: string
  menu: string[]
  /** Persoon van dit scherm, of 'samen' (Verdelen). */
  persoon: PersoonId | 'samen'
  onderneming?: { index: number; id: string; naam: string }
  toelichting: string | null
  rubrieken: Rubriek[]
  /** Ronde 2 (A1). Zie `SchermDefinitie.melding`. */
  melding?: SchermMelding | null
}

export interface InvulhulpOpbouw {
  /** Jaar van de gebruikte indeling (het dossierjaar, of het laatste bekende jaar met een melding). */
  aangiftejaar: number
  indelingStatus: InvulhulpIndeling['status']
  nagekekenOp?: string
  schermen: Scherm[]
  /** Bijvoorbeeld: "De aangifte over 2026 opent op 1 maart 2027; dit is de volgorde van 2025." */
  meldingen: string[]
  /** Ronde 2 (A1). `InvulhulpIndeling.opentOp` van de gebruikte indeling. */
  opentOp?: string
  /**
   * Ronde 2 (A1). De persoon bij wie de gezamenlijke schermen (persoon 'samen') horen: de eerste persoon, die de
   * aangifte voor beide partners invult. Hun voortgang staat onder die persoon en telt alleen daar mee, zodat de
   * tellingen van twee partners samen niets dubbel tellen.
   */
  samenBij?: PersoonId
}

// ---------------------------------------------------------------------------
// Voortgang, bewaard in de aangiftestaat
// ---------------------------------------------------------------------------

export type VerschilKeuze = 'mijn-bedrag' | 'bedrag-belastingdienst' | 'uitzoeken'

export interface VeldVoortgang {
  /** Afgevinkt met de vingerafdruk van de waarde op dat moment ("Ingevuld" of "Gecontroleerd"). */
  afgevinkt?: { vingerafdruk: string; op: string }
  /**
   * Bedrag uit de vooraf ingevulde aangifte (alleen rijen 'controleren'). "Klopt" zet hier het dossierbedrag van dat
   * moment neer; bij "Wijkt af" typt de gebruiker het bedrag van de Belastingdienst. null = leeg. Verandert het
   * dossierbedrag later, dan blijft dit staan en ontstaat een verschil (plus 'gewijzigd' op het vinkje).
   */
  via?: number | null
  keuze?: VerschilKeuze
  /** Maximaal 500 tekens. */
  notitie?: string
}

export interface InvulhulpVoortgang {
  /** Per persoon per veldsleutel. Een scherm 'samen' bewaart onder elke persoon zijn eigen deel. */
  velden: Partial<Record<PersoonId, Record<string, VeldVoortgang>>>
  /** Eindcontrole: wat het aangifteprogramma als te betalen (positief) of terug (negatief) berekent. */
  programma?: Partial<Record<PersoonId, { ib?: number | null; zvw?: number | null }>>
}

/** Status van één veld voor de lijst en de filters. */
export type InvulhulpVeldStatus = 'leeg' | 'te-doen' | 'afgevinkt' | 'gewijzigd' | 'verschil'

/** Telling per persoon: alleen rijen waarvoor `TELT_MEE[rij]` (invullen en controleren, inclusief keuzevragen). */
export interface InvulhulpTelling {
  afgevinkt: number
  totaal: number
  /** Open verschillen met de VIA zonder keuze 'mijn-bedrag' of 'bedrag-belastingdienst'. */
  verschillen: number
  /** Afgevinkt, maar het bedrag is sindsdien veranderd. */
  gewijzigd: number
}

/** Tolerantie voor 'gelijk' tussen dossier en VIA (hele euro's) en voor de eindcontrole (afrondingen). */
export const VIA_TOLERANTIE = 1
export const EINDCONTROLE_TOLERANTIE = 5
