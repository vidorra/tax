/**
 * Centraal typecontract van de rekenkern.
 *
 * Drie lagen:
 *  1. TaxYearParams  - alle cijfers en regels van één belastingjaar (lib/tax/years/<jaar>.ts)
 *  2. HuishoudenInvoer - wat de gebruiker invult (publieke calculator en dossier)
 *  3. HuishoudenResultaat - wat de engine teruggeeft, inclusief uitlegregels per stap
 *
 * Regels:
 *  - Geen fiscaal getal buiten lib/tax/years. Modules lezen alles uit TaxYearParams.
 *  - Regels die per jaar aan/uit gaan zijn vlaggen in de params, nooit `if (jaar >= X)`.
 *  - Bedragen zijn hele euro's tenzij anders vermeld; percentages als fractie (0.3756 = 37,56%).
 *  - Datums zijn ISO-strings 'YYYY-MM-DD'.
 *
 * Ronde 2: de uitbreidingen per onderdeel staan in de blokken onderaan dit bestand (zie daar).
 */

// Dit bestand importeert niets en blijft zelfstandig.

// ---------------------------------------------------------------------------
// 1. Status, bronnen en blokken
// ---------------------------------------------------------------------------

export type Status = 'definitief' | 'voorlopig' | 'voorstel' | 'geschat' | 'rechtspraak'

/** Volgorde van zekerheid; gebruikt om de laagste status van een jaar te bepalen. */
export const STATUS_RANG: Record<Status, number> = {
  definitief: 4,
  rechtspraak: 3,
  voorlopig: 2,
  voorstel: 1,
  geschat: 0,
}

export interface Bron {
  titel: string
  url?: string
  /** Publicatiedatum of datum van raadplegen (ISO). */
  datum: string
}

export interface Blok<T> {
  waarde: T
  status: Status
  bron?: Bron
  toelichting?: string
  /** Afwijkende status per veld (bijv. box3.forfaitBank = 'voorlopig'). */
  veldStatus?: Partial<Record<keyof T, Status>>
  /** Afwijkende bron per veld. */
  veldBron?: Partial<Record<keyof T, Bron>>
}

export interface ChangelogRegel {
  datum: string
  wat: string
  bron?: Bron
}

/**
 * Een alternatieve set parameters die naast de standaard leeft (bijv. 2027:
 * sleuteltabel tegenover de brief van 29 september 2026). `pas` krijgt een
 * diepe kopie van de params en geeft de aangepaste versie terug.
 */
export interface Variant {
  id: string
  label: string
  status: Status
  bron?: Bron
  toelichting: string
  pas: (p: TaxYearParams) => TaxYearParams
}

// ---------------------------------------------------------------------------
// 2. Parameters per belastingjaar
// ---------------------------------------------------------------------------

export interface Schijf {
  /** Bovengrens van de schijf (inclusief); null = geen bovengrens. */
  tot: number | null
  /** Gecombineerd tarief (belasting + premie volksverzekeringen) voor wie de AOW-leeftijd niet heeft bereikt. */
  tarief: number
  /** Alleen het belastingdeel (zonder premies). Buiten schijf 1 gelijk aan `tarief`. */
  belastingDeel: number
}

export type TariefmaatregelPost = 'ondernemersaftrek' | 'mkb' | 'eigenWoning' | 'pga'

export interface Box1Params {
  /** Schijven oplopend. Schijf 1 eindigt bij het maximale premie-inkomen. */
  schijven: Schijf[]
  premies: { aow: number; anw: number; wlz: number }
  /** Grens schijf 1 voor AOW-gerechtigden geboren vóór 1946 (wijkt af). */
  schijf1TotGeborenVoor1946: number
  /** Maximaal tarief waartegen de posten van `tariefmaatregelPosten` aftrekbaar zijn. */
  aftrekTariefMax: number
  tariefmaatregelPosten: TariefmaatregelPost[]
  verliesverrekening: { terug: number; vooruit: number }
}

export interface OpbouwTraject {
  /** Bovengrens van het traject (arbeidsinkomen). */
  tot: number
  /** Kortingsbedrag aan het begin van het traject. */
  basis: number
  /** Opbouwpercentage binnen het traject. */
  pct: number
}

export interface ArbeidskortingParams {
  opbouw: OpbouwTraject[]
  max: number
  afbouwVanaf: number
  afbouwPct: number
}

export interface HeffingskortingenParams {
  algemeen: {
    max: number
    afbouwVanaf: number
    afbouwPct: number
    /** Vanaf 2025 bouwt de AHK af op het verzamelinkomen, daarvoor op box 1. */
    grondslag: 'box1' | 'verzamelinkomen'
    aowMax: number
    aowAfbouwPct: number
  }
  arbeid: ArbeidskortingParams
  arbeidAow: ArbeidskortingParams
  iack: {
    pct: number
    drempel: number
    max: number
    /** Kind moet op 1 januari jonger zijn dan deze leeftijd. */
    maxLeeftijdKind: number
    /** Kind hoort ten minste zoveel maanden van het kalenderjaar tot het huishouden. */
    minMaandenHuishouden: number
    /** Co-ouderschap: minimaal aantal dagen in elk huishouden (sinds 2025), anders null. */
    coOuderMinDagen: number | null
    /** false = regeling bestaat niet (meer) in dit jaar. */
    actief: boolean
  }
  ouderen: { max: number; grens: number; afbouwPct: number; alleenstaand: number }
  jonggehandicapt: number
  groenBeleggen: { pct: number; max: number | null }
  /** Uitbetaling van niet-verzilverde kortingen aan de minstverdienende partner. */
  uitbetalingMinstverdienende: { geborenVoor: string; pct: number }
}

export interface KiaParams {
  minPerBedrijfsmiddel: number
  /** Investeringen tot en met dit bedrag: geen KIA. */
  ondergrens: number
  pct: number
  /** Tot en met dit bedrag: pct × investering. */
  pctTot: number
  vastBedrag: number
  /** Tot en met dit bedrag: vastBedrag. */
  vastTot: number
  /** Daarboven: vastBedrag − afbouwPct × (investering − vastTot). */
  afbouwPct: number
  /** Boven dit bedrag: nul. */
  nulBoven: number
}

export interface OndernemerParams {
  urencriterium: {
    uren: number
    /** Meer dan dit deel van de totale werktijd aan de onderneming (grotendeelscriterium). */
    grotendeelsPct: number
    /** Starters zijn de eerste N jaar vrijgesteld van het grotendeelscriterium. */
    startersVrijstellingJaren: number
    /** Weken zwangerschaps- en bevallingsverlof die als gewerkt tellen. */
    zwangerschapWeken: number
    /** Verlaagd urencriterium voor arbeidsongeschikte starters. */
    verlaagdAO: number
  }
  zelfstandigenaftrek: number
  /** Factor op zelfstandigen- en startersaftrek als op 1 januari de AOW-leeftijd is bereikt. */
  aowFactor: number
  startersaftrek: number
  startersaftrekMaxKeer: number
  startersaftrekBinnenJaren: number
  startersaftrekAO: { staffel: number[]; actief: boolean }
  soAftrek: { basis: number; starters: number; minUren: number }
  meewerkaftrek: {
    staffel: Array<{ vanafUren: number; pct: number }>
    /**
     * Bij een vergoeding van ten minste dit bedrag geldt arbeidsbeloning in plaats van meewerkaftrek. Ronde 2: dit is
     * ook de drempel van art. 3.16 lid 4 (arbeidsbeloning aan de fiscale partner aftrekbaar en bij de partner belast
     * vanaf dit bedrag); de engine leest die drempel alleen hier.
     */
    maxVergoeding: number
    actief: boolean
  }
  stakingsaftrek: number
  mkbWinstvrijstelling: number
  beperktAftrekbaar: { drempel: number; aftrekbaarDeel: number }
  kia: KiaParams
  desinvestering: { drempel: number; jaren: number }
  eia: { pct: number; minPerBedrijfsmiddel: number; meldTermijnMaanden: number }
  mia: { pcts: number[]; minPerBedrijfsmiddel: number }
  vamil: { pct: number }
  afschrijving: {
    maxPctPerJaar: number
    goodwillPct: number
    directAftrekbaarTot: number
    bodemwaardeGebouwEigenGebruik: number
    willekeurigStarters: boolean
  }
  hir: {
    /**
     * De reserve valt uiterlijk in het jaar `ontstaanJaar + termijnJaren` vrij, na afboeking op investeringen van dat
     * jaar (art. 3.54 lid 5: "uiterlijk in het derde jaar na het jaar waarin de reserve is ontstaan").
     */
    termijnJaren: number
    /**
     * Ronde 2. Een bedrijfsmiddel waarop niet of in meer dan zoveel jaar wordt afgeschreven (grond, gebouwen) heet
     * langlopend. Afboeken op een nieuw langlopend middel mag alleen met een reserve uit een middel met dezelfde
     * economische functie (art. 3.54 lid 4). Een reserve uit een langlopend middel hoeft alleen op een middel met
     * dezelfde functie te worden afgeboekt (lid 3), maar afboeken op een kortlopend middel mag.
     */
    langlopendVanafJaren: number
  }
  /**
   * Ronde 2. Terbeschikkingstellingsvrijstelling als deel van het gezamenlijke resultaat uit terbeschikkingstelling
   * (art. 3.99b), ook bij een negatief resultaat. De drempel voor arbeidsbeloning aan de partner (art. 3.16 lid 4) is
   * `meewerkaftrek.maxVergoeding`: er is één veld voor die drempel.
   */
  tbsVrijstellingPct: number
  kilometerTariefPrivevervoer: number
  auto: {
    bijtellingAlgemeen: number
    /** Verlaagde bijtelling nulemissie per jaar van eerste toelating (geldt 60 maanden). */
    bijtellingNulEmissiePerToelatingsjaar: Record<string, { pct: number; cap: number }>
    youngtimerPct: number
    youngtimerLeeftijd: number
    termijnMaanden: number
    priveKmGrens: number
    /**
     * Ronde 2. Overgangsrecht youngtimer (2026: besluit 12-2-2026, nr. 2026-2493; 2027: Belastingplan 2027). Het geldt
     * alleen voor een auto die op `youngtimerOp` al youngtimer was onder de oude grens (eerste toelating meer dan
     * `oudeLeeftijd` jaar vóór die datum) én uiterlijk op `terBeschikkingUiterlijk` ter beschikking stond. Gevolg:
     * youngtimer het hele jaar. Het is een goedkeuring en dus een keuze: de engine rekent beide regimes en neemt de
     * laagste bijtelling, met een uitlegregel. Een auto die pas na `youngtimerOp` de oude grens passeert, valt erbuiten.
     * null = geen overgangsrecht.
     */
    youngtimerOvergang: { terBeschikkingUiterlijk: string; youngtimerOp: string; oudeLeeftijd: number } | null
    /**
     * Ronde 2. Forfaitaire btw-correctie privégebruik (goedkeuring, laatste btw-aangifte van het jaar) als deel van de
     * cataloguswaarde inclusief btw en bpm: `standaardPct`, of `verlaagdPct` als het privégebruik later is dan
     * `verlaagdNaJaren` jaar na het jaar van ingebruikname of als bij aanschaf geen btw is afgetrokken.
     */
    btwPrive: { standaardPct: number; verlaagdPct: number; verlaagdNaJaren: number }
  }
  for: {
    dotatie: boolean
    dotatiePct?: number
    dotatieMax?: number
    /**
     * Gronden voor de verplichte afname (art. 3.70 lid 1 onder b, tekst 2022): dan neemt de FOR af met het deel
     * boven het ondernemingsvermogen aan het einde van het jaar. 'bovenOndernemingsvermogen' is geen eigen grond
     * en wordt genegeerd; de waarde blijft in het type voor oudere params.
     */
    verplichteAfnameBij: Array<'staking' | 'aow' | 'urencriterium2jaar' | 'bovenOndernemingsvermogen'>
    omzettingLijfrenteExtraRuimte: boolean
    betaalTermijnMaanden: number
  }
  werkruimte: {
    zelfstandigheidsEis: boolean
    /** [minimaal deel inkomen in of vanuit de werkruimte, minimaal deel in de werkruimte] bij een werkplek elders. */
    inkomensEisMetWerkplekElders: [number, number]
    inkomensEisZonderWerkplekElders: number
  }
  nietBenutteZelfstandigenaftrekJaren: number
}

export interface LijfrenteParams {
  regime: 'pre-wtp' | 'wtp'
  /** Percentage van de premiegrondslag (wtp 30%, daarvoor 13,3% of 13,8%). */
  pct: number
  franchise: number
  inkomensgrens: number
  maxJaarruimte: number
  maxReserveringsruimte: number
  /** Pre-wtp: reserveringsruimte ook begrensd op dit deel van de premiegrondslag; null bij wtp. */
  reserveringsruimtePctGrondslag: number | null
  terugkijkJaren: number
  factorA: { toegestaan: boolean; factor: number }
  maxJarenNaAOW: number
  saldomethodeMax: number
}

export interface InkomensvoorzieningParams {
  lijfrente: LijfrenteParams
  stakingslijfrente: { hoog: number; midden: number; laag: number }
  /**
   * Ronde 2. Welk maximum van de stakingslijfrente geldt (art. 3.129 lid 2): hoog bij een leeftijd van ten hoogste
   * `hoogBinnenJarenVoorAow` jaar onder de AOW-leeftijd of arbeidsongeschiktheid van ten minste
   * `arbeidsongeschiktMinPct`, midden binnen `middenBinnenJarenVoorAow` jaar, anders laag. Premies betaald binnen
   * `betaaltermijnMaanden` na het stakingsjaar tellen op verzoek mee in dat jaar (art. 3.130 lid 2).
   */
  stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: number; middenBinnenJarenVoorAow: number; arbeidsongeschiktMinPct: number; betaaltermijnMaanden: number }
  uitkering: {
    afkoopKleineLijfrente: number
    afkoopAOMax: number
    tijdelijkeOudedagslijfrenteMax: number
    revisierentePct: number
    bedragIneens: { vanaf: string | null; pct: number }
  }
  nettolijfrente: { actief: boolean }
  baz: { actief: boolean; pct?: number; maxPremiePerMaand?: number; wachttijdWeken?: number }
}

/**
 * Eigenwoningforfait: NIET progressief. Het percentage van de band waarin de
 * WOZ-waarde valt geldt over de hele WOZ. Alleen de hoogste band heeft een vast
 * bedrag: forfait = vast + pct × (WOZ − ondergrens van die band).
 */
export interface ForfaitBand {
  tot: number | null
  pct: number
  /** Vast bedrag (alleen voor de hoogste band, = vorig pct × ondergrens). */
  vast?: number
}

export interface EigenWoningParams {
  forfait: ForfaitBand[]
  hillenPct: number
  hillenStap: number
  aflossingseisVanaf: string
  maxAftrekJaren: number
  /**
   * Begin van de termijn van maxAftrekJaren voor schulden die al vóór dit tijdstip bestonden
   * (overgangsrecht Wet IB 2001: de dertig jaar lopen vanaf 1 januari 2001).
   */
  aftrekTermijnStartUiterlijk: string
  kewVrijstelling: number
  /** WOZ-waarde met waardepeildatum 1 januari van het voorafgaande jaar. */
  wozPeildatum: 'vorigJaar'
  /** Ronde 2. De eigenwoningreserve vervalt voor het deel dat zoveel jaar geleden is toegevoegd (art. 3.119aa lid 3). */
  reserveTermijnJaren: number
}

export interface Box2Params {
  schijven: Array<{ tot: number | null; tarief: number }>
  /** Schijfgrens per persoon; fiscale partners kunnen samen tweemaal de eerste schijf benutten. */
  grensPerPersoon: boolean
  gebruikelijkLoonNorm: number
  dividendbelasting: number
  excessiefLenen: { grens: number }
  /**
   * Ronde 2. Verrekening van een verlies uit aanmerkelijk belang (art. 4.49): eerst `terug` jaar terug, dan `vooruit`
   * jaar vooruit. Verliezen tot en met `oudeVerliezen.totEnMetJaar` gaan `oudeVerliezen.vooruit` jaar vooruit.
   */
  verliesverrekening: { terug: number; vooruit: number; oudeVerliezen: { totEnMetJaar: number; vooruit: number } }
  /**
   * Ronde 2. Belastingkorting voor een onverrekend box 2-verlies als er geen aanmerkelijk belang meer is (art. 4.53):
   * het tarief van de eerste schijf box 2 maal het verlies, te verrekenen in het eerste jaar en de `jarenNaEerste`
   * jaren erna, maar uiterlijk in het `uiterlijkJarenNaVerlies`e jaar na het verliesjaar.
   */
  belastingkorting: { jarenNaEerste: number; uiterlijkJarenNaVerlies: number }
}

export interface Box3Params {
  regime: 'schijven2017' | 'forfaitair' | 'werkelijkRendement'
  tarief: number
  heffingsvrijVermogen: number
  schuldendrempel: number
  forfaitBank: number
  forfaitOverig: number
  forfaitSchulden: number
  /** Alleen regime 'schijven2017' (t/m 2022): effectief rendement per schijf van de grondslag. */
  schijven2017?: Array<{ tot: number | null; pct: number }>
  vrijstellingen: { groen: number; contant: number; uitvaart: number; nettolijfrente: boolean }
  tegenbewijs: {
    beschikbaar: boolean
    kanaal: 'owr-formulier' | 'aangifte' | 'geen'
    /** Voordeel eigen gebruik vastgoed als deel van de WOZ (2026: 5,06%). */
    eigenGebruikPct: number
  }
  arbitrageMaanden: number
  bronbelastingMaxPct: number
  dac8Rapportage: boolean
  regime2028?: {
    perCategorie: Record<'bank' | 'financieelInstrument' | 'crypto' | 'onroerend', 'werkelijkRendement' | 'vermogenswinst' | 'vermogensaanwas'>
    heffingsvrijResultaat: number
    verliesdrempel: number
  }
}

export interface ZvwParams {
  pctOndernemer: number
  pctWerkgever: number
  maxBijdrageInkomen: number
}

export interface PgaParams {
  giften: {
    drempelPct: number
    drempelMin: number
    maxPct: number
    periodiekMax: number
    cultureelMultiplier: number
    cultureelMaxExtra: number
    naturaGrens: number
  }
  zorgkosten: {
    actief: boolean
    drempelMinPP: number
    drempelMinTotInkomen: number
    pctLaag: number
    grensHoog: number
    vastHoog: number
    pctHoog: number
    verhogingPct: number
    verhogingPctAow: number
    verhogingTotInkomen: number
  }
  scholing: { actief: boolean; drempel: number; max: number }
  alimentatie: boolean
}

export interface LoonParams {
  reisaftrek: { tabel: Array<{ vanafKm: number; bedrag: number }>; kmBedrag: number; max: number }
}

export interface KotTabelRij {
  /** Toetsingsinkomen tot en met; null = laatste rij. */
  totInkomen: number | null
  pctKind1: number
  pctKind2: number
}

export interface ToeslagenParams {
  vermogensgrens: { alleen: number; metPartner: number }
  kot: {
    regime: 'toeslag' | 'directeFinanciering'
    maxUurprijs: { dagopvang: number; bso: number; gastouder: number }
    maxUrenPerMaand: number
    tabel: KotTabelRij[]
    terugwerkendeMaanden: number
    vergoedingPct?: number
    eigenBijdragePct?: number
  }
  kgb: {
    maxPerKind: { tot12: number; van12: number; van16: number }
    aloKop: number
    /** Afbouwpunten oplopend; elk punt geldt vanaf `vanaf` met `pct` tot het volgende punt. */
    afbouw: Array<{ vanafAlleen: number; vanafPaar: number; pct: number }>
  }
  /** Kinderbijslag per kwartaal, geldig vanaf `vanaf` (eerste dag van het kwartaal). */
  kinderbijslag: Array<{ vanaf: string; tot5: number; tot11: number; tot17: number }>
  /**
   * Zorgtoeslag lineair: max − afbouwPct × max(0, toetsingsinkomen − drempelinkomen),
   * nul boven de inkomensgrens (2026 getoetst: 1.550 − 13,73% × (40.857 − 29.736) ≈ 23).
   */
  zorgtoeslag: {
    standaardpremie: number
    drempelinkomen: number
    afbouwPct: number
    maxAlleen: number
    maxPaar: number
    grensAlleen: number
    grensPaar: number
  }
}

export interface ArbeidsrelatieParams {
  handhaving: { regime: 'moratorium' | 'overgang' | 'regulier'; verzuimboetes: boolean; vergrijpboetes: boolean }
  rechtsvermoedenUurtarief: { actiefVanaf: string | null; drempel: number }
  modelovereenkomstenGeldigTot: string
  zelfstandigenwet: { actief: boolean; minOpdrachtgevers?: number; toetsJaren?: number }
  concentratieWaarschuwingPct: number
}

export interface SchenkenParams {
  kindJaarlijks: number
  kindEenmalig: number
  kindStudie: number
  overig: number
}

export interface OverigParams {
  /**
   * Percentage belastingrente zoals de jaarmodule het sinds ronde 1 opneemt (meestal het percentage van 1 januari;
   * 2023: het percentage aan het einde van het jaar, zie de toelichting van dat jaar). Alleen nog voor compatibiliteit
   * (de oude belastingpot). Rente hoort bij de periode waarin ze loopt, niet bij het belastingjaar: rekenen gaat via de
   * periodetabel BELASTINGRENTE_IB in years/data/belastingrente.ts (ronde 2). Besluit na de nacontrole (F15b): 2023 houdt
   * hier 6% tot de belastingpot de periodetabel gebruikt; onderdeel A2 haalt dit veld uit de belastingpot (en uit de
   * verantwoording), daarna leest geen module het nog.
   */
  belastingrenteIB: number
  belastingrenteVpb: number
  /** Art. 9.4 lid 1 onder a: een aanslag volgt als de verschuldigde belasting het voorheffingssaldo met meer dan dit bedrag overtreft. */
  aanslaggrens: number
  /** Art. 9.4 lid 5: in de gevallen b, c en d geen teruggaaf als het voorheffingssaldo de belasting met niet meer dan dit bedrag overtreft. */
  teruggaafgrens: number
  /** Ronde 2. Art. 9.4 lid 1 onder c: een aanslag volgt als de rendementsgrondslag op 1 januari hoger is (fiscale partners samen het dubbele). */
  aanslagRendementsgrondslag: number
  /**
   * Ronde 2. Regels voor belastingrente (AWR art. 30f tot en met 30fe). Datums als 'MM-DD' in het jaar na het
   * belastingjaar; termijnen in weken na ontvangst. Dagtelling van de Belastingdienst: 30 dagen per maand, `dagenPerJaar` per jaar.
   */
  belastingrenteRegels: {
    vanafMaandDag: string
    geenRenteAangifteVoor: string
    conformAangifteMaxWeken: number
    conformVerzoekMaxWeken: number
    vergoedingNaWekenAangifte: number
    vergoedingNaWekenVerzoek: number
    dagenPerJaar: number
    /**
     * Ronde 2 (na de nacontrole). AWR art. 30fc lid 5: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt
     * de belastingrente uiterlijk zoveel weken na ontvangst van het verzoek (12).
     */
    navorderingVerzoekMaxWeken: number
  }
  /**
   * Ronde 2. Invordering (Invorderingswet 1990 art. 9): een aanslag is invorderbaar `invorderbaarWeken` na dagtekening,
   * een navorderingsaanslag na `navorderingInvorderbaarMaanden`; een voorlopige aanslag met dagtekening vóór het
   * belastingjaar in `termijnenVoorJaar` termijnen.
   */
  invordering: { invorderbaarWeken: number; navorderingInvorderbaarMaanden: number; termijnenVoorJaar: number }
  middeling: { mogelijk: boolean; laatsteTijdvak: [number, number, number]; drempel: number; termijnMaanden: number }
  vpb: { grens: number; laag: number; hoog: number }
  innovatiebox: { tarief: number; forfaitPct: number; forfaitMax: number }
  pseudoEindheffingFossieleAuto: number
  aowLeeftijd: { jaren: number; maanden: number }
}

export interface IndexatieParams {
  /** Tabelcorrectiefactor van het jaar (bijv. 1.026). */
  tcf: number
  /** Deel van de inflatiecorrectie dat in de IB is toegepast (bijv. 0.48). */
  toegepastDeel: number
  /** De grens van schijf 1 indexeert met dit deel van de (beperkte) correctie. */
  schijf1Factor: number
  /** Beleidsmatige mutatie op de toptariefgrens bovenop indexatie. */
  beleidsmatigToptariefgrens: number
}

export interface TaxYearParams {
  jaar: number
  /** Laagste status van alle blokken (zie STATUS_RANG). */
  status: Status
  bijgewerkt: string
  changelog: ChangelogRegel[]
  indexatie: IndexatieParams
  varianten: Variant[]

  box1: Blok<Box1Params>
  heffingskortingen: Blok<HeffingskortingenParams>
  ondernemer: Blok<OndernemerParams>
  inkomensvoorziening: Blok<InkomensvoorzieningParams>
  eigenWoning: Blok<EigenWoningParams>
  box2: Blok<Box2Params>
  box3: Blok<Box3Params>
  zvw: Blok<ZvwParams>
  pga: Blok<PgaParams>
  loon: Blok<LoonParams>
  toeslagen: Blok<ToeslagenParams>
  arbeidsrelatie: Blok<ArbeidsrelatieParams>
  schenken: Blok<SchenkenParams>
  overig: Blok<OverigParams>
}

/** De namen van alle blokken (handig voor diff en validatie). */
export const BLOK_NAMEN = [
  'box1',
  'heffingskortingen',
  'ondernemer',
  'inkomensvoorziening',
  'eigenWoning',
  'box2',
  'box3',
  'zvw',
  'pga',
  'loon',
  'toeslagen',
  'arbeidsrelatie',
  'schenken',
  'overig',
] as const
export type BlokNaam = (typeof BLOK_NAMEN)[number]

// ---------------------------------------------------------------------------
// 3. Invoer
// ---------------------------------------------------------------------------

export type PersoonId = 'A' | 'B'

/** Winstberekening: óf het saldo uit het fiscaal rapport, óf uitgesplitst. */
export type Winstberekening =
  | {
      soort: 'saldo'
      /** "Saldo fiscale winstberekening" (na aftrek van alle kosten incl. volledig beperkt aftrekbare kosten). */
      saldo: number
      /**
       * Afschrijving die in het saldo zit (zoals geboekt). Met een activaregister corrigeert de engine het
       * verschil tussen deze afschrijving en de fiscale afschrijving uit het register; zonder dit veld telt het
       * register bij 'saldo' niet mee (met een melding).
       */
      afschrijvingenInSaldo?: number
    }
  | {
      soort: 'uitgesplitst'
      omzet: number
      /** Aftrekbare kosten exclusief afschrijvingen, beperkt aftrekbare kosten, autokosten en kilometeraftrek. */
      kosten: number
      wijzigingOnderhandenWerk?: number
      financieleBatenLasten?: number
      /** Handmatige afschrijvingen; wordt genegeerd als `activa` zijn ingevuld. */
      afschrijvingen?: number
    }

export interface ActiefInvoer {
  omschrijving: string
  aanschafdatum: string
  aanschafwaarde: number
  restwaarde: number
  levensduurJaren: number
  methode: 'lineair' | 'willekeurig-starter' | 'vamil' | 'direct'
  soort?: 'bedrijfsmiddel' | 'goodwill' | 'gebouw'
  /** Bij gebouwen: WOZ-waarde voor de bodemwaardetoets. */
  woz?: number
  boekwaardeBegin?: number
  verkocht?: { datum: string; verkoopprijs: number }
  /** Bij methode 'willekeurig-starter': het gekozen bedrag dit jaar (binnen de ruimte); ontbreekt = alles. */
  willekeurigBedrag?: number
  /**
   * Over dit bedrijfsmiddel genoten investeringsaftrek, vastgelegd in het investeringsjaar. Bij verkoop binnen
   * vijf jaar na het begin van het investeringsjaar volgt daaruit de desinvesteringsbijtelling.
   */
  investeringsaftrek?: { regeling: 'kia' | 'eia' | 'mia-1' | 'mia-2' | 'mia-3'; jaar: number; genotenPct: number }
  /**
   * Herkomst: uit een investering van een eerder jaar, uit Moneybird of met de hand. De engine rekent er niet mee. Het
   * dossier gebruikt 'investering' als vlag 'levensduur en restwaarde nog te bevestigen' (de doorrol neemt de snelste
   * fiscale levensduur aan); bevestigen of aanpassen zet 'handmatig'.
   */
  bron?: 'investering' | 'moneybird' | 'handmatig'
  /** Vaste herkomst-id voor doorrollen ('inv:2025:2' of 'act:2025:4'); koppelt een middel over de jaren, ook als de gebruiker datum of bedrag aanpast. */
  herkomst?: string
  /**
   * Ronde 2. Op dit middel afgeboekte herinvesteringsreserve (art. 3.54 lid 1): de afschrijving gaat over
   * aanschafwaarde − afboeking − restwaarde. Komt bij een nieuw jaar uit `InvesteringInvoer.herinvesteringsreserve`.
   */
  herinvesteringsreserveAfboeking?: number
}

export interface InvesteringInvoer {
  /**
   * Ronde 2. Vaste id binnen het jaar (lib/dossier/ids.ts): sleutel voor veld-id's, invulhulp en controles. Wordt bij
   * het laden of aanmaken gezet; ontbreekt alleen in oude invoer (dan geldt de index).
   */
  id?: string
  omschrijving: string
  datum: string
  bedrag: number
  /** Betaald in dit jaar (voor bedrijfsmiddelen die nog niet in gebruik zijn). */
  betaald?: number
  inGebruik?: boolean
  regeling?: 'kia' | 'eia' | 'mia-1' | 'mia-2' | 'mia-3' | 'geen'
  /** Uitgesloten bedrijfsmiddel (personenauto, woning, grond, goodwill). */
  uitgesloten?: boolean
  gekochtVanPartner?: boolean
  /** RVO-melding gedaan (EIA/MIA). */
  gemeld?: boolean
  /**
   * Ronde 2. Afboeking van een herinvesteringsreserve op deze investering (`reserveId` = `HerinvesteringsreserveInvoer.id`).
   * Investeringsaftrek (KIA, EIA en MIA) gaat over het bedrag na afboeking (hoofdregel), tenzij `kiaOverVolBedrag`
   * (goedkeuring; vraag in de aangifte, 2.11). De desinvesteringsbijtelling volgt het bedrag waarover aftrek is genoten.
   * `nieuwLanglopend`: op dit middel wordt niet of in meer dan `hir.langlopendVanafJaren` jaar afgeschreven (grond,
   * gebouw); ontbreekt = afgeleid uit het register (soort 'gebouw' of levensduur), anders nee. Afboeken op een
   * langlopend middel mag alleen met een reserve uit een middel met dezelfde economische functie (art. 3.54 lid 4):
   * `zelfdeFunctie` bevestigt dat (controle hir-functie).
   */
  herinvesteringsreserve?: { reserveId: string; afboeking: number; kiaOverVolBedrag?: boolean; nieuwLanglopend?: boolean; zelfdeFunctie?: boolean }
}

export interface DesinvesteringInvoer {
  omschrijving: string
  verkoopprijs: number
  investeringsjaar: number
  /** Over dit bedrijfsmiddel genoten investeringsaftrek-percentage (voor de bijtelling). */
  genotenPct: number
  /** Destijds genoten investeringsaftrek in euro's: de bijtelling is nooit hoger. Ontbreekt = alleen een melding. */
  genotenAftrek?: number
}

export interface AutoInvoer {
  cataloguswaarde: number
  datumEersteToelating: string
  nulEmissie: boolean
  /** Waarde in het economisch verkeer (voor youngtimers). */
  dagwaarde?: number
  /** Werkelijke autokosten die in de winstberekening zitten (maximum van de bijtelling). */
  autokosten: number
  priveKm?: number
  rittenregistratie?: boolean
  /**
   * Ronde 2. Sinds wanneer de auto ter beschikking staat. Overgangsrecht youngtimer: ontbreekt telt als "vóór dit
   * jaar" alleen in het eerste jaar na `youngtimerOvergang.terBeschikkingUiterlijk`; in latere jaren is het dan
   * onbekend (geen overgangsrecht, met een melding). Btw-correctie: tijdsevenredig vanaf deze datum.
   */
  terBeschikkingSinds?: string
  /** Ronde 2. Laatste dag ter beschikking in dit jaar (verkocht, naar privé, staking); btw-correctie tijdsevenredig. */
  terBeschikkingTot?: string
  /** Ronde 2. Privé betaalde autokosten (eigen bijdrage): verlagen de bijtelling (art. 3.20 lid 4). */
  eigenBijdrage?: number
  /**
   * Ronde 2. Btw-correctie privégebruik (Belastingdienst, goedkeuring). Zonder `btw` rekent de engine géén correctie
   * (bestaande dossiers veranderen niet); de controle auto-btw geeft dan een let op.
   *
   * - `aftrekOpKosten` false: de ondernemer trekt geen btw af op deze auto (KOR, vrijgestelde prestaties): geen correctie.
   * - `aftrekBijAanschaf` false (marge-auto, van een particulier): het verlaagde forfait.
   * - `jaarIngebruikname`: het jaar waarin de ondernemer de auto is gaan gebruiken (niet de eerste toelating). Ontbreekt
   *   = het jaar van `terBeschikkingSinds`, anders het aanschafjaar uit het register; ontbreekt dat ook, dan vraagt de UI.
   *   Verlaagd forfait vanaf `jaarIngebruikname + verlaagdNaJaren + 1`.
   * - Forfait × maanden ter beschikking in dit jaar / 12 (vanaf `terBeschikkingSinds`, tot `terBeschikkingTot`).
   * - Maximum: `btwOpKosten` (btw op gebruik en onderhoud die dit jaar is afgetrokken) plus, in de eerste vier jaar na
   *   ingebruikname, 1/5 van `btwBijAanschaf`. Ontbreekt `btwOpKosten`, dan geen maximum (met een melding).
   * - Methode 'kilometers': btwOpKosten × privé-kilometers (inclusief woon-werk) / totaal.
   * - De correctie is een autokost. `inAutokosten` false: ze zit niet in `autokosten` en gaat van de winst af en telt mee
   *   in het plafond van de bijtelling. Ontbreekt = de standaard van de onderneming (`OndernemingInvoer.winstBron`, zie
   *   lib/tax/modules/onderneming/in-saldo.ts): uit de boekhouding ja.
   */
  btw?: {
    aftrekOpKosten?: boolean
    aftrekBijAanschaf: boolean
    jaarIngebruikname?: number
    methode: 'forfait' | 'kilometers'
    priveKmInclWoonWerk?: number
    totaalKm?: number
    btwOpKosten?: number
    btwBijAanschaf?: number
    inAutokosten?: boolean
  }
}

export interface UrenInvoer {
  /** Directe en indirecte uren aan de onderneming in het kalenderjaar. */
  onderneming: number
  /** Uren in loondienst (voor het grotendeelscriterium). */
  loondienst?: number
  /** Zwangerschaps- en bevallingsverlof in weken (telt als gewerkt, max params.zwangerschapWeken). */
  zwangerschapWeken?: number
  gemiddeldeUrenPerWeekVoorVerlof?: number
  /** Override: vul in als de uren niet worden bijgehouden maar het criterium zeker is gehaald (of niet). */
  urencriteriumGehaald?: boolean
  /**
   * Urencriterium in het vorige kalenderjaar (uit de uitkomst van vorig jaar: `urencriteriumGehaald`). Alleen
   * `false` telt: dit jaar en vorig jaar geen urencriterium is een grond voor de verplichte FOR-afname.
   */
  urencriteriumVorigJaar?: boolean
}

export interface OpdrachtgeverInvoer {
  naam: string
  omzet: number
  uurtarief?: number
  duurMaanden?: number
  viaPlatform?: boolean
}

export interface OndernemingInvoer {
  /**
   * Ronde 2. Vaste id (lib/dossier/ids.ts), ook over de jaren (nieuw jaar en doorrol nemen hem mee). Sleutel voor
   * veld-id's, invulhulp, controles en `TerbeschikkingstellingInvoer.aan.ondernemingId`. Ontbreekt alleen in oude invoer.
   */
  id?: string
  naam: string
  winstberekening: Winstberekening
  /**
   * Ronde 2. Waar het saldo of de rubrieken vandaan komen. Bepaalt de standaard van alle vragen "zit dit al in het
   * saldo?" (herinvesteringsreserve, egalisatiereserve, btw-correctie auto, vergoeding partner, terbeschikkingstelling,
   * stakingsposten); een expliciet antwoord per regeling gaat voor. Ontbreekt = 'boekhouding'. De tabel staat in
   * lib/tax/modules/onderneming/in-saldo.ts.
   */
  winstBron?: 'boekhouding' | 'fiscaal-rapport'
  /** Gewerkte maanden tot nu (prognose); ontbreekt = heel jaar. */
  maandenGewerkt?: number
  /** Voedsel, drank, representatie, congressen (volledig, vóór correctie). */
  beperktAftrekbaar?: number
  activa?: ActiefInvoer[]
  investeringen?: InvesteringInvoer[]
  desinvesteringen?: DesinvesteringInvoer[]
  zakelijkeKmPrive?: number
  /** true als de kilometeraftrek al in het saldo/de kosten zit. */
  kmAftrekAlInSaldo?: boolean
  auto?: AutoInvoer
  for?: { stand: number; ondernemingsvermogenEinde?: number; vrijwilligeAfname?: number }
  uren: UrenInvoer
  /** Jaar waarin de onderneming is gestart (voor starters- en grotendeelsregels). */
  startjaar: number
  /** Aantal keer dat de startersaftrek eerder is toegepast. */
  startersaftrekEerderGebruikt?: number
  arbeidsongeschiktStarter?: { jaarNummer: 1 | 2 | 3 }
  soUren?: number
  /**
   * `vergoeding` aan de meewerkende partner. Ronde 2: `vergoedingInKosten` zegt of de vergoeding al in het saldo of de
   * kosten zit (ontbreekt = standaard van `winstBron`: ja). Onder `meewerkaftrek.maxVergoeding` telt de engine een
   * vergoeding in de kosten terug (niet aftrekbaar); vanaf die grens trekt hij een vergoeding die er nog niet in zit
   * af, en is die bij de partner resultaat uit overige werkzaamheden (art. 3.16 lid 4). De keuze "Hoe werkt de partner
   * mee?" staat in `samenwerkingMetPartner`; dit veld volgt daaruit ('meewerkaftrek' of 'arbeidsbeloning').
   */
  meewerkendePartner?: { uren: number; vergoeding: number; vergoedingInKosten?: boolean }
  /**
   * Staking in dit jaar. `gedeeltelijk`: alleen een deel van de onderneming is gestaakt; dan valt van de FOR
   * alleen het deel boven het ondernemingsvermogen aan het einde vrij. Ontbreekt = de hele onderneming.
   * Ronde 2: uitgebreid tot `StakingInvoer` (bestaande velden ongewijzigd).
   */
  staking?: StakingInvoer
  opdrachtgevers?: OpdrachtgeverInvoer[]
  samenwerkingMetPartner?: 'geen' | 'vof' | 'loondienst' | 'meewerkaftrek' | 'arbeidsbeloning'
  werkruimte?: { zelfstandig: boolean; deelInkomenInOfVanuit: number; deelInkomenIn: number; werkplekElders: boolean; kosten: number }
  /** Herkomst van de cijfers (bijv. een import uit Moneybird); alleen informatief, de engine gebruikt het niet. */
  bron?: { soort: 'moneybird'; koppelingId: string; administratieId: string; administratieNaam?: string; jaar: number; geimporteerdOp: string }
  /**
   * Jaarrekeninggegevens voor het fiscaal rapport (hoofdstuk 5). De engine rekent er alleen mee voor de FOR: is
   * er een grond voor de verplichte afname en ontbreekt `for.ondernemingsvermogenEinde`, dan geldt het
   * ondernemingsvermogen van de eindbalans (activa min voorzieningen en schulden).
   */
  jaarrekening?: JaarrekeningInvoer
  /**
   * Staan alle bedrijfsmiddelen van de onderneming in het activaregister (`activa`)? Alleen dan vervangt de fiscale
   * afschrijving uit het register de geboekte afschrijving ('uitgesplitst') of corrigeert ze het saldo ('saldo' met
   * afschrijvingenInSaldo). Anders is het register een fiscale controle zonder effect op de winst. Ontbreekt = nee.
   */
  activaVolledig?: boolean
  /** Opbrengst van in dit jaar verkochte bedrijfsmiddelen die niet in het register of de desinvesteringslijst staan (drempel art. 3.47 lid 1). */
  overigeVerkopen?: number
  /** Herkomst-id's van doorgerolde bedrijfsmiddelen die de gebruiker in dit jaar heeft verwijderd; opnieuw overnemen zet ze niet terug. */
  doorrolUitgesloten?: string[]
  /** Ronde 2. Herinvesteringsreserves (art. 3.54), elk met herkomst en stand; doorgerold naar volgend jaar. */
  herinvesteringsreserves?: HerinvesteringsreserveInvoer[]
  /** Ronde 2. Kostenegalisatiereserves (art. 3.53 lid 1 onder a); doorgerold naar volgend jaar. */
  egalisatiereserves?: EgalisatiereserveInvoer[]
}

/**
 * Ronde 2. Staking van (een deel van) de onderneming.
 *
 * De stakingswinst zit, net als vóór ronde 2, in het saldo of de rubrieken van de winstberekening zoals geboekt
 * (verkoop van activa en goodwill als boekwinst). De posten zijn een specificatie, zoals het scherm Stakingswinst in de
 * aangifte. Een post met `inSaldo: false` (bijvoorbeeld de stille reserve bij een auto die naar privé gaat, of goodwill
 * die niet is geboekt) telt de engine wél bij de winst op. Vrijval van de FOR, herinvesteringsreserve en
 * kostenegalisatiereserve en de desinvesteringsbijtelling rekent de engine zelf; die horen niet in de posten.
 *
 * Soort: bij 'geheel' en 'gedeeltelijk' vallen FOR (geheel; gedeeltelijk alleen boven het ondernemingsvermogen),
 * herinvesteringsreserve en egalisatiereserve vrij en volgt de desinvesteringsbijtelling. Bij 'geruisloosBV' (art. 3.65)
 * en 'doorschuiving' (art. 3.63) geldt de onderneming niet als gestaakt: reserves en de verplichting tot
 * desinvesteringsbijtelling gaan mee naar de overnemer; alleen de FOR valt vrij (art. 3.65 lid 2, 10a.29 lid 6), bij
 * 'geruisloosBV' met stakingsaftrek over die vrijval (10a.29 lid 7). Standaard in de UI: één bedrag
 * (`stakingswinst`), posten onder "Specificeren per onderdeel".
 */
export interface StakingInvoer {
  /**
   * Stakingswinst zonder vrijval van reserves en zonder desinvesteringsbijtelling. Met `posten` houdt de invoer dit
   * gelijk aan de som van de posten plus `goodwill` min `stakingskosten` (oudere invoer: één bedrag).
   */
  stakingswinst: number
  /** Ouder veld: ja = de hele stakingsaftrek is al gebruikt. `eerderGenotenStakingsaftrek` gaat voor. */
  stakingsaftrekEerderGebruikt?: boolean
  /** Ouder veld, gelijk aan `soort: 'gedeeltelijk'`; `soort` gaat voor. */
  gedeeltelijk?: boolean
  /** Ronde 2. Ontbreekt = 'geheel' (of 'gedeeltelijk' als `gedeeltelijk`). */
  soort?: 'geheel' | 'gedeeltelijk' | 'geruisloosBV' | 'doorschuiving'
  datum?: string
  posten?: StakingPost[]
  /** Zelf opgebouwde goodwill (boekwaarde 0) als die niet als post is opgenomen. */
  goodwill?: number
  stakingskosten?: number
  /**
   * Bedrag aan stakingsaftrek dat in eerdere jaren is genoten (art. 3.79 lid 4); wint van
   * `PersoonInvoer.genotenStakingsaftrek` (de doorrol) en van `stakingsaftrekEerderGebruikt`.
   */
  eerderGenotenStakingsaftrek?: number
}

/** Een bestanddeel van de stakingswinst (scherm Stakingswinst in de aangifte, 2.13). */
export interface StakingPost {
  soort: 'onroerend' | 'immaterieel' | 'overigeActiva' | 'overig'
  omschrijving: string
  /** Herkomst-id van het middel in het activaregister, als het daaruit komt. */
  actiefHerkomst?: string
  /** Opbrengst bij verkoop, of waarde in het economisch verkeer bij overgang naar privé. */
  waardeOfOpbrengst: number
  fiscaleBoekwaarde: number
  naarPrive?: boolean
  /**
   * Zit het resultaat op deze post al in het saldo of de rubrieken? Ontbreekt = standaard van `winstBron`: uit de
   * boekhouding ja, behalve bij `naarPrive` (een overgang naar privé tegen de waarde in het economisch verkeer staat
   * meestal niet in de boekhouding); uit een fiscaal rapport ja.
   */
  inSaldo?: boolean
}

/** Ronde 2. Herinvesteringsreserve (art. 3.54). */
export interface HerinvesteringsreserveInvoer {
  /** Vaste id ('hir-<jaar>-<n>'), ook over de jaren; investeringen verwijzen ernaar. */
  id: string
  /** Jaar waarin de reserve is gevormd (jaar van de vervreemding of schade). */
  ontstaanJaar: number
  /**
   * Gevormd bedrag: ten hoogste de boekwinst (opbrengst min boekwaarde zonder willekeurige afschrijving, lid 1 en 8).
   * Met een bekende `herkomst.opbrengst` begrenst de engine de dotatie op die boekwinst (controle hir-boekwinst).
   * Niet voor beleggingen en niet voor middelen tot `afschrijving.directAftrekbaarTot` (lid 7): de UI biedt het dan niet aan.
   */
  bedragOntstaan: number
  /** Stand op 1 januari van dit jaar; 0 in het ontstaansjaar (de doorrol vult hem daarna). */
  standBegin: number
  herkomst: {
    omschrijving: string
    /** Herkomst-id van het verkochte middel in het activaregister. */
    actiefHerkomst?: string
    opbrengst?: number
    /** Boekwaarde van het oude middel vlak vóór de vervreemding, zonder willekeurige afschrijving (lid 2 en 8). */
    boekwaardeOud: number
    /**
     * Het oude middel werd niet of in meer dan `hir.langlopendVanafJaren` jaar afgeschreven (lid 3): de reserve hoeft
     * dan alleen op een middel met dezelfde functie te worden afgeboekt (informatie; afboeken op een kortlopend middel mag).
     */
    langlopend: boolean
    /** Vergoeding voor verlies of beschadiging (lid 6). */
    schadeloosstelling?: boolean
  }
  /** Er is (nog) een herinvesteringsvoornemen. false = de stand valt dit jaar vrij. */
  voornemen: boolean
  /**
   * Langere termijn (aard van het middel of vertraging met begin van uitvoering): laatste jaar. Vrijval in het jaar
   * `termijnVerlengdTot ?? ontstaanJaar + hir.termijnJaren`, na afboeking op investeringen van dat jaar; daarna rolt de
   * reserve niet meer door.
   */
  termijnVerlengdTot?: number
  /**
   * Zitten dotatie en vrijval al in het saldo (bijvoorbeeld een saldo uit een fiscaal rapport waarin de reserve al is
   * gevormd)? Dan houdt de engine alleen de stand bij. Ontbreekt = standaard van `OndernemingInvoer.winstBron`
   * (boekhouding: nee, het saldo bevat de boekwinst zoals geboekt en de engine trekt de dotatie af en telt de vrijval
   * op; fiscaal rapport: ja).
   */
  mutatiesInSaldo?: boolean
  /**
   * Ronde 2 (review). Boekwaarde-eis over alle vervangende middelen samen (art. 3.54 lid 2): het deel van
   * `herkomst.boekwaardeOud` dat al gedekt is door middelen uit eerdere jaren waarop deze reserve is afgeboekt,
   * Σ (aanschafprijs − afboeking), ten hoogste `boekwaardeOud`. De doorrol zet hier
   * `HerinvesteringsreserveUitkomst.boekwaardeEis.gedektEind` van vorig jaar. Is er al eerder afgeboekt (stand begin
   * lager dan de gevormde reserve), dan rekent de engine de eis hoe dan ook als helemaal gedekt (de engine toetst hem bij
   * elke afboeking); ontbreekt het veld en is er nog niet afgeboekt, dan 0. Een middel waarop geen deel van de reserve
   * is afgeboekt, telt alleen mee via dit veld.
   */
  boekwaardeEisGedekt?: number
}

/** Ronde 2. Kostenegalisatiereserve (art. 3.53 lid 1 onder a). */
export interface EgalisatiereserveInvoer {
  id: string
  omschrijving: string
  standBegin: number
  dotatie?: number
  /** Werkelijke kosten die dit jaar ten laste van de reserve komen. */
  onttrekking?: number
  /** Het doel vervalt (pand verkocht, onderhoud gaat niet door): de rest valt vrij. */
  vervallen?: boolean
  /** Zitten dotatie en onttrekking al in het saldo? Ontbreekt = standaard van `OndernemingInvoer.winstBron` (boekhouding: nee; fiscaal rapport: ja). */
  inSaldo?: boolean
}

/** Posten van de fiscale balans op één peildatum, in hele euro's. Ontbrekend = niet ingevuld (niet 0). */
export interface BalansStand {
  materieleVasteActiva?: number
  /** Voorraden en onderhanden werk. */
  voorraden?: number
  handelsdebiteuren?: number
  overigeVorderingen?: number
  liquideMiddelen?: number
  /** Fiscale oudedagsreserve, onderdeel van het ondernemingsvermogen. */
  oudedagsreserve?: number
  voorzieningen?: number
  langlopendeSchulden?: number
  /** Schulden aan leveranciers en handelskredieten. */
  crediteuren?: number
  omzetbelasting?: number
  overigeKortlopendeSchulden?: number
}

export type BalansPost = keyof BalansStand

/** Rubrieken van de fiscale winstberekening (5.3). Kosten positief, opbrengsten positief, lasten van financiering positief. */
export type WvRubriek =
  | 'omzet'
  | 'onderhandenWerk'
  | 'inkoop'
  | 'afschrijvingen'
  | 'personeel'
  | 'auto'
  | 'huisvesting'
  | 'verkoop'
  | 'kantoor'
  | 'beperktAftrekbaar'
  | 'overig'
  | 'financieleBaten'
  | 'financieleLasten'

/** Jaarrekening van een onderneming zoals het fiscaal rapport die toont (kapitaalsvergelijking, balans, specificaties). */
export interface JaarrekeningInvoer {
  begin?: BalansStand
  eind?: BalansStand
  /** Specificatie van een balanspost (5.4.2, 5.5.1), bijvoorbeeld overige vorderingen: borg, vooruitbetaald. */
  specificaties?: Array<{ post: BalansPost; omschrijving: string; begin: number; eind: number }>
  /** Aanschafwaarde en restwaarde van de materiële vaste activa (5.4.1), als bekend. */
  mva?: { aanschafwaarde: number; restwaarde: number }
  /** Privé-onttrekkingen per soort, zoals in de administratie (privé-opnamen, inleg pensioen, inkomstenbelasting). */
  onttrekkingen?: Array<{ omschrijving: string; bedrag: number }>
  stortingen?: Array<{ omschrijving: string; bedrag: number }>
  /** Uitsplitsing van het saldo in rubrieken; de som (opbrengsten min kosten) hoort aan te sluiten op het saldo. */
  winstEnVerlies?: Array<{ rubriek: WvRubriek; bedrag: number }>
  omschrijvingActiviteiten?: string
  /** Herkomst van deze gegevens. */
  bron?: 'moneybird' | 'handmatig'
}

export interface LoonInvoer {
  /** Ronde 2. Vaste id (lib/dossier/ids.ts), ook over de jaren; sleutel voor veld-id's, invulhulp (per werkgever en uitkering) en controles. */
  id?: string
  omschrijving: string
  soort: 'loon' | 'uwv-zez' | 'uwv-overig' | 'pensioen'
  bruto: number
  ingehoudenLoonheffing: number
  /** Ingehouden Zvw-bijdrage (telt mee voor het maximum bijdrage-inkomen). */
  zvwBijdrageloon?: number
}

export interface LijfrenteHistorieJaar {
  jaar: number
  /** Winst vóór ondernemersaftrek en vóór FOR-mutaties + loon + ROW + periodieke uitkeringen van het voorgaande jaar. */
  premiegrondslagInkomen: number
  /** Toename FOR in het voorgaande jaar (pre-2023). */
  forToenameVorigJaar?: number
  /** Pensioenaangroei voorgaand jaar: factor A of Wtp-premie. */
  pensioencorrectie?: { type: 'factorA' | 'wtpPremie'; bedrag: number }
  /** Al in eerdere aangiftes benut als jaar- of reserveringsruimte. */
  alGebruikt: number
  /** Override: officieel berekende jaarruimte (bijv. uit het rapport van de accountant). */
  jaarruimteOverride?: number
}

export interface InkomensvoorzieningInvoer {
  lijfrentePremies: number
  aovPremies: number
  /** Premie voor de omzetting van de FOR in een lijfrente (aftrek buiten de ruimte). */
  forOmzetting?: number
  nettolijfrenteInleg?: number
  pensioencorrectieVorigJaar?: { type: 'factorA' | 'wtpPremie'; bedrag: number }
  /** Premiegrondslag-inkomen van het voorgaande jaar; ontbreekt = afleiden uit het dossier. */
  premiegrondslagInkomenVorigJaar?: number
  forToenameVorigJaar?: number
  historie?: LijfrenteHistorieJaar[]
  /** Ronde 2. Premie voor een stakingslijfrente (art. 3.129), naast de jaarruimte. */
  stakingslijfrente?: StakingslijfrenteInvoer
}

/**
 * Ronde 2. Stakingslijfrente: premie en de gegevens om het maximum te verlagen (art. 3.129 lid 3, art. 10a.29 lid 13).
 * De grondslag "winst behaald met of bij die staking" is `StakingUitkomst.totaal`: vóór stakingsaftrek en
 * MKB-winstvrijstelling (art. 3.8 definieert winst; pas art. 3.2 maakt er belastbare winst van).
 * Zvw: in het stakingsjaar gaat het bijdrage-inkomen omlaag met min(stakingslijfrenteaftrek + aftrek FOR-omzetting,
 * FOR-vrijval) (HR 23-11-2018, ECLI:NL:HR:2018:2175; HR 4-2-2022, 21/01274: niet voor de overige stakingswinst);
 * zie `PersoonResultaat.zvwCorrectieFor`.
 */
export interface StakingslijfrenteInvoer {
  premie: number
  /** Betaald binnen de termijn na het stakingsjaar, op verzoek meegeteld in het stakingsjaar (art. 3.130 lid 2). */
  betaaldOp?: string
  /** Ontbreekt = uit geboortedatum en AOW-leeftijd. 'hoog' ook bij arbeidsongeschiktheid of overlijden. */
  categorie?: 'hoog' | 'midden' | 'laag'
  /** Waarde van pensioenaanspraken (art. 3.129 lid 3). */
  waardePensioenaanspraken?: number
  /** Alle eerder afgetrokken lijfrentepremies (jaar- en reserveringsruimte); ontbreekt = uit de lijfrentehistorie. */
  eerderAfgetrokkenLijfrentepremies?: number
  eerdereStakingslijfrenten?: number
  /** Eerder in een lijfrente omgezette FOR (art. 10a.29 lid 13). */
  eerdereForOmzettingen?: number
}

export interface PersoonInvoer {
  id: PersoonId
  naam?: string
  geboortedatum: string
  ondernemingen: OndernemingInvoer[]
  loon: LoonInvoer[]
  resultaatOverigWerk?: number
  periodiekeUitkeringen?: number
  inkomensvoorziening: InkomensvoorzieningInvoer
  reisaftrekOV?: { enkeleReisKm: number; dagenPerWeek: number; maanden: number; vergoedingWerkgever: number }
  /** Openstaande verliezen box 1 uit eerdere jaren. */
  verliezen?: Array<{ jaar: number; bedrag: number }>
  nietBenutteZelfstandigenaftrek?: Array<{ jaar: number; bedrag: number }>
  restantPgaVorigJaar?: number
  /** Opgelegde voorlopige aanslag IB/PVV; negatief = voorlopige teruggaaf (verlaagt het voorheffingssaldo, art. 9.4 lid 7). */
  voorlopigeAanslagIB?: number
  voorlopigeAanslagZvw?: number
  /** Ingehouden dividendbelasting die aan deze persoon is toegerekend (anders via verdeling). */
  partneralimentatie?: number
  /** Ronde 2. Dagtekening en betaalde termijnen van de opgelegde voorlopige aanslagen (planning en belastingrente). */
  voorlopigeAanslagDetails?: { ib?: VoorlopigeAanslagDetail; zvw?: VoorlopigeAanslagDetail }
  /**
   * Ronde 2. Buitenlandse bronbelasting uit eerdere jaren die nog niet is verrekend (voortwenteling, art. 25a Bvdb),
   * zoals de beschikking bij de laatste aanslag vermeldt. Wordt dit jaar als buitenlandse belasting meegeteld.
   */
  voortgewenteldeBronbelasting?: number
  /** Ronde 2. Bezittingen die deze persoon ter beschikking stelt aan de onderneming van de partner (art. 3.91). */
  terbeschikkingstellingen?: TerbeschikkingstellingInvoer[]
  /** Ronde 2. Nog te verrekenen verliezen uit aanmerkelijk belang per verliesjaar (doorrol; art. 4.49). */
  box2Verliezen?: Array<{ jaar: number; bedrag: number }>
  /** Ronde 2. Box 2-inkomen van vorig jaar, voor de terugwenteling van een verlies van dit jaar (informatie). */
  box2InkomenVorigJaar?: number
  /**
   * Ronde 2. Belastingkorting voor een box 2-verlies (art. 4.53). `verzoek`: dit jaar omzetten (geen aanmerkelijk
   * belang in dit en vorig jaar, ook de partner niet). `lopend`: eerder omgezette kortingen; `restant` is het bedrag
   * aan korting in euro's, al omgerekend met het tarief van de eerste schijf box 2 van `eersteJaar`, zodat een latere
   * tariefwijziging het niet verandert.
   */
  box2Belastingkorting?: { verzoek?: boolean; lopend?: Array<{ verliesjaar: number; eersteJaar: number; restant: number }> }
  /**
   * Ronde 2. Stakingsaftrek die deze persoon in eerdere jaren heeft genoten, over alle ondernemingen en jaren samen
   * (art. 3.79 lid 4). De doorrol telt de stakingsaftrek van vorig jaar erbij. `StakingInvoer.eerderGenotenStakingsaftrek` gaat voor.
   */
  genotenStakingsaftrek?: number
}

/** Ronde 2. Gegevens van een opgelegde voorlopige aanslag (Invorderingswet art. 9). */
export interface VoorlopigeAanslagDetail {
  dagtekening?: string
  /** Al betaald (som van de betaalde termijnen). */
  betaald?: number
}

/**
 * Ronde 2. Terbeschikkingstelling aan de onderneming van de partner (art. 3.91 lid 1 onder a, lid 2 onder b): bij deze
 * persoon resultaat uit overige werkzaamheden, niet in box 3; bij de onderneming een kost. Ook zonder vergoeding is
 * het een terbeschikkingstelling ("al dan niet tegen vergoeding"; dan een negatief resultaat). Het resultaat wordt
 * bepaald zoals winst (art. 3.95): afschrijving over de waarde in het economisch verkeer bij aanvang, boekwinst bij
 * verkoop of einde. De vrijstelling (art. 3.99b) gaat over het saldo van alle regels van deze persoon, ook als dat
 * negatief is. Werkruimte: geen terbeschikkingstelling als de ondernemer er geen vergoeding ten laste van de winst
 * kan brengen (art. 3.93 lid 1 onder b), dus als de werkruimte niet aan de werkruimtetoets van art. 3.16 lid 1 voldoet
 * (`OndernemingInvoer.werkruimte`), ongeacht of er echt een vergoeding is betaald.
 */
export interface TerbeschikkingstellingInvoer {
  id: string
  omschrijving: string
  /**
   * De onderneming die het gebruikt: `ondernemingId` = `OndernemingInvoer.id`. `ondernemingIndex` alleen voor oude
   * invoer (vóór de id's); de engine zoekt eerst op id.
   */
  aan: { persoon: PersoonId; ondernemingId?: string; ondernemingIndex?: number }
  soort: 'zaak' | 'lening' | 'werkruimte' | 'overig'
  /** Zakelijke vergoeding (huur, rente) in het jaar; 0 = zonder vergoeding. */
  vergoeding: number
  kosten?: number
  afschrijving?: number
  /** Waarde in het economisch verkeer bij aanvang van de terbeschikkingstelling (grondslag voor de afschrijving). */
  waardeBijAanvang?: number
  /** Fiscale boekwaarde op 1 januari (doorrol: boekwaarde eind vorig jaar). */
  boekwaardeBegin?: number
  /** Einde of verkoop in dit jaar: opbrengst of waarde; het verschil met de boekwaarde is resultaat. */
  einde?: { datum: string; opbrengst: number }
  /** Box 3-positie die het bestanddeel was; de engine laat die uit box 3 (de positie blijft voor de doorrol staan). */
  box3PositieId?: string
  /** Zit de vergoeding al in het saldo of de kosten van de onderneming? Ontbreekt = standaard van `winstBron` (ja). */
  vergoedingInKosten?: boolean
}

export interface KindInvoer {
  id: string
  naam?: string
  geboortedatum: string
  /** Datum vanaf wanneer het kind tot het huishouden hoort (standaard de geboortedatum). */
  inHuishoudenVanaf?: string
  coOuderschap?: { dagenInHuishouden: number }
  opvang?: Array<{
    soort: 'dagopvang' | 'bso' | 'gastouder'
    urenPerMaand: number
    uurtarief: number
    maanden: number
    startdatum?: string
  }>
}

export interface LeningdeelInvoer {
  /** Ronde 2. Vaste id (lib/dossier/ids.ts), ook over de jaren; sleutel voor veld-id's, invulhulp, controles en de box 3-schuld uit de doorrol. */
  id?: string
  omschrijving: string
  hoofdsom: number
  startdatum: string
  aflossingsvorm: 'annuitair' | 'lineair' | 'aflossingsvrij' | 'overig'
  /** Overgangsrecht (schuld van vóór 2013). */
  overgangsrecht?: boolean
  rente: number
  /** Ronde 2. Schuld op 1 januari en op 31 december (aangifte 2.22, VIA). Ontbreekt = hoofdsom. */
  standBegin?: number
  standEind?: number
  /**
   * Ronde 2. Deel van dit leningdeel dat eigenwoningschuld is, als dat niet het hele leningdeel is. De doorrol zet het
   * in het jaar na een aankoop met bijleenregeling of een aflossingsvrij deel (uit `leningsplitsing` van vorig jaar:
   * `eigenwoningEind`), zodat de splitsing niet verloren gaat als `aankoop` weg is. De engine rekent de rente en de
   * standen naar rato (`begin` / `standBegin`); het andere deel staat als box 3-schuld met herkomst
   * 'eigenwoningschuld' en wordt niet nog eens geteld. Ontbreekt = de engine bepaalt het zelf (aflossingseis,
   * overgangsrecht, aankoop van dit jaar).
   */
  eigenwoningschuld?: { begin: number; reden: 'bijleenregeling' | 'aflossingseis' }
}

/**
 * Eigen woning. Ronde 2, eigenwoningreserve en bijleenregeling (art. 3.119a en 3.119aa):
 * - De reserve wordt op datum bepaald: bij een aankoop telt alleen de reserve uit toevoegingen met een datum vóór
 *   `aankoop.leverdatum` (direct voorafgaand aan het moment waarop de nieuwe woning eigen woning wordt, lid 3 onder a).
 *   Eerst kopen en later verkopen (overbruggingskrediet) raakt de schuld voor de al gekochte woning dus niet; de reserve
 *   blijft staan voor een latere verbouwing of aankoop.
 * - Maximale eigenwoningschuld = verwervingskosten (koopsom + kosten koper) − reserve vóór aankoop + `financieringskosten`
 *   (het bestaande veld; financieringskosten worden niet verminderd met de reserve, lid 2 onder c).
 * - Fiscale partners met gezamenlijke leningdelen: de toets geldt samen (lid 10): max samen = verwervingskosten −
 *   (reserve A + reserve B) + financieringskosten, zodat een reserve van één partner niet tot te veel box 3-schuld leidt.
 *   Reserve van de partner uit een eerdere gezamenlijke woning (lid 4): een let op.
 * - Een toevoeging vervalt op de datum `reserveTermijnJaren` jaar na `datumToevoeging` (copy: "Geldt tot {datum}").
 */
export interface EigenWoningInvoer {
  woz: number
  periodeHoofdverblijf?: { van: string; tot: string }
  /** Eenvoudige invoer: totale betaalde rente (alles kwalificerend). */
  rente?: number
  leningdelen?: LeningdeelInvoer[]
  /** Financieringskosten van de eigenwoningschuld; tellen mee in de maximale eigenwoningschuld zonder vermindering met de reserve. */
  financieringskosten?: number
  erfpacht?: number
  /** Ronde 2. Vorige eigen woning, verkocht in dit jaar: het positieve vervreemdingssaldo gaat in de eigenwoningreserve. */
  vorigeWoning?: { leverdatum: string; verkoopprijs: number; verkoopkosten: number; eigenwoningschuld: number; aandeelA: number }
  /**
   * Ronde 2. Eigenwoningreserve uit eerdere jaren per toevoeging (doorrol); vervalt per toevoeging op de datum
   * `reserveTermijnJaren` jaar na `datumToevoeging`. Wie een woning vóór het dossierjaar verkocht (bijvoorbeeld in 2024 bij
   * een dossier dat in 2025 begint), vult hier de toevoeging in: de UI rekent het vervreemdingssaldo uit de
   * verkoopgegevens en bewaart alleen het bedrag en de datum.
   */
  eigenwoningreserve?: Array<{ eigenaar: PersoonId; datumToevoeging: string; bedrag: number }>
  /**
   * Ronde 2. Aankoop van een nieuwe eigen woning in dit jaar (bijleenregeling, art. 3.119a lid 3). Is `vorigeWoning` op
   * dezelfde dag geleverd, dan rekent de engine met eerst de verkoop (de reserve telt mee).
   */
  aankoop?: { leverdatum: string; koopsom: number; kostenKoper: number; aandeelA: number }
  /**
   * Ronde 2. Verbetering of onderhoud van de eigen woning in dit jaar (art. 3.119a lid 2 onder b, 3.119aa lid 2 onder c).
   * In het jaar van een aankoop tellen verbeteringen op of na de leverdatum mee in de maximale eigenwoningschuld van de
   * nieuwe woning; een verbetering ervoor hoort bij de vorige woning. Zonder datum: op de leverdatum (of 1 januari).
   */
  verbeteringen?: Array<{ datum: string; kosten: number }>
}

export type Box3Categorie =
  | 'bankNL'
  | 'bankBuitenland'
  | 'contant'
  | 'groen'
  | 'beleggingen'
  | 'crypto'
  | 'vorderingen'
  | 'onroerend'
  | 'overig'
  | 'nettolijfrente'

export type Eigenaar = PersoonId | `kind:${string}`

export interface VermogensPositie {
  id: string
  omschrijving: string
  categorie: Box3Categorie
  eigenaar: Eigenaar
  /** Waarde op 1 januari van het belastingjaar (peildatum). */
  waardeBegin: number
  /** Waarde op 1 januari van het volgende jaar (voor werkelijk rendement en de prognose). */
  waardeEind?: number
  /** Voor werkelijk rendement. */
  stortingen?: number
  onttrekkingen?: number
  directeOpbrengsten?: number
  /**
   * Ingehouden buitenlandse bronbelasting op dividend/rente. Ronde 2: vervangen door `bronbelastingen`; de engine leest
   * dit oude veld als één regel (soort dividend) als `bronbelastingen` ontbreekt. Nieuwe invoer schrijft het niet meer.
   */
  bronbelasting?: { land: string; bedrag: number; brutoInkomsten: number }
  /** Ronde 2. Buitenlandse bronbelasting per land en soort (een fonds of broker keert uit meerdere landen uit). */
  bronbelastingen?: BronbelastingRegel[]
  /** Ronde 2. Herkomst uit een import (broker-CSV); de engine negeert het, de import werkt erop bij in plaats van te dupliceren. */
  herkomst?: PositieHerkomst
  /** Ingehouden Nederlandse dividendbelasting (voorheffing). */
  dividendbelasting?: number
  /** Voor het stelsel vanaf 2028. */
  aanschafwaarde?: number
  /** Datum van een categoriewissel binnen 3 maanden rond de peildatum (arbitragetoets). */
  categoriewisselDatum?: string
  /** Vastgoed: WOZ begin/eind en dagen eigen gebruik. */
  woz?: { begin: number; eind: number; dagenEigenGebruik?: number }
}

/**
 * Ronde 2. Eén regel buitenlandse bronbelasting (art. 25 Bvdb; aangifte 2.21 'Is er buitenlandse belasting ingehouden?').
 * Lees regels altijd via `bronbelastingRegels(positie)` (lib/tax/modules/box3/bronbelasting-invoer.ts): die leest ook
 * het oude veld `bronbelasting`, zodat engine, rapport en UI hetzelfde zien.
 */
export interface BronbelastingRegel {
  /** Vaste id binnen de positie ('bb-…'); sleutel voor de terugvraagstatus. */
  id: string
  /**
   * ISO 3166-1 alpha-2 in hoofdletters ('US', 'CH'); '' = nog niet gekozen (controle bron-land, fout: invullen). Een
   * land dat niet in de landentabel staat: verrekenen tot `bronbelastingMaxPct` met een let op (bestaande dossiers
   * veranderen niet ongemerkt); een land in de tabel zonder verdrag: niets verrekend, let op.
   */
  land: string
  soort: 'dividend' | 'rente'
  /** Bruto dividend of rente waarover is ingehouden, in euro's. */
  brutoInkomsten: number
  /** Ingehouden belasting in euro's. */
  bedrag: number
  /** Datum van de inhouding, voor de terugvraagtermijn; ontbreekt = 31 december van het jaar. */
  datum?: string
  /** Eigen verdragstarief (fractie) als het land niet in de tabel staat of afwijkt. */
  verdragstarief?: number
}

/** Ronde 2. Herkomst van een positie uit een import. */
export interface PositieHerkomst {
  bron: 'import'
  /** Formaat van de import, bijvoorbeeld 'degiro-rekening' (lib/import/types.ts BrokerFormaat). */
  formaat: string
  /**
   * Rekeningsleutel ('degiro:ab12…'); twee posities van dezelfde rekening hebben dezelfde sleutel. HMAC-SHA256 van het
   * rekeningnummer met een geheim per huishouden (lib/import/sleutel.ts), afgekapt; zonder dat geheim is het nummer er
   * niet uit terug te vinden. Een rekening zonder nummer krijgt een willekeurige id. Komt niet in het tabblad Invoer
   * van het Excel-rapport.
   */
  sleutel: string
  rol: 'effecten' | 'geld' | 'crypto'
  geimporteerdOp: string
  /**
   * Ingelezen bestanden: hash van de genormaliseerde regels (niet van de bestandsnaam), aantal regels en de periode.
   * Zo herkent de import een tweede keer hetzelfde bestand. Geen namen of rekeningnummers.
   */
  bestanden?: Array<{ hash: string; regels: number; van?: string; tot?: string }>
}

export interface SchuldPositie {
  id: string
  omschrijving: string
  eigenaar: Eigenaar
  waardeBegin: number
  waardeEind?: number
  betaaldeRente?: number
  /**
   * Ronde 2. Herkomst: het niet-kwalificerende deel van een hypotheek (bijleenregeling, aflossingseis), door de doorrol
   * gezet; `sleutel` = `LeningdeelInvoer.id` (oude invoer: de omschrijving). Een tweede doorrol werkt deze schuld bij in
   * plaats van een nieuwe. De stand volgt uit de splitsing van het leningdeel (`leningsplitsing.anderEind`).
   */
  herkomst?: { bron: 'eigenwoningschuld'; jaar: number; sleutel: string }
}

export interface Box3Invoer {
  posities: VermogensPositie[]
  schulden: SchuldPositie[]
  /** Kies tegenbewijs: werkelijk rendement opgeven als dat lager is. */
  tegenbewijs?: boolean
}

export interface PgaInvoer {
  giftenGewoon?: number
  giftenPeriodiek?: number
  giftenCultureel?: number
  specifiekeZorgkosten?: number
  /** Scholingsuitgaven (alleen t/m 2021). */
  scholing?: number
}

export interface Box2Invoer {
  /** Ronde 2. Vaste id (lib/dossier/ids.ts); sleutel voor veld-id's, invulhulp en controles. */
  id?: string
  eigenaar: PersoonId
  dividend: number
  ingehoudenDividendbelasting: number
  vervreemdingsvoordeel?: number
  schuldAanBV?: number
}

/** Verdeling van gemeenschappelijke inkomensbestanddelen: aandeel van persoon A (0..1). */
export interface Verdeling {
  eigenWoning: number
  pga: number
  box3: number
  box2: number
  dividendbelasting: number
}

export interface HuishoudenInvoer {
  jaar: number
  variant?: string
  personen: PersoonInvoer[]
  /** Fiscaal partnerschap het hele jaar. */
  fiscaalPartner: boolean
  kinderen: KindInvoer[]
  eigenWoning?: EigenWoningInvoer
  box3: Box3Invoer
  pga?: PgaInvoer
  box2?: Box2Invoer[]
  /** 'optimaal' = engine zoekt de verdeling met de laagste gezamenlijke heffing. */
  verdeling: Verdeling | 'optimaal'
  /** Opgegeven toetsingsinkomen bij Toeslagen (voor de vergelijking voorschot/definitief). */
  opgegevenToetsingsinkomen?: number
  /** Ronde 2. Er wordt aangifte gedaan (art. 9.4 lid 1 onder b); ontbreekt = ja. Alleen de publieke calculator zet nee. */
  aangifteGedaan?: boolean
}

// ---------------------------------------------------------------------------
// 4. Uitkomst
// ---------------------------------------------------------------------------

export type RegelSoort = 'plus' | 'min' | 'subtotaal' | 'totaal' | 'info'

export interface Uitlegregel {
  id: string
  label: string
  bedrag: number
  soort: RegelSoort
  /** 0 = hoofdregel, 1 = onderdeel, 2 = detail. */
  niveau: 0 | 1 | 2
  formule?: string
  /** Pad in de params, bijv. 'ondernemer.mkbWinstvrijstelling'. */
  parameter?: string
  bron?: Bron
  status?: Status
}

export type Ernst = 'info' | 'let-op' | 'actie'

export interface Waarschuwing {
  id: string
  ernst: Ernst
  tekst: string
  bron?: Bron
}

export interface ModuleUitkomst {
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

/** Afschrijving van één actief uit het activaregister (fiscaal rapport 5.4.1 en 5.3). */
export interface AfschrijvingActief {
  omschrijving: string
  aanschafwaarde: number
  restwaarde: number
  boekwaardeBegin: number
  afschrijving: number
  /** Fiscale boekwaarde aan het einde van het jaar: 0 in het verkoopjaar, anders de `boekwaardeBegin` van volgend jaar. */
  boekwaardeEind: number
  boekwinst: number
  /** Positie van dit actief in `OndernemingInvoer.activa` (activa van na dit jaar of al eerder verkocht ontbreken). */
  invoerIndex?: number
  /** true als het actief dit jaar is verkocht: het hoort dan niet meer in het register van volgend jaar. */
  verkochtDitJaar?: boolean
}

/** Investeringsaftrek per bedrijfsmiddel en regeling (fiscaal rapport 5.6.2). */
export interface InvesteringsaftrekMiddel {
  omschrijving: string
  datum: string
  regeling: 'kia' | 'eia' | 'mia-1' | 'mia-2' | 'mia-3'
  /** Totaalbedrag van de investering. */
  bedrag: number
  /** Bedrag waarover de aftrek is berekend (bij een bedrijfsmiddel dat nog niet in gebruik is: het betaalde deel). */
  betaald: number
  /** Aftrek voor dit middel; de KIA is naar rato verdeeld zodat de som gelijk is aan de KIA van de onderneming. */
  aftrek: number
  /**
   * Toegepast percentage investeringsaftrek (KIA in de percentagezone het KIA-percentage, daarboven KIA gedeeld
   * door de investeringen; EIA en MIA hun percentage). Nodig voor `ActiefInvoer.investeringsaftrek.genotenPct`.
   */
  genotenPct?: number
}

export interface OndernemingResultaat extends ModuleUitkomst {
  naam: string
  saldo: number
  correctieBeperktAftrekbaar: number
  kia: number
  eia: number
  mia: number
  desinvesteringsbijtelling: number
  bijtellingAuto: number
  kilometeraftrek: number
  verplichteForAfname: number
  /** Winst uit onderneming vóór ondernemersaftrek (= basis arbeidsinkomen en premiegrondslag). */
  winst: number
  urencriteriumGehaald: boolean
  isStarter: boolean
  /** Jaarequivalent als maandenGewerkt < 12 (prognose); anders gelijk aan winst. */
  winstJaarequivalent: number
  /**
   * Afschrijving en fiscale boekwaarde per actief uit het activaregister. Bij 'uitgesplitst' vervangt het register
   * de handmatige afschrijving; bij 'saldo' telt het alleen mee via `correctieAfschrijving`. Beide alleen als
   * `activaregisterTeltMee` true is.
   */
  afschrijvingen?: AfschrijvingActief[]
  /**
   * Telt het activaregister mee voor de winst? Alleen met `activaVolledig` true en bij 'saldo' ook
   * `afschrijvingenInSaldo` ingevuld (zie `activaregisterTeltMee` in modules/onderneming). Anders is `afschrijvingen`
   * alleen een fiscale controle en staat de afschrijving uit de boekhouding in het saldo. Ontbreekt zonder register.
   */
  activaregisterTeltMee?: boolean
  /**
   * Geboekte min fiscale afschrijving, met een activaregister: bij 'saldo' als `afschrijvingenInSaldo` is ingevuld
   * (saldo = ingevoerd saldo + correctieAfschrijving), bij 'uitgesplitst' als `afschrijvingen` is ingevuld (het
   * register vervangt die). Zit in beide gevallen al in `saldo`; het rapport toont het als bekende correctie op
   * commerciële cijfers. 0 als het register niet meetelt (`activaregisterTeltMee` false).
   */
  correctieAfschrijving?: number
  /** Oudedagsreserve: stand begin, mutaties en stand eind (alleen als er een FOR is ingevuld). */
  forStandBegin?: number
  forVrijwilligeAfname?: number
  forDotatie?: number
  forStandEind?: number
  investeringsaftrekPerMiddel?: InvesteringsaftrekMiddel[]
  /** Ronde 2. Verloop per herinvesteringsreserve; de winstcorrecties zitten in `correctieReserves`. */
  herinvesteringsreserves?: HerinvesteringsreserveUitkomst[]
  /** Ronde 2. Verloop per kostenegalisatiereserve. */
  egalisatiereserves?: EgalisatiereserveUitkomst[]
  /** Ronde 2. Som van de winstcorrecties uit de reserves (− dotatie + vrijval + onttrekking buiten het saldo); zit al in `winst`. */
  correctieReserves?: number
  /** Ronde 2. Staking: specificatie, vrijval en de bedragen voor de aangifte. */
  staking?: StakingUitkomst
  /** Ronde 2. Bijtelling en btw-correctie van de auto. */
  auto?: AutoUitkomst
  /**
   * Ronde 2. Correctie voor beloning aan of terbeschikkingstelling door de partner; zit al in `winst`. De engine geeft
   * het bedrag mee als `OndernemingContext.correctiePartner` (vóór de FOR, zodat ook de dotatie in 2021 en 2022 ermee
   * rekent); berekend in lib/tax/modules/partner.ts.
   *
   * Kapitaalsvergelijking (controle): alle correcties die de engine buiten het ingevoerde saldo toepast
   * (`correctieReserves`, `correctiePartner`, `auto.btwCorrectieAfgetrokken`, `staking.bijgeteld`) blijven buiten de
   * vergelijking van het saldo met de vermogensvergelijking.
   */
  correctiePartner?: number
}

/** Ronde 2. Verloop van een herinvesteringsreserve in dit jaar. */
export interface HerinvesteringsreserveUitkomst {
  id: string
  omschrijving: string
  ontstaanJaar: number
  standBegin: number
  /** Gevormd in dit jaar (een kost in de winst). */
  dotatie: number
  /** Afgeboekt op investeringen van dit jaar (geen winsteffect; verlaagt de afschrijvingsbasis). */
  afboeking: number
  /**
   * Vrijgevallen in de winst: geen voornemen meer, staking ('geheel' of 'gedeeltelijk'), of het laatste jaar van de
   * termijn (`jaar === uiterlijkJaar`: de stand na afboeking op de investeringen van dat jaar).
   */
  vrijval: number
  standEind: number
  /**
   * Laatste jaar waarin de reserve gebruikt kan worden: `termijnVerlengdTot ?? ontstaanJaar + hir.termijnJaren`. In dat
   * jaar valt de rest vrij; de doorrol zet de reserve daarna niet meer door. Voorbeeld: ontstaan 2026 geeft 2029.
   */
  uiterlijkJaar: number
  reden?: 'termijn' | 'geen-voornemen' | 'staking'
  /** Dotatie begrensd op de boekwinst (opbrengst min boekwaarde zonder willekeurige afschrijving); controle hir-boekwinst. */
  begrensd?: { gevraagd: number; boekwinst: number }
}

/** Ronde 2. Verloop van een kostenegalisatiereserve in dit jaar. */
export interface EgalisatiereserveUitkomst {
  id: string
  omschrijving: string
  standBegin: number
  dotatie: number
  onttrekking: number
  vrijval: number
  standEind: number
  /** Effect op de winst (negatief = lagere winst); 0 als alles al in het saldo zit. */
  winstcorrectie: number
}

/**
 * Ronde 2. Staking: de zeven velden van het scherm Stakingswinst (2.13) en de vrijval. Bij 'geruisloosBV' en
 * 'doorschuiving': `basis` 0, `reservesVrijval` 0 en `desinvesteringsbijtelling` 0 (reserves en de verplichting tot
 * bijtelling gaan mee naar de overnemer), alleen `forVrijval`, met een melding.
 */
export interface StakingUitkomst {
  soort: NonNullable<StakingInvoer['soort']>
  /** Stakingswinst uit de posten of het ene bedrag, zonder vrijval en desinvesteringsbijtelling. */
  basis: number
  /** Deel van de posten dat niet in het saldo zat en door de engine bij de winst is geteld. */
  bijgeteld: number
  forVrijval: number
  reservesVrijval: number
  desinvesteringsbijtelling: number
  /**
   * Totale stakingswinst: grondslag voor de stakingsaftrek en voor de stakingslijfrente ("winst behaald met of bij die
   * staking", art. 3.129 lid 1: vóór stakingsaftrek en MKB-winstvrijstelling).
   */
  totaal: number
  /** Toegepaste stakingsaftrek (ook bij 'geruisloosBV' over de FOR-vrijval); de doorrol telt dit op bij `genotenStakingsaftrek`. */
  stakingsaftrek?: number
  aangifte: {
    onroerendeZaken: number
    immaterieleActiva: number
    overigeActiva: number
    vrijvalOudedagsreserve: number
    vrijvalOverigeReserves: number
    overigResultaat: number
    desinvesteringsbijtelling: number
  }
}

/** Ronde 2. Bijtelling en btw-correctie van de auto van de zaak. */
export interface AutoUitkomst {
  soort: 'geen' | 'youngtimer' | 'nulEmissie' | 'algemeen' | 'gemengd'
  /** Bijtelling vóór eigen bijdrage en plafond. */
  bruto: number
  eigenBijdrage: number
  /** Autokosten inclusief de btw-correctie (plafond van de bijtelling). */
  plafond: number
  bijtelling: number
  /** Btw-correctie privégebruik na tijdsevenredigheid en maximum; 0 zonder `AutoInvoer.btw` of zonder btw-aftrek. */
  btwCorrectie: number
  /** Deel van de btw-correctie dat niet in de autokosten zat en van de winst is afgetrokken. */
  btwCorrectieAfgetrokken: number
  /** Hoe de btw-correctie tot stand kwam; null zonder `AutoInvoer.btw`. */
  btwDetail?: {
    pct: number | null
    maanden: number
    /** Maximum (btw op kosten plus eventueel 1/5 van de aanschaf-btw); null als het niet bekend is. */
    maximum: number | null
    jaarIngebruikname: number | null
    reden: 'forfait' | 'forfait-verlaagd' | 'kilometers' | 'geen-aftrek' | 'onbekend-jaar'
  } | null
  /** Eerste dag waarop de auto youngtimer is in dit jaar; ontbreekt als dat niet in dit jaar valt. */
  youngtimerVanaf?: string
  /** Het overgangsrecht is toegepast (de laagste van beide regimes; zie `TaxYearParams` ondernemer.auto.youngtimerOvergang). */
  overgangsrecht: boolean
  /** Bijtelling zonder overgangsrecht, als het overgangsrecht van toepassing kon zijn (voor de uitleg). */
  zonderOvergangsrecht?: number
}

/** Verloop van de niet-benutte zelfstandigenaftrek uit één eerder jaar (fiscaal rapport 6.1). */
export interface NietBenutJaar {
  jaar: number
  /** Openstaand bedrag aan het begin van dit jaar (zoals ingevoerd). */
  begin: number
  /** Dit jaar verrekend. */
  verrekend: number
  /** Niet meer te verrekenen: alles als de termijn al voorbij was, het restant als dit het laatste jaar van de termijn is. */
  vervallen: number
  /** Schuift door naar volgend jaar: begin − verrekend − vervallen. */
  rest: number
  /** Laatste jaar waarin dit bedrag verrekend kan worden. */
  laatsteJaar: number
}

export interface OndernemersaftrekResultaat extends ModuleUitkomst {
  zelfstandigenaftrek: number
  startersaftrek: number
  soAftrek: number
  meewerkaftrek: number
  stakingsaftrek: number
  startersaftrekAO: number
  totaal: number
  nietBenutteZelfstandigenaftrekNieuw: number
  verrekendNietBenut: number
  /** Verloop per eerder jaar van de ingevoerde niet-benutte zelfstandigenaftrek (oudste jaar eerst); ontbreekt zonder invoer. */
  nietBenutOverzicht?: NietBenutJaar[]
}

/** Jaarruimteberekening van één jaar uit de tabel (fiscaal rapport, bijlage jaar- en reserveringsruimte). */
export interface JaarruimteJaar {
  jaar: number
  /** Inkomsten van het voorgaande jaar (premiegrondslag-inkomen). */
  inkomen: number
  /** Toename van de oudedagsreserve in het voorgaande jaar. */
  forToename: number
  /** Berekening met de lijfrenteregels van dat jaar; ontbreekt als die regels niet bekend zijn. */
  berekening?: {
    inkomensgrens: number
    afgetopt: boolean
    franchise: number
    premiegrondslag: number
    pct: number
    verrekenbaar: number
    pensioencorrectie: number
    maxJaarruimte: number
    jaarruimte: number
  }
  /** Opgegeven jaarruimte (bijvoorbeeld uit een eerdere aangifte); wint van de berekening. */
  jaarruimteOpgegeven?: number
  /** Jaarruimte waarmee is gerekend: opgegeven, anders berekend. */
  jaarruimte: number
  /** Al in eerdere aangiftes benut als jaar- of reserveringsruimte (0 voor het jaar zelf). */
  alGebruikt: number
}

export interface InkomensvoorzieningResultaat extends ModuleUitkomst {
  jaarruimte: number
  reserveringsruimte: number
  /** Per jaar: niet-benutte ruimte, dit jaar benut, resterend, vervaljaar. */
  tabel: Array<{ jaar: number; jaarruimte: number; nietBenutBegin: number; ditJaarBenut: number; resterend: number; vervaltNa: number }>
  lijfrenteAftrek: number
  aovAftrek: number
  forOmzettingAftrek: number
  nietAftrekbaar: number
  totaal: number
  /** Berekening van de jaarruimte per jaar uit `tabel`, in dezelfde volgorde. */
  jaarruimteBerekeningen?: JaarruimteJaar[]
  /** Ronde 2. Stakingslijfrente; de aftrek zit in `totaal`. */
  stakingslijfrente?: StakingslijfrenteUitkomst
}

/** Ronde 2. Stakingslijfrente (art. 3.129). */
export interface StakingslijfrenteUitkomst {
  categorie: 'hoog' | 'midden' | 'laag'
  maximum: number
  /** Reeds opgebouwde voorzieningen die van het maximum afgaan (lid 3). */
  voorzieningen: number
  /** min(stakingswinst, max(0, maximum − voorzieningen)). */
  ruimte: number
  premie: number
  aftrek: number
  /**
   * Ronde 2 (review). Deel van de aftrek dat uit de vrijval van de oudedagsreserve komt:
   * min(aftrek, max(0, FOR-vrijval − aftrek FOR-omzetting)). Daarover gaat de Zvw-correctie (`zvwCorrectieFor`). In de
   * aangifte bij "betaalde uit de oudedagsreserve, bij staking", samen met de FOR-omzetting.
   */
  uitFor?: number
  /** Ronde 2 (review). premie − uitFor: in de aangifte bij "betaalde uit alleen de stakingswinst". */
  uitStakingswinst?: number
}

export interface EigenWoningResultaat extends ModuleUitkomst {
  forfait: number
  aftrekbareKosten: number
  hillenAftrek: number
  /** Saldo (positief = inkomen, negatief = aftrek), vóór verdeling. */
  saldo: number
  nietKwalificerendeSchuld: number
  /** Onderdelen van de aftrekbare kosten. */
  rente?: number
  financieringskosten?: number
  erfpacht?: number
  /** Per leningdeel (alleen bij invoer met leningdelen). */
  leningdelen?: Array<{ omschrijving: string; betaaldeRente: number; aftrekbareRente: number; kwalificerend: boolean }>
  /**
   * Ronde 2. Eigenwoningreserve per persoon na dit jaar, met vervaldatum per toevoeging (`datumToevoeging` +
   * `reserveTermijnJaren` jaar; copy "Geldt tot {datum}"). Vervallen toevoegingen staan er niet meer in.
   */
  eigenwoningreserve?: Array<{ eigenaar: PersoonId; datumToevoeging: string; bedrag: number; vervaltOp: string }>
  /** Ronde 2. Vervreemdingssaldo van de vorige woning (positief = toevoeging aan de reserve). */
  vervreemdingssaldo?: number
  /**
   * Ronde 2. Maximale eigenwoningschuld na de bijleenregeling (verwervingskosten min reserve vóór de leverdatum plus
   * financieringskosten); bij partners met gezamenlijke leningdelen samen (art. 3.119a lid 10).
   */
  maxEigenwoningschuld?: number
  /**
   * Ronde 2. Splitsing per leningdeel in deel hoofdverblijf en ander deel, zoals de aangifte vraagt (2.22): schuld op
   * 1 januari en 31 december en rente. Het andere deel is een box 3-schuld. `id` = `LeningdeelInvoer.id`; de doorrol
   * zet `eigenwoningEind` als `LeningdeelInvoer.eigenwoningschuld.begin` van volgend jaar en `anderEind` als box 3-schuld.
   */
  leningsplitsing?: Array<{
    id?: string
    omschrijving: string
    eigenwoningBegin: number
    anderBegin: number
    eigenwoningEind: number
    anderEind: number
    renteEigenWoning: number
    renteAnder: number
    reden?: 'bijleenregeling' | 'aflossingseis' | 'termijn'
  }>
}

export interface Box1Resultaat extends ModuleUitkomst {
  inkomen: number
  schijven: Array<{ van: number; tot: number | null; over: number; tarief: number; belasting: number }>
  belasting: number
  premie: number
  tariefmaatregel: number
  totaal: number
  /** Inkomen waarover premie volksverzekeringen wordt geheven (tot de grens van schijf 1). */
  premieInkomen?: number
  /** Premie per volksverzekering, elk apart naar beneden afgerond; de som kan 1 lager zijn dan `premie`. */
  premieRegels?: Array<{ soort: 'aow' | 'anw' | 'wlz'; pct: number; bedrag: number }>
  /** Deel van de aftrekposten dat in het toptarief valt (grondslag van de tariefmaatregel). */
  tariefmaatregelGrondslag?: number
  /** Toptarief min het maximale aftrektarief. */
  tariefmaatregelPct?: number
}

export type HeffingskortingSoort = 'algemeen' | 'arbeid' | 'iack' | 'ouderen' | 'jonggehandicapt' | 'groenBeleggen'

export interface HeffingskortingenResultaat extends ModuleUitkomst {
  algemeen: number
  arbeid: number
  iack: number
  ouderen: number
  jonggehandicapt: number
  groenBeleggen: number
  /** Som vóór verzilveringsgrens. */
  bruto: number
  /** Werkelijk verrekend (max belasting + premies). */
  verzilverd: number
  nietVerzilverd: number
  /** Splitsing per korting in een belastingdeel en een premiedeel (naar de tarieven van schijf 1). */
  delen?: Array<{ soort: HeffingskortingSoort; totaal: number; belastingdeel: number; premiedeel: number }>
}

/** Rendement per regel van het forfaitaire stelsel (bezittingen per categorie, schulden en schuldendrempel). */
export interface Box3RendementRegel {
  categorie: Box3Categorie | 'schulden' | 'schuldendrempel'
  grondslag: number
  pct: number
  bedrag: number
}

/** Vermogen van één box 3-pot op een peildatum. */
export interface Box3Peildatum {
  /** Bezittingen na vrijstellingen. */
  bezittingen: number
  /** Vrijgesteld deel (groene beleggingen, contant geld, nettolijfrente). */
  vrijgesteld: number
  schulden: number
  /** Schuldendrempel van de pot (per persoon maal het aantal personen). */
  schuldendrempel: number
  aftrekbareSchulden: number
  rendementsgrondslag: number
}

/** Voordeel over één schijf van de grondslag in het schijvenstelsel (regime 'schijven2017'). */
export interface Box3SchijfRegel {
  /** Ondergrens en bovengrens van de schijf (null = geen bovengrens). */
  van: number
  tot: number | null
  /** Deel van de grondslag in deze schijf. */
  grondslag: number
  pct: number
  /** Voordeel over deze schijf in hele euro's; zo afgerond dat de som van de schijven het voordeel van de persoon is. */
  bedrag: number
}

/** Eén box 3-berekening: bij fiscale partners één pot voor beiden, anders één per persoon. */
export interface Box3Pot {
  personen: PersoonId[]
  positieIds: string[]
  schuldIds: string[]
  /** Peildatum 1 januari. */
  begin: Box3Peildatum
  /** Peildatum 1 januari van het volgende jaar; alleen als die waarde van alle posities en schulden bekend is. */
  eind?: Box3Peildatum
  heffingsvrijVermogen: number
  grondslag: number
  /** Grondslag per persoon volgens de verdeling (niet afgerond). */
  grondslagPerPersoon: Record<PersoonId, number>
  /**
   * Grondslag per persoon in hele euro's, waarmee het voordeel is berekend: bij partners A afgerond en
   * B = grondslag − A, zodat de delen optellen tot de grondslag.
   */
  grondslagDeel?: Record<PersoonId, number>
  forfaitairRendement: number
  /** Rendementspercentage van deze pot waarmee het voordeel is berekend (forfaitair stelsel: afgekapt op twee decimalen). */
  effectiefPct?: number
  rendementRegels: Box3RendementRegel[]
  /** Schijvenstelsel: het voordeel per schijf, per persoon over diens deel van de grondslag. */
  voordeelPerSchijf?: Partial<Record<PersoonId, Box3SchijfRegel[]>>
  /** Methode van deze pot: forfaitair of werkelijk rendement (tegenbewijs). */
  gekozen?: Box3Resultaat['gekozen']
  /** Werkelijk rendement van deze pot, als dat is berekend. */
  werkelijkRendement?: number | null
  dividendbelasting: number
}

export interface Box3Resultaat extends ModuleUitkomst {
  bezittingen: number
  aftrekbareSchulden: number
  rendementsgrondslag: number
  grondslag: number
  forfaitairRendement: number
  effectiefPct: number
  werkelijkRendement: number | null
  gekozen: 'forfaitair' | 'werkelijk' | 'nvt'
  /** Voordeel per persoon na verdeling. */
  voordeel: Record<PersoonId, number>
  belasting: Record<PersoonId, number>
  bronbelasting: Record<PersoonId, number>
  dividendbelasting: number
  /** Rendementsgrondslag inclusief kindvermogen, vóór heffingsvrij vermogen (vermogenstoets toeslagen). */
  vermogenToeslagen: number
  /** Rendement per regel (alleen forfaitair stelsel). */
  rendementRegels?: Box3RendementRegel[]
  /** De berekening per pot (partners samen één pot, anders één per persoon). */
  potten?: Box3Pot[]
  /** Ronde 2. Buitenlandse bronbelasting per regel (land, verdragstarief, verrekenbaar, terug te vragen). */
  bronbelastingRegels?: BronbelastingRegelUitkomst[]
  /** Ronde 2. Ingehouden, verrekenbaar en terug te vragen per land (samenvatting en aangifte 2.21). */
  bronbelastingPerLand?: Array<{ land: string; bruto: number; ingehouden: number; verrekenbaar: number; terugTeVragen: number }>
  /** Ronde 2. Posities die niet in box 3 tellen omdat ze ter beschikking zijn gesteld (art. 3.91). */
  buitenBox3?: string[]
}

/** Ronde 2. Uitkomst van één regel buitenlandse bronbelasting. */
export interface BronbelastingRegelUitkomst {
  positieId: string
  regelId: string
  land: string
  soort: 'dividend' | 'rente'
  eigenaar: Eigenaar
  bruto: number
  ingehouden: number
  /** Toegepast verdragstarief; null = onbekend land zonder eigen tarief (niets verrekend). */
  verdragstarief: number | null
  /** min(ingehouden, verdragstarief × bruto, bronbelastingMaxPct × bruto). */
  verrekenbaar: number
  /** Boven het verdragstarief ingehouden: terug te vragen in het bronland. */
  terugTeVragen: number
  /** Uiterste datum om terug te vragen; null als de termijn onzeker is ('termijn nakijken'). */
  terugvraagUiterlijk: string | null
  procedure?: string
  url?: string
  /** Status van het land in de tabel (alleen 'definitief' na controle bij de primaire bron). */
  landStatus?: Status
}

/** Ronde 2. Bronbelasting per persoon: verrekening tegen de box 3-belasting en voortwenteling (art. 25 lid 4, 25a Bvdb). */
export interface BronbelastingPersoon {
  /** Verrekenbaar dit jaar na de verdragslimieten, na verdeling volgens de box 3-grondslag. */
  verrekenbaar: number
  voortgewenteldIn: number
  /** Plafond: de box 3-belasting van deze persoon (na andere verminderingen). */
  plafond: number
  verrekend: number
  /** Schuift door naar volgend jaar (`voortgewenteldeBronbelasting` van volgend jaar). */
  naarVolgendJaar: number
}

export interface Box2Resultaat extends ModuleUitkomst {
  inkomen: Record<PersoonId, number>
  belasting: Record<PersoonId, number>
  dividendbelasting: Record<PersoonId, number>
}

export interface ZvwResultaat extends ModuleUitkomst {
  bijdrageInkomen: number
  bijdrage: number
  voorlopig: number
  teBetalen: number
  /** Inkomen voor de bijdrage vóór het maximum (belastbare winst, resultaat overig werk, periodieke uitkeringen). */
  inkomenVoorMaximum?: number
  /** Loon of uitkering waarover al een bijdrage is ingehouden (telt mee voor het maximum). */
  loonMetIngehoudenBijdrage?: number
}

/** Uitkomst van de persoonsgebonden aftrek van het huishouden, vóór verdeling. */
export interface PgaUitkomst {
  giften: number
  zorgkosten: number
  scholing: number
  alimentatie: number
  totaal: number
}

/** Toerekening en benutting van de persoonsgebonden aftrek bij één persoon. */
export interface PgaToerekening {
  /** Toegerekend deel van de aftrek van dit jaar plus het eigen restant van vorig jaar. */
  toegerekend: number
  restantVorigJaar: number
  box1: number
  box3: number
  box2: number
  /** Niet benut; schuift door naar volgend jaar. */
  restant: number
}

export interface PersoonResultaat extends ModuleUitkomst {
  id: PersoonId
  ondernemingen: OndernemingResultaat[]
  /**
   * Urencriterium van de persoon over al zijn ondernemingen samen (art. 3.6 geldt per belastingplichtige). Dit is
   * `urencriteriumVorigJaar` voor elke onderneming in het nieuwe jaar. Ontbreekt zonder onderneming.
   */
  urencriteriumGehaald?: boolean
  ondernemersaftrek: OndernemersaftrekResultaat
  winstUitOnderneming: number
  mkbVrijstelling: number
  belastbareWinst: number
  verliesverrekening: number
  /**
   * Openstaande verliezen box 1 na de verrekening van dit jaar, per verliesjaar (oudste eerst). Vervallen
   * verliezen staan er niet meer in. Dit is `verliezen` voor volgend jaar, samen met `verliesDitJaar`.
   */
  verliezenResterend?: Array<{ jaar: number; bedrag: number; vervaltNa: number }>
  /**
   * Verlies box 1 van dit jaar. Gaat eerst terug naar de voorgaande jaren (verliesbeschikking); wat dan overblijft
   * gaat vooruit. Die terugwenteling valt buiten de berekening.
   */
  verliesDitJaar?: number
  loon: number
  overigWerk: number
  periodiekeUitkeringen: number
  reisaftrek: number
  arbeidsinkomen: number
  inkomensvoorziening: InkomensvoorzieningResultaat
  eigenWoning: number
  pga: number
  box1: Box1Resultaat
  box2Inkomen: number
  box2Belasting: number
  box3Inkomen: number
  box3Belasting: number
  verzamelinkomen: number
  heffingskortingen: HeffingskortingenResultaat
  voorheffingen: number
  /** Belasting + premies − verzilverde kortingen (vóór voorheffingen en voorlopige aanslag). */
  verschuldigdIB: number
  voorlopigeAanslag: number
  teBetalenIB: number
  zvw: ZvwResultaat
  /** Marginale druk op de volgende € 1.000 winst (fractie), inclusief Zvw. */
  marginaleDruk?: number
  /** Inkomen uit werk en woning vóór persoonsgebonden aftrek en verliesverrekening (drempelinkomen box 1). */
  drempelinkomenBox1?: number
  /** Inkomen uit aanmerkelijk belang vóór persoonsgebonden aftrek. */
  drempelinkomenBox2?: number
  /** Voordeel uit sparen en beleggen vóór persoonsgebonden aftrek. */
  drempelinkomenBox3?: number
  pgaToerekening?: PgaToerekening
  /** Box 3-belasting vóór verrekening van buitenlandse bronbelasting. */
  box3BelastingVoorVerrekening?: number
  /** Verrekende buitenlandse bronbelasting in box 3. */
  box3Bronbelasting?: number
  voorheffingenDetail?: { loonheffing: number; dividendbelastingBox3: number; dividendbelastingBox2: number }
  /** Ronde 2. Aanslag na de aanslag- en teruggaafgrens (art. 9.4); `teBetalenIB` blijft het bedrag zonder grenzen. */
  aanslag?: AanslagUitkomst
  /** Ronde 2. Buitenlandse bronbelasting met voortwenteling. */
  bronbelasting?: BronbelastingPersoon
  /**
   * Ronde 2. Opbouw van `overigWerk`: eigen invoer, arbeidsbeloning van de partner en terbeschikkingstelling. Het
   * belastbare tbs-resultaat telt mee in het bijdrage-inkomen Zvw en in de premiegrondslag van volgend jaar
   * (art. 3.127 lid 3 onder c), niet in het arbeidsinkomen.
   */
  overigWerkDetail?: { eigen: number; arbeidsbeloningPartner: number; terbeschikkingstelling: TerbeschikkingstellingUitkomst | null }
  /** Ronde 2. Verlies uit aanmerkelijk belang: verrekening, terugwenteling en belastingkorting. */
  box2Verlies?: Box2VerliesUitkomst
  /**
   * Ronde 2. Verlaging van het bijdrage-inkomen Zvw in het stakingsjaar: min(stakingslijfrenteaftrek + aftrek
   * FOR-omzetting, FOR-vrijval) (HR 23-11-2018, ECLI:NL:HR:2018:2175). Zit al in `zvw`; 0 of ontbreekt zonder staking.
   * Aangifte: 'Aftrekbare lijfrentepremies voor ondernemers vanwege een afname van de oudedagsreserve bij staking'.
   */
  zvwCorrectieFor?: number
}

/** Ronde 2. Aanslag per persoon na de grenzen van art. 9.4 Wet IB 2001. */
export interface AanslagUitkomst {
  /** Grond voor de aanslag (art. 9.4 lid 1 onder a tot en met d), of 'geen'. */
  grond: 'a' | 'b' | 'c' | 'd' | 'geen'
  /** Verschuldigde IB en premie volksverzekeringen na heffingskortingen (zonder Zvw). */
  verschuldigd: number
  /** Voorheffingen min ontvangen voorlopige teruggaven. */
  voorheffingssaldo: number
  /** Positieve voorlopige aanslagen; worden na de aanslag verrekend (AWR art. 15), buiten de grenzen. */
  voorlopigeAanslagen: number
  /** Na verrekening van de voorlopige aanslagen; hooguit één van beide is groter dan 0. */
  teBetalen: number
  terug: number
  /** Bedrag dat door een grens niet wordt opgelegd of uitbetaald. */
  vervallenDoorGrens: { soort: 'aanslaggrens' | 'teruggaafgrens'; bedrag: number } | null
}

/**
 * Ronde 2. Terbeschikkingstelling van één persoon. Het resultaat wordt per regel bepaald; de vrijstelling gaat over het
 * saldo (art. 3.99b: "het gezamenlijke bedrag van het resultaat"), ook als dat negatief is:
 * vrijstelling = AFRONDING.tbsVrijstelling(tbsVrijstellingPct × resultaat), belastbaar = resultaat − vrijstelling.
 * Voorbeeld P6: bus zonder vergoeding, kosten 300, afschrijving 1.500: resultaat −1.800, vrijstelling −216, belastbaar −1.584.
 */
export interface TerbeschikkingstellingUitkomst {
  regels: Array<{ id: string; omschrijving: string; resultaat: number; boekwinst?: number; boekwaardeEind?: number }>
  resultaat: number
  vrijstelling: number
  belastbaar: number
}

/** Ronde 2. Box 2-verlies per persoon (art. 4.47 tot en met 4.53). */
export interface Box2VerliesUitkomst {
  /** Verlies van dit jaar (positief bedrag); 0 zonder verlies. Verlaagt het verzamelinkomen van dit jaar (art. 2.18). */
  verliesDitJaar: number
  /**
   * Deel dat terug gaat naar vorig jaar (vermindering van die aanslag, bij beschikking) en de geschatte teruggaaf:
   * de box 2-belasting van vorig jaar met en zonder het verrekende bedrag, met de schijven van vorig jaar (sinds 2024
   * twee schijven; het verlies haalt eerst het bovenste deel weg). Zonder parameters van vorig jaar: null-schatting 0.
   */
  terugwenteling: { bedrag: number; geschatteTeruggaaf: number } | null
  /** Dit jaar verrekend met verliezen uit eerdere jaren. */
  verrekend: number
  /** Openstaande verliezen na dit jaar, per verliesjaar (oudste eerst); dit is `box2Verliezen` van volgend jaar. */
  resterend: Array<{ jaar: number; bedrag: number; vervaltNa: number }>
  /**
   * Verliezen die na hun termijn nog in `box2Verliezen` stonden: de engine verrekent ze niet (controle
   * box2-verlies-vervallen, let op) en de doorrol neemt ze niet mee.
   */
  vervallen: Array<{ jaar: number; bedrag: number }>
  /**
   * Belastingkorting verrekend met de belasting in box 1 van dit jaar, en wat er nog openstaat. `uiterlijkJaar` volgt de
   * wet (art. 4.53: het eerste jaar en de `jarenNaEerste` jaren erna, uiterlijk `uiterlijkJarenNaVerlies` na het
   * verliesjaar). Ronde 2 (besluit na de nacontrole, open punt 16): een rekenvoorbeeld van de Belastingdienst eindigt
   * een jaar eerder (verlies 2024, eerste korting 2026: voorbeeld 2032, wet 2033). `praktijkUiterlijkJaar` is het jaar
   * volgens die rekenwijze als het eerder is dan `uiterlijkJaar`; de UI toont het als melding, zoals
   * `BelastingrenteUitkomst.praktijk`. De engine rekent met de wet.
   */
  belastingkorting: { ditJaar: number; resterend: Array<{ verliesjaar: number; eersteJaar: number; restant: number; uiterlijkJaar: number; praktijkUiterlijkJaar?: number }> }
}

export interface KotResultaat extends ModuleUitkomst {
  perKind: Array<{ kindId: string; rang: number; pct: number; kostenPerJaar: number; toeslagPerJaar: number; eigenBijdragePerJaar: number; aanvraagUiterlijk?: string }>
  totaal: number
}

export interface ToeslagenResultaat extends ModuleUitkomst {
  toetsingsinkomen: number
  vermogenToets: number
  kot: KotResultaat
  kgb: number
  zorgtoeslag: number
  kinderbijslag: number
  kinderbijslagPerKwartaal: Array<{ kwartaal: string; kindId: string; bedrag: number }>
  totaal: number
}

export interface HuishoudenResultaat extends ModuleUitkomst {
  jaar: number
  variant: string | null
  paramsStatus: Status
  personen: PersoonResultaat[]
  verdeling: Verdeling
  verdelingOptimaal: boolean
  eigenWoning: EigenWoningResultaat | null
  box3: Box3Resultaat
  box2: Box2Resultaat
  /** Persoonsgebonden aftrek van het huishouden vóór verdeling. */
  pga?: PgaUitkomst
  toeslagen: ToeslagenResultaat
  totaal: {
    teBetalenIB: number
    teBetalenZvw: number
    verschuldigdIB: number
    verschuldigdZvw: number
    toeslagen: number
    /** IB + Zvw als deel van de som van de omzet (alleen bij uitgesplitste winstberekening). */
    drukOpOmzet: number | null
    /**
     * Ronde 2. Som over de personen van (aanslag.teBetalen − aanslag.terug): te betalen IB na de grenzen. Het grote
     * bedrag in het uitkomstpaneel, de mobiele balk en de jaarkaart lezen `teBetalenIBNaGrenzen ?? teBetalenIB`.
     * De eindcontrole in de invulhulp vergelijkt met `teBetalenIB` (het programma toont het berekende bedrag; de grens
     * past de Belastingdienst pas toe bij het opleggen).
     */
    teBetalenIBNaGrenzen?: number
  }
}

// ---------------------------------------------------------------------------
// 5. Engine-API
// ---------------------------------------------------------------------------

export interface EngineOpties {
  variant?: string
  /** Vaste params (tests); anders getJaar(invoer.jaar, variant). */
  params?: TaxYearParams
  /** Sla de marginale-drukberekening over (sneller, en voorkomt recursie). */
  zonderMarginaleDruk?: boolean
}

export type BerekenHuishouden = (invoer: HuishoudenInvoer, opties?: EngineOpties) => HuishoudenResultaat

// ---------------------------------------------------------------------------
// 6. Ronde 2: tabellen buiten de jaarparameters en planning
// ---------------------------------------------------------------------------

/**
 * Eén periode van de belastingrente (IB en overige belastingen). De tabel staat in years/data/belastingrente.ts
 * (BELASTINGRENTE_IB), oplopend en aansluitend; `tot` null = loopt nog. Rente over een periode die twee percentages
 * raakt, gaat per deel.
 */
export interface BelastingrentePeriode {
  vanaf: string
  tot: string | null
  pct: number
  status: Status
  bron: Bron
}

/**
 * Eén land uit years/data/bronbelasting-landen.ts (jaaronafhankelijk, met peildatum en eigen changelog).
 * Verrekenbaar in Nederland = min(ingehouden, verdrag × bruto, box3.bronbelastingMaxPct × bruto).
 */
export interface BronbelastingLand {
  /** ISO 3166-1 alpha-2. */
  code: string
  naam: string
  /** Tarieven als fractie. `verdrag` null = geen verdrag (geen verrekening tenzij de gebruiker een tarief invult). */
  dividend: { ingehouden: number; verdrag: number | null; opmerking?: string }
  rente?: { ingehouden: number; verdrag: number | null; opmerking?: string }
  /**
   * Terugvragen in het bronland. Regels: 'eindJaarPlus' = 31-12 van (jaar van uitkering + n); 'vanaf1JanPlus' =
   * 31-12 van (jaar + n − 1); 'maandenNaInhouding' = datum inhouding + n maanden; 'jarenNaUitkering' = datum + n jaar;
   * 'onzeker' = geen datum tonen ('termijn nakijken').
   */
  terugvragen?: {
    regel: 'eindJaarPlus' | 'vanaf1JanPlus' | 'maandenNaInhouding' | 'jarenNaUitkering' | 'onzeker'
    n: number
    procedure: string
    url?: string
  }
  /** Volgorde in de keuzelijst: eerst de landen die het vaakst voorkomen. */
  veelgebruikt?: boolean
  /** 'definitief' alleen na controle bij de primaire bron; secundaire bronnen zijn 'geschat'. */
  status: Status
  bron: Bron
  peildatum: string
}

/** Ronde 2. Soort aanslag voor de belastingrente. */
export type BelastingrenteSoort = 'aanslag' | 'voorlopig' | 'navordering'

/**
 * Ronde 2. Invoer voor de belastingrente op één aanslag (modules/planning/belastingrente.ts).
 *
 * De module volgt de wettekst (AWR art. 30f tot en met 30fe): te betalen rente alleen bij vaststelling na 30 juni T+1
 * (30fc lid 1), van 1 juli T+1 tot en met de dag vóór invorderbaar (30fc lid 2); vergoeding tot en met 6 weken na
 * dagtekening (30fd lid 3). Waar de rekenvoorbeelden van de Belastingdienst anders uitkomen, staat dat in
 * `BelastingrenteUitkomst.praktijk` (melding in de tool, open punt in het ontwerp).
 */
export interface BelastingrenteInvoer {
  belastingjaar: number
  soort: BelastingrenteSoort
  /** > 0 te betalen, < 0 terug; na verrekening van voorheffingen en voorlopige aanslagen. */
  bedrag: number
  dagtekening: string
  /** De aanslag is conform de aangifte (of de voorlopige aanslag conform het verzoek). */
  conform: boolean
  ontvangstAangifte?: string
  /** Alleen bij soort 'voorlopig'. */
  ontvangstVerzoek?: string
  /**
   * Met deze aanslag is een voorlopige aanslag verrekend. Bij een teruggaaf volgt de rente dan de regels voor herziening
   * (art. 30fd lid 4, 30fb); de module rekent dat niet en geeft reden 'herziening-niet-berekend'.
   */
  voorlopigeAanslagVerrekend?: boolean
}

export interface BelastingrenteUitkomst {
  /** Positief = te betalen (naar beneden afgerond), negatief = te ontvangen (naar boven afgerond). Volgens de wettekst. */
  bedrag: number
  perioden: Array<{ van: string; tot: string; dagen: number; pct: number; rente: number }>
  /** Waarom er geen rente is, als die er niet is. */
  reden:
    | 'geen-rente-voor-1-mei'
    | 'vastgesteld-voor-1-juli'
    | 'binnen-vergoedingstermijn'
    | 'geen-bedrag'
    | 'na-invorderbaar'
    | 'herziening-niet-berekend'
    | null
  /**
   * Wat de Belastingdienst in zijn rekenvoorbeelden rekent als dat van de wettekst afwijkt; null als het gelijk is
   * (alleen bij te betalen rente; de vergoeding volgt de wet en de voorbeelden komen overeen). De rekenwijze van de
   * voorbeelden op 'Belastingrente betalen bij inkomstenbelasting':
   * - ook rente bij een dagtekening vóór 1 juli T+1 (voorbeeld 2: dagtekening 27-6-2024, € 1.000: 1 juli tot en met
   *   9-8-2024, 39 dagen, € 8; de wet geeft 0, reden 'vastgesteld-voor-1-juli');
   * - einde tot en met de dag die 6 weken (42 dagen) na de dagtekening ligt, geteld met 30 dagen per maand
   *   (27-6 + 42 = 9-8), in plaats van de dag vóór invorderbaar (27-6 + 41 echte dagen = 7-8). Voorbeeld BR1 van
   *   fiscaal-ronde2.md: wet 56, praktijk 57.
   * De grenzen van 19, 14 en 12 weken na ontvangst gelden in beide. De UI toont bij `bedrag` 0 en `praktijk.bedrag` > 0
   * "Mogelijk rekent de Belastingdienst toch rente: ongeveer € …", anders een uitlegregel met het verschil. Open punt
   * in ontwerp-ronde2.md hoofdstuk 13.
   */
  praktijk?: { bedrag: number; perioden: Array<{ van: string; tot: string; dagen: number; pct: number; rente: number }>; toelichting: string } | null
  /** Laagste status van de gebruikte percentages. */
  status: Status
  uitleg: Uitlegregel[]
}

/** Ronde 2. Betalen in termijnen (Invorderingswet art. 9). */
export interface Termijnschema {
  regel: 'voor-jaar' | 'in-jaar' | 'teruggaaf-in-jaar' | 'na-jaar' | 'een-keer'
  termijnen: Array<{ vervaldatum: string; bedrag: number }>
}

/** Ronde 2. Voorlopige aanslag van één heffing (IB/PVV of Zvw) voor één persoon. */
export interface VaHeffing {
  /** Verwachte verschuldigde belasting voor deze heffing. */
  verwacht: number
  voorheffingen: number
  opgelegd: number
  /** verwacht − voorheffingen − opgelegd: > 0 nog te betalen, < 0 te veel. */
  verschil: number
  /** Het verschil valt binnen de aanslag- of teruggaafgrens: aanpassen is niet nodig. */
  binnenGrens: boolean
  /** Bedrag om aan te vragen: verwacht − voorheffingen (nooit negatief voor IB als er geen teruggaaf is). */
  advies: number
  /** Termijnen als het verzoek nu wordt ingediend (alleen in het lopende jaar). */
  termijnenBijVerzoek?: Termijnschema
}

/** Ronde 2. Voorlopige aanslag en belastingrente per persoon (Planning, modules/planning/voorlopige-aanslag.ts). */
export interface VoorlopigeAanslagAdvies {
  persoon: PersoonId
  ib: VaHeffing
  zvw: VaHeffing
  status: 'te-laag' | 'te-hoog' | 'past' | 'niet-nodig'
  /** De velden van het formulier Voorlopige aanslag aanvragen of wijzigen, met de bedragen om over te nemen. */
  formulier: Array<{ id: string; label: string; bedrag: number }>
  /** Rente-scenario over het verschil, bij de gekozen verwachte dagtekening; null zonder verschil of zonder datum. */
  rente: { ib: BelastingrenteUitkomst | null; zvw: BelastingrenteUitkomst | null; perMaand: number } | null
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

// ---------------------------------------------------------------------------
// Ronde 2: een blok per onderdeel
// ---------------------------------------------------------------------------
//
// Elk onderdeel van ronde 2 (A1 tot en met A6) heeft hieronder een eigen blok: nieuwe typen, en nieuwe optionele velden
// op een bestaande interface via interface-samenvoeging (twee `export interface X` in dit bestand zijn één interface).
// Zo bleven de oorspronkelijke declaraties ongewijzigd terwijl zes onderdelen tegelijk werden gebouwd.

// Ronde 2 (A2)

/** Ronde 2 (A2). Bijleenregeling bij een aankoop of verbetering in dit jaar (art. 3.119a lid 2 en 3, lid 10). */
export interface EigenWoningBijleen {
  /** 'aankoop' ook als er in hetzelfde jaar na de leverdatum is verbouwd (`kostenVerbetering`). */
  soort: 'aankoop' | 'verbetering'
  /**
   * Verwervingskosten (koopsom + kosten koper) plus de kosten van verbeteringen op of na de leverdatum, of zonder
   * aankoop de kosten van de verbeteringen.
   */
  kosten: number
  /**
   * Eigenwoningreserve die telt: toevoegingen tot en met de leverdatum (of de verbetering) die nog niet vervallen zijn,
   * partners samen. Een verkoop op dezelfde dag als de aankoop telt mee (eerst de verkoop bij de notaris).
   */
  reserveVoor: number
  financieringskosten: number
  /**
   * max(0, kosten − reserveVoor) + financieringskosten. Kwam er tussen de aankoop en een latere verbetering reserve bij
   * (eerst gekocht, later verkocht), dan per moment: Σ max(0, kosten − reserve direct ervoor) + financieringskosten.
   */
  maxEigenwoningschuld: number
  /** Leningdelen die voor de aankoop of verbetering zijn aangegaan (hoofdsom). */
  leningen: number
  /** Deel daarvan dat eigenwoningschuld is. */
  eigenwoningschuld: number
  /** Deel dat geen eigenwoningschuld is: een box 3-schuld vanaf 1 januari van volgend jaar. */
  ander: number
  /** Deel van de reserve dat door deze aankoop of verbetering is gebruikt. */
  reserveGebruikt: number
  /** Reserve uit toevoegingen ná de leverdatum (eerst gekocht, later verkocht): telt niet voor deze woning. */
  reserveNaAankoop: number
  /** Kosten van verbeteringen in het jaar van aankoop (op of na de leverdatum), al in `kosten`; ontbreekt zonder. */
  kostenVerbetering?: number
}

export interface EigenWoningResultaat {
  /** Ronde 2 (A2). De bijleenregeling van dit jaar, als er een aankoop of verbetering is. */
  bijleenregeling?: EigenWoningBijleen
  /** Ronde 2 (A2). Toevoegingen aan de eigenwoningreserve die in dit jaar zijn vervallen (staan niet meer in `eigenwoningreserve`). */
  reserveVervallen?: Array<{ eigenaar: PersoonId; datumToevoeging: string; bedrag: number; vervaltOp: string }>
}



// Ronde 2 (A5): bronbelasting per land en de partnerregeling.

export interface BronbelastingRegelUitkomst {
  /** Ronde 2 (A5). Naam van het land uit de landentabel; ontbreekt bij een land buiten de tabel. */
  landNaam?: string
  /**
   * Ronde 2 (A5). Herkomst van het tarief: 'eigen' (ingevuld verdragstarief), 'tabel', 'buiten-tabel' (land niet in de
   * tabel: verrekend tot `bronbelastingMaxPct`, met een let op) of 'geen-verdrag' (land in de tabel zonder verdrag).
   */
  tariefBron?: 'eigen' | 'tabel' | 'buiten-tabel' | 'geen-verdrag'
  /** Ronde 2 (A5). Bruto inkomsten ontbreken: gerekend zoals in ronde 1 (het ingehouden bedrag, met een fout bron-bruto). */
  zonderBruto?: boolean
}

export interface BronbelastingLand {
  /**
   * Ronde 2 (A5). Land waar veel beleggingsfondsen (ETF's) zitten die op hun eigen uitkering niets inhouden (Ierland,
   * Luxemburg). Een regel zonder inhouding geeft de melding dat bronbelasting binnen het fonds niet te verrekenen is.
   */
  fondsland?: boolean
}

export interface TerbeschikkingstellingUitkomst {
  /**
   * Ronde 2 (A5). Regels die niet als terbeschikkingstelling tellen (resultaat 0): een werkruimte die niet aan de toets
   * van art. 3.16 lid 1 voldoet (art. 3.93 lid 1 onder b), of een regel waarvan de onderneming er niet meer is.
   */
  nietGeteld?: Array<{ id: string; reden: 'werkruimte' | 'geen-onderneming' }>
}

// Ronde 2 (A6): optionele velden via interface-samenvoeging.

export interface ActiefInvoer {
  /**
   * Ronde 2 (A6). Bedrag waarover investeringsaftrek is genoten, als dat lager is dan de aanschafwaarde (de
   * investering na afboeking van een herinvesteringsreserve, art. 3.54). De desinvesteringsbijtelling is nooit hoger
   * dan `investeringsaftrek.genotenPct` maal dit bedrag (art. 3.47). Ontbreekt = de aanschafwaarde. De doorrol zet het.
   */
  investeringsaftrekGrondslag?: number
}

export interface HerinvesteringsreserveUitkomst {
  /**
   * Ronde 2 (A6). Afboeking per investering van dit jaar (`investering` = itemSleutel(investering, index)): gevraagd,
   * afgeboekt na de grenzen (stand en boekwaarde-eis), en de toets op de economische functie. De doorrol zet
   * `bedrag` als `ActiefInvoer.herinvesteringsreserveAfboeking`.
   */
  perInvestering?: Array<{ investering: string; omschrijving: string; gevraagd: number; bedrag: number; nieuwLanglopend: boolean; zelfdeFunctie: boolean }>
  /**
   * Ronde 2 (A6). Maximale afboeking dit jaar: min(stand, Σ aanschaf − deel van de boekwaarde van het oude middel dat
   * nog niet gedekt is door eerdere vervangende middelen). Per investering niet meer dan de aanschafprijs.
   */
  maxAfboeking?: number
  /**
   * Ronde 2 (review). Boekwaarde-eis over alle vervangende middelen samen (art. 3.54 lid 2). `gedektBegin`: al gedekt
   * door middelen uit eerdere jaren (`afgeleid`: uit de stand en niet uit het doorgerolde veld, zie
   * `HerinvesteringsreserveInvoer.boekwaardeEisGedekt`);
   * `gedektEind`: na de investeringen van dit jaar, ten hoogste `boekwaardeOud`. De doorrol zet `gedektEind` als
   * `boekwaardeEisGedekt` van volgend jaar.
   */
  boekwaardeEis?: { boekwaardeOud: number; gedektBegin: number; gedektEind: number; afgeleid: boolean }
  /** Ronde 2 (A6). Zitten dotatie en vrijval al in het saldo (`zitInSaldo(mutatiesInSaldo, onderneming, 'hir')`)? */
  inSaldo?: boolean
}

export interface EgalisatiereserveUitkomst {
  /** Ronde 2 (A6). Gevraagde onttrekking boven de stand: blijft kosten van dit jaar. */
  onttrekkingBovenStand?: number
  /** Ronde 2 (A6). Zitten dotatie en onttrekking al in het saldo? */
  inSaldo?: boolean
  /** Ronde 2 (A6). Waarom de reserve vrijviel. */
  reden?: 'vervallen' | 'staking'
}

export interface StakingUitkomst {
  /** Ronde 2 (A6). Eerder genoten stakingsaftrek waarmee is gerekend (art. 3.79 lid 4). */
  eerderGenoten?: number
  /** Ronde 2 (A6). Het oude veld `stakingsaftrekEerderGebruikt` zonder bedrag: aangenomen dat alles is genoten. */
  eerderAangenomen?: boolean
}

export interface AutoUitkomst {
  /**
   * Ronde 2 (A6). Het overgangsrecht kan gelden: de auto was op `youngtimerOvergang.youngtimerOp` al ouder dan
   * `oudeLeeftijd` jaar. `terBeschikking` zegt of de auto op tijd ter beschikking stond: 'ja', 'nee', of 'aangenomen'
   * (geen datum, eerste jaar na de grens) of 'onbekend' (geen datum, later jaar: geen overgangsrecht).
   */
  overgang?: { terBeschikking: 'ja' | 'nee' | 'aangenomen' | 'onbekend' }
  /** Ronde 2 (A6). Plafond van de bijtelling zonder de btw-correctie (de autokosten zoals ingevuld). */
  autokosten?: number
  /** Ronde 2 (A6). Zit de btw-correctie al in de autokosten (`zitInSaldo(btw.inAutokosten, onderneming, 'autoBtw')`)? */
  btwInAutokosten?: boolean
  /** Ronde 2 (A6). Bij een saldo uit de winstberekening zit de bijtelling al in het saldo: alleen ter informatie. */
  bijtellingInSaldo?: boolean
}

export interface StakingInvoer {
  /**
   * Ronde 2 (A6). Wat er gebeurde, zoals gekozen in de editor ("Gestopt", "Verkocht", "Omgezet in een BV", "Een deel
   * gestopt"). Alleen voor de weergave: de engine rekent met `soort` (gestopt en verkocht: 'geheel'; een BV: 'geheel'
   * of 'geruisloosBV'; een deel: 'gedeeltelijk').
   */
  gebeurtenis?: 'gestopt' | 'verkocht' | 'bv' | 'deel'
  /**
   * Ronde 2 (A6). Zit het ene bedrag `stakingswinst` (zonder posten) al in het saldo of de rubrieken? Ontbreekt = de
   * standaard voor een stakingspost (`zitInSaldo(…, 'stakingPost')`: ja). Nee: de engine telt het bedrag bij de winst
   * (`StakingUitkomst.bijgeteld`). Met posten geldt `StakingPost.inSaldo` per post.
   */
  stakingswinstInSaldo?: boolean
}
