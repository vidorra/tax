/**
 * Afrondingsregels, met naam, zodat elke afronding in de engine traceerbaar is.
 *
 * Vastgesteld aan de hand van echte aangiftes (privé-regressietests, zie README):
 *  - belasting per schijf, premie volksverzekeringen, tariefmaatregel, Zvw: naar beneden
 *  - MKB-winstvrijstelling en KIA: rekenkundig (de aangiftes onderscheiden rekenkundig en naar boven niet)
 *  - correctie beperkt aftrekbare kosten: naar beneden (20% × 1.143 = 228,6 → 228)
 *  - jaarruimte ("verrekenbare premiegrondslag"): naar boven (2023: 30% × 74.854 = 22.456,2 → 22.457)
 *  - box 3 per categorie: bezittingen naar beneden, schulden naar boven, schuldendrempel naar beneden
 *    (in het voordeel van de belastingplichtige)
 *  - box 3 effectief rendementspercentage: afgekapt op 2 decimalen (4,3008% → 4,30%), voordeel rekenkundig,
 *    belasting naar beneden (aangiftesoftware). De webuitleg van de Belastingdienst rekent met het
 *    aandeel van de grondslag; zie `box3Aandeel` (kan € 1 verschillen).
 *  - heffingskortingen en toeslagen: rekenkundig (niet door een echte aangifte gedekt).
 */

const EPS = 1e-9

// `+ 0` maakt van −0 een gewone 0 (Math.ceil(0 − EPS) en Math.round(−0,4) geven −0, en dat toont als "-0").
export const naarBeneden = (x: number): number => Math.floor(x + EPS) + 0
export const naarBoven = (x: number): number => Math.ceil(x - EPS) + 0
export const rekenkundig = (x: number): number => Math.round(x) + 0

/** Kapt een fractie af op `decimalen` decimalen in procenten (2 → 0,0375 voor 3,7587%). */
export const afkappenPct = (fractie: number, decimalen = 2): number => {
  const f = 10 ** (decimalen + 2)
  return Math.floor(fractie * f + EPS) / f
}

export const AFRONDING = {
  schijf: naarBeneden,
  premie: naarBeneden,
  tariefmaatregel: naarBeneden,
  zvw: naarBeneden,
  mkb: rekenkundig,
  kia: rekenkundig,
  investeringsaftrek: rekenkundig,
  correctieBeperktAftrekbaar: naarBeneden,
  jaarruimte: naarBoven,
  box3Bezitting: naarBeneden,
  box3Schuld: naarBoven,
  box3Drempel: naarBeneden,
  box3EffectiefPct: (f: number) => afkappenPct(f, 2),
  box3Voordeel: rekenkundig,
  box3Belasting: naarBeneden,
  box2Belasting: naarBeneden,
  korting: rekenkundig,
  toeslag: rekenkundig,
  eigenWoning: rekenkundig,
  bijtelling: rekenkundig,
  afschrijving: rekenkundig,
  kilometeraftrek: rekenkundig,
  reisaftrek: rekenkundig,
  ondernemersaftrek: rekenkundig,
  pga: rekenkundig,
  /** Verdeling van gemeenschappelijke posten tussen partners. */
  verdeling: rekenkundig,
  vpb: naarBeneden,
  planning: rekenkundig,
  // Ronde 2
  /** Belastingrente die je betaalt: naar beneden op hele euro's (Belastingdienst). */
  belastingrente: naarBeneden,
  /** Belastingrente die je ontvangt: naar boven op hele euro's (Belastingdienst). */
  belastingrenteVergoeding: naarBoven,
  /** Termijnbedrag van een voorlopige aanslag: op centen (weergave; de Belastingdienst verdeelt in gelijke termijnen). */
  vaTermijn: (x: number): number => Math.round(x * 100 + EPS) / 100 + 0,
  /** Verrekenbare buitenlandse bronbelasting per persoon: naar beneden, zoals de verrekenbare pot tot nu toe. */
  bronbelasting: naarBeneden,
  /** Terbeschikkingstellingsvrijstelling (art. 3.99b), zoals de MKB-winstvrijstelling rekenkundig. */
  tbsVrijstelling: rekenkundig,
  /** Fiscale reserves: herinvesteringsreserve, kostenegalisatiereserve, eigenwoningreserve, stakingswinst. */
  reserve: rekenkundig,
  /** Belastingkorting voor een box 2-verlies (art. 4.53). */
  box2Korting: rekenkundig,
  /** Ronde 2 (A2). Geschatte teruggaaf box 2 over vorig jaar bij terugwenteling van een verlies: rekenkundig (een schatting). */
  box2Terugwenteling: rekenkundig,
  /** Ronde 2 (A5). Terug te vragen bronbelasting (ingehouden min verdragstarief × bruto): op centen, zoals het bronland terugbetaalt. */
  bronbelastingTerugvragen: (x: number): number => Math.round(x * 100 + EPS) / 100 + 0,
  /** Btw-correctie privégebruik auto (A6): hele euro's naar beneden, zoals btw-bedragen in het voordeel van de ondernemer. */
  btwPrive: naarBeneden,
} as const

/** Alternatieve box 3-methode van de Belastingdienst-webuitleg (aandeel op 3 decimalen). */
export const box3Aandeel = (rendement: number, grondslag: number, rendementsgrondslag: number): number => {
  if (rendementsgrondslag <= 0) return 0
  const aandeel = Math.floor((grondslag / rendementsgrondslag) * 100000 + EPS) / 100000
  return rekenkundig(rendement * aandeel)
}
