import type { Bron, TaxYearParams } from '../types'
import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'
import kinderbijslag from './data/kinderbijslag.json'
import kotTabel from './data/kot-tabel-2024.json'

/**
 * Belastingjaar 2024 (bevroren). Toetsjaar van het voorbeeldhuishouden (lib/voorbeeld).
 *
 * Alle velden zijn op 4 oktober 2026 gecontroleerd tegen de MinFin-bijlage Fiscale
 * parameters 2021-2024 (en de aanvullende parameters 2023-2024), de bijlage 2024-2025,
 * de wettekst per 1-1-2024, de Staatsblad-tabel kinderopvangtoeslag en de rekenhulp
 * zorgtoeslag 2024 van Dienst Toeslagen.
 */

const MINFIN_2024: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2024, bijlage 1 Fiscale parameters 2021-2024 en bijlage 2 Aanvullende fiscale parameters 2023-2024',
  url: 'https://www.rijksoverheid.nl/binaries/rijksoverheid/documenten/publicaties/2023/12/20/belangrijkste-wijzigingen-belastingen-2024/20240108+-+Eindejaarsbericht+-+V1.2.pdf',
  datum: '2023-12-19',
}
const BD_2024: Bron = {
  titel: 'Belastingdienst, box 1 tarieven 2024',
  url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/boxen_en_tarieven/box_1/box_1',
  datum: '2024-01-01',
}
const MINFIN_2025: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2025, bijlage 1 Fiscale parameters 2024-2025',
  url: 'https://open.overheid.nl/documenten/dcbb490f-d406-4842-ac33-b5c397e19df0/file',
  datum: '2024-12-18',
}
const ZORGTOESLAG_2024: Bron = {
  titel: 'Dienst Toeslagen, berekening zorgtoeslag 2024',
  url: 'https://download.belastingdienst.nl/toeslagen/docs/berekening_zorgtoeslag_tg0821z41fd.pdf',
  datum: '2024-01-01',
}
const KOT_2024: Bron = {
  titel: 'Besluit van 30 augustus 2023 tot wijziging van het Besluit kinderopvangtoeslag (Stb. 2023, 295)',
  url: 'https://zoek.officielebekendmakingen.nl/stb-2023-295.html',
  datum: '2023-08-30',
}
const TOESLAGEN_2024: Bron = {
  titel: 'Toeslagenkaart 2024 en kinderopvangtoeslagtabel 2024',
  url: 'https://download.belastingdienst.nl/toeslagen/docs/toeslagenkaart_2024_tg7101z42pl.pdf',
  datum: '2024-01-01',
}

const params2024: TaxYearParams = {
  jaar: 2024,
  status: 'definitief',
  bijgewerkt: '2026-10-05',
  changelog: [
    { datum: '2023-12-19', wat: 'Belastingplan 2024 aangenomen', bron: MINFIN_2024 },
    { datum: '2025-02-20', wat: 'Box 3 forfaits 2024 definitief (bank 1,44%, schulden 2,61%)' },
    { datum: '2026-01-16', wat: 'Belastingrente Vpb met terugwerkende kracht gelijk aan IB (HR 16-1-2026): 7,5%' },
    {
      datum: '2026-10-04',
      wat: 'VERIFIEREN-velden gecontroleerd en gecorrigeerd: arbeidskorting AOW (4,364% / 16,214% / 1,275%, max 2.854, afbouw 3,358%), AHK AOW-afbouw 3,420%, EIA 40%, stakingslijfrente, uitvaartvrijstelling 8.665, zorgkostendrempels, reisaftrek 2024, drempelinkomen zorgtoeslag 26.819; KOT-tabel volledig uit Stb. 2023, 295',
      bron: MINFIN_2024,
    },
    {
      datum: '2026-10-04',
      wat: 'eigenWoning.aftrekTermijnStartUiterlijk 2001-01-01 toegevoegd: voor een eigenwoningschuld van vóór 2001 loopt de termijn van 30 jaar renteaftrek vanaf 1 januari 2001 (overgangsrecht Wet IB 2001)',
      bron: { titel: "Belastingdienst, 'Hoe lang kan ik de hypotheekrente aftrekken?' (lening van vóór 2001: 30 jaar vanaf 1 januari 2001)", datum: '2026-10-04' },
    },
    {
      datum: '2026-10-04',
      wat: "ondernemer.for.verplichteAfnameBij: 'bovenOndernemingsvermogen' geschrapt. De FOR neemt verplicht af met het deel boven het ondernemingsvermogen aan het einde van het jaar, en alleen bij (gedeeltelijke) staking, de AOW-leeftijd op 1 januari of twee jaar achter elkaar geen urencriterium; een FOR boven het ondernemingsvermogen is op zichzelf geen grond",
      bron: { titel: 'Wet IB 2001, art. 3.70 lid 1 onder b (tekst 31 december 2022), sinds 2023 van toepassing via art. 10a.29 lid 1', url: 'https://wetten.overheid.nl/BWBR0011353/2022-12-31', datum: '2026-10-04' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (contract): nieuwe velden hir.langlopendVanafJaren, arbeidsbeloningPartnerMin, tbsVrijstellingPct, auto.youngtimerOvergang, auto.btwPrive, stakingslijfrenteRegels, eigenWoning.reserveTermijnJaren, box2.verliesverrekening, box2.belastingkorting, overig.aanslagRendementsgrondslag (36952), overig.belastingrenteRegels en overig.invordering',
      bron: { titel: 'Wet IB 2001 art. 3.16 lid 4, 3.54, 3.99b, 3.119aa, 3.129, 4.49, 4.53 en 9.4; AWR art. 30f-30fe; Invorderingswet 1990 art. 9; Belastingdienst, btw en privégebruik auto van de zaak', url: 'https://wetten.overheid.nl/BWBR0011353/2024-01-01', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'arbeidsbeloningPartnerMin weer weggehaald: de drempel van art. 3.16 lid 4 staat alleen in ondernemer.meewerkaftrek.maxVergoeding (één veld voor dezelfde drempel); auto.youngtimerOvergang krijgt de vorm { terBeschikkingUiterlijk, youngtimerOp, oudeLeeftijd }: het overgangsrecht geldt alleen voor een auto die op 31-12-2025 al youngtimer was',
      bron: { titel: 'Toets ronde 2 (fiscaal): besluit 12-2-2026 nr. 2026-2493 (Stcrt. 20-2-2026); Wet IB 2001 art. 3.16 lid 4, 9.4 en 10.1; SRA, belastingrente 2026; ECB-persbericht 10-9-2026', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (na de nacontrole): overig.belastingrenteRegels.navorderingVerzoekMaxWeken 12 toegevoegd: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt de belastingrente uiterlijk 12 weken na ontvangst van het verzoek (nagekeken in de tekst geldend op 1-1-2026; aangenomen gelijk in 2024)',
      bron: { titel: 'AWR art. 30fc lid 5', url: 'https://wetten.overheid.nl/BWBR0002320/2026-01-01#HoofdstukV_Afdeling3_Artikel30fc', datum: '2026-10-05' },
    },
  ],
  indexatie: { tcf: 1.099, toegepastDeel: 0.959, schijf1Factor: 0.75, beleidsmatigToptariefgrens: 0 },
  varianten: [],

  box1: {
    status: 'definitief',
    bron: BD_2024,
    toelichting: 'Formeel twee schijven (36,97% t/m 75.518); de knik op 38.098 is de premiegrens.',
    waarde: {
      schijven: [
        { tot: 38098, tarief: 0.3697, belastingDeel: 0.0932 },
        { tot: 75518, tarief: 0.3697, belastingDeel: 0.3697 },
        { tot: null, tarief: 0.495, belastingDeel: 0.495 },
      ],
      premies: { aow: 0.179, anw: 0.001, wlz: 0.0965 },
      schijf1TotGeborenVoor1946: 40021,
      aftrekTariefMax: 0.3697,
      tariefmaatregelPosten: ['ondernemersaftrek', 'mkb', 'eigenWoning', 'pga'],
      verliesverrekening: { terug: 3, vooruit: 9 },
    },
  },

  heffingskortingen: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: {
      algemeen: { max: 3362, afbouwVanaf: 24812, afbouwPct: 0.0663, grondslag: 'box1', aowMax: 1735, aowAfbouwPct: 0.0342 },
      arbeid: {
        opbouw: [
          { tot: 11490, basis: 0, pct: 0.08425 },
          { tot: 24820, basis: 968, pct: 0.31433 },
          { tot: 39957, basis: 5158, pct: 0.02471 },
        ],
        max: 5532,
        afbouwVanaf: 39957,
        afbouwPct: 0.0651,
      },
      // Bijlage 2021-2024 noemt 4,364% voor het eerste traject, de bijlage 2024-2025 4,346%; 4,364% sluit aan op de knik van 501.
      arbeidAow: {
        opbouw: [
          { tot: 11490, basis: 0, pct: 0.04364 },
          { tot: 24820, basis: 501, pct: 0.16214 },
          { tot: 39957, basis: 2662, pct: 0.01275 },
        ],
        max: 2854,
        afbouwVanaf: 39957,
        afbouwPct: 0.03358,
      },
      iack: { pct: 0.1145, drempel: 6073, max: 2950, maxLeeftijdKind: 12, minMaandenHuishouden: 6, coOuderMinDagen: null, actief: true },
      ouderen: { max: 2010, grens: 44770, afbouwPct: 0.15, alleenstaand: 524 },
      jonggehandicapt: 898,
      groenBeleggen: { pct: 0.007, max: null },
      uitbetalingMinstverdienende: { geborenVoor: '1963-01-01', pct: 0 },
    },
  },

  ondernemer: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: {
      urencriterium: { uren: 1225, grotendeelsPct: 0.5, startersVrijstellingJaren: 5, zwangerschapWeken: 16, verlaagdAO: 800 },
      zelfstandigenaftrek: 3750,
      aowFactor: 0.5,
      startersaftrek: 2123,
      startersaftrekMaxKeer: 3,
      startersaftrekBinnenJaren: 5,
      startersaftrekAO: { staffel: [12000, 8000, 4000], actief: true },
      soAftrek: { basis: 15551, starters: 7781, minUren: 500 },
      meewerkaftrek: {
        staffel: [
          { vanafUren: 525, pct: 0.0125 },
          { vanafUren: 875, pct: 0.02 },
          { vanafUren: 1225, pct: 0.03 },
          { vanafUren: 1750, pct: 0.04 },
        ],
        maxVergoeding: 5000,
        actief: true,
      },
      stakingsaftrek: 3630,
      tbsVrijstellingPct: 0.12,
      mkbWinstvrijstelling: 0.1331,
      beperktAftrekbaar: { drempel: 5600, aftrekbaarDeel: 0.8 },
      kia: { minPerBedrijfsmiddel: 450, ondergrens: 2800, pct: 0.28, pctTot: 69765, vastBedrag: 19535, vastTot: 129194, afbouwPct: 0.0756, nulBoven: 387580 },
      desinvestering: { drempel: 2800, jaren: 5 },
      eia: { pct: 0.4, minPerBedrijfsmiddel: 2500, meldTermijnMaanden: 3 },
      mia: { pcts: [0.27, 0.36, 0.45], minPerBedrijfsmiddel: 2500 },
      vamil: { pct: 0.75 },
      afschrijving: { maxPctPerJaar: 0.2, goodwillPct: 0.1, directAftrekbaarTot: 450, bodemwaardeGebouwEigenGebruik: 1, willekeurigStarters: true },
      hir: { termijnJaren: 3, langlopendVanafJaren: 10 },
      kilometerTariefPrivevervoer: 0.23,
      auto: {
        bijtellingAlgemeen: 0.22,
        bijtellingNulEmissiePerToelatingsjaar: BIJTELLING_NUL_EMISSIE,
        youngtimerPct: 0.35,
        youngtimerLeeftijd: 15,
        termijnMaanden: 60,
        priveKmGrens: 500,
        youngtimerOvergang: null,
        btwPrive: { standaardPct: 0.027, verlaagdPct: 0.015, verlaagdNaJaren: 4 },
      },
      for: {
        dotatie: false,
        verplichteAfnameBij: ['staking', 'aow', 'urencriterium2jaar'],
        omzettingLijfrenteExtraRuimte: true,
        betaalTermijnMaanden: 6,
      },
      werkruimte: { zelfstandigheidsEis: true, inkomensEisMetWerkplekElders: [0.7, 0.3], inkomensEisZonderWerkplekElders: 0.3 },
      nietBenutteZelfstandigenaftrekJaren: 9,
    },
  },

  inkomensvoorziening: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: {
      lijfrente: {
        regime: 'wtp',
        pct: 0.3,
        franchise: 17545,
        inkomensgrens: 137800,
        maxJaarruimte: 36077,
        maxReserveringsruimte: 41608,
        reserveringsruimtePctGrondslag: null,
        terugkijkJaren: 10,
        factorA: { toegestaan: true, factor: 6.27 },
        maxJarenNaAOW: 5,
        saldomethodeMax: 2269,
      },
      stakingslijfrente: { hoog: 559483, midden: 279752, laag: 139885 },
      stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: 5, middenBinnenJarenVoorAow: 15, arbeidsongeschiktMinPct: 0.45, betaaltermijnMaanden: 6 },
      uitkering: {
        afkoopKleineLijfrente: 5364,
        afkoopAOMax: 50063,
        tijdelijkeOudedagslijfrenteMax: 26463,
        revisierentePct: 0.2,
        bedragIneens: { vanaf: null, pct: 0.1 },
      },
      nettolijfrente: { actief: true },
      baz: { actief: false },
    },
  },

  eigenWoning: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: {
      forfait: [
        { tot: 12500, pct: 0 },
        { tot: 25000, pct: 0.001 },
        { tot: 50000, pct: 0.002 },
        { tot: 75000, pct: 0.0025 },
        { tot: 1310000, pct: 0.0035 },
        { tot: null, pct: 0.0235, vast: 4585 },
      ],
      hillenPct: 0.8,
      hillenStap: 0.033333,
      aflossingseisVanaf: '2013-01-01',
      maxAftrekJaren: 30,
      aftrekTermijnStartUiterlijk: '2001-01-01',
      kewVrijstelling: 202000,
      wozPeildatum: 'vorigJaar',
      reserveTermijnJaren: 3,
    },
  },

  box2: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: {
      schijven: [
        { tot: 67000, tarief: 0.245 },
        { tot: null, tarief: 0.33 },
      ],
      grensPerPersoon: true,
      gebruikelijkLoonNorm: 56000,
      dividendbelasting: 0.15,
      excessiefLenen: { grens: 500000 },
      verliesverrekening: { terug: 1, vooruit: 6, oudeVerliezen: { totEnMetJaar: 2018, vooruit: 9 } },
      belastingkorting: { jarenNaEerste: 7, uiterlijkJarenNaVerlies: 9 },
    },
  },

  box3: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Overbruggingsstelsel; tegenbewijs via formulier Opgaaf werkelijk rendement (OWR).',
    waarde: {
      regime: 'forfaitair',
      tarief: 0.36,
      heffingsvrijVermogen: 57000,
      schuldendrempel: 3700,
      forfaitBank: 0.0144,
      forfaitOverig: 0.0604,
      forfaitSchulden: 0.0261,
      vrijstellingen: { groen: 71251, contant: 653, uitvaart: 8665, nettolijfrente: true },
      tegenbewijs: { beschikbaar: true, kanaal: 'owr-formulier', eigenGebruikPct: 0 },
      arbitrageMaanden: 3,
      bronbelastingMaxPct: 0.15,
      dac8Rapportage: false,
    },
  },

  zvw: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: { pctOndernemer: 0.0532, pctWerkgever: 0.0657, maxBijdrageInkomen: 71628 },
  },

  pga: {
    status: 'definitief',
    bron: MINFIN_2024,
    veldBron: { zorgkosten: MINFIN_2025 },
    waarde: {
      giften: { drempelPct: 0.01, drempelMin: 60, maxPct: 0.1, periodiekMax: 250000, cultureelMultiplier: 1.25, cultureelMaxExtra: 1250, naturaGrens: 10000 },
      // vastHoog = 1,65% × 50.034; verhoging tot de eerste-schijfgrens voor geboren vóór 1946 (art. 6.19 jo. 2.10a).
      zorgkosten: {
        actief: true,
        drempelMinPP: 163,
        drempelMinTotInkomen: 9420,
        pctLaag: 0.0165,
        grensHoog: 50034,
        vastHoog: 826,
        pctHoog: 0.0575,
        verhogingPct: 0.4,
        verhogingPctAow: 1.13,
        verhogingTotInkomen: 40021,
      },
      scholing: { actief: false, drempel: 250, max: 15000 },
      alimentatie: true,
    },
  },

  loon: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: {
      reisaftrek: {
        tabel: [
          { vanafKm: 10, bedrag: 558 },
          { vanafKm: 15, bedrag: 741 },
          { vanafKm: 20, bedrag: 1233 },
          { vanafKm: 30, bedrag: 1529 },
          { vanafKm: 40, bedrag: 1992 },
          { vanafKm: 50, bedrag: 2217 },
          { vanafKm: 60, bedrag: 2458 },
          { vanafKm: 70, bedrag: 2543 },
          { vanafKm: 80, bedrag: 2578 },
        ],
        kmBedrag: 0.28,
        max: 2578,
      },
    },
  },

  toeslagen: {
    status: 'definitief',
    bron: TOESLAGEN_2024,
    veldBron: { kot: KOT_2024, zorgtoeslag: ZORGTOESLAG_2024 },
    waarde: {
      vermogensgrens: { alleen: 140213, metPartner: 177301 },
      kot: {
        regime: 'toeslag',
        maxUurprijs: { dagopvang: 10.25, bso: 9.12, gastouder: 7.53 },
        maxUrenPerMaand: 230,
        tabel: kotTabel.rijen,
        terugwerkendeMaanden: 3,
      },
      kgb: {
        maxPerKind: { tot12: 2436, van12: 694, van16: 924 },
        aloKop: 3480,
        afbouw: [{ vanafAlleen: 26819, vanafPaar: 35849, pct: 0.0675 }],
      },
      kinderbijslag: kinderbijslag['2024'],
      zorgtoeslag: {
        standaardpremie: 1987,
        drempelinkomen: 26819,
        afbouwPct: 0.1367,
        maxAlleen: 1483,
        maxPaar: 2833,
        grensAlleen: 37496,
        grensPaar: 47368,
      },
    },
  },

  arbeidsrelatie: {
    status: 'definitief',
    waarde: {
      handhaving: { regime: 'moratorium', verzuimboetes: false, vergrijpboetes: false },
      rechtsvermoedenUurtarief: { actiefVanaf: null, drempel: 0 },
      modelovereenkomstenGeldigTot: '2029-12-31',
      zelfstandigenwet: { actief: false },
      concentratieWaarschuwingPct: 0.7,
    },
  },

  schenken: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: { kindJaarlijks: 6633, kindEenmalig: 31813, kindStudie: 66268, overig: 2658 },
  },

  overig: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: {
      belastingrenteIB: 0.075,
      belastingrenteVpb: 0.075,
      aanslaggrens: 56,
      teruggaafgrens: 18,
      aanslagRendementsgrondslag: 36952,
      belastingrenteRegels: {
        vanafMaandDag: '07-01',
        geenRenteAangifteVoor: '05-01',
        conformAangifteMaxWeken: 19,
        conformVerzoekMaxWeken: 14,
        vergoedingNaWekenAangifte: 13,
        vergoedingNaWekenVerzoek: 8,
        dagenPerJaar: 360,
        navorderingVerzoekMaxWeken: 12,
      },
      invordering: { invorderbaarWeken: 6, navorderingInvorderbaarMaanden: 1, termijnenVoorJaar: 12 },
      middeling: { mogelijk: true, laatsteTijdvak: [2022, 2023, 2024], drempel: 545, termijnMaanden: 36 },
      vpb: { grens: 200000, laag: 0.19, hoog: 0.258 },
      innovatiebox: { tarief: 0.09, forfaitPct: 0.25, forfaitMax: 25000 },
      pseudoEindheffingFossieleAuto: 0,
      aowLeeftijd: { jaren: 67, maanden: 0 },
    },
  },
}

export default params2024
