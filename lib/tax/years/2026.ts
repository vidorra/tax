import type { Bron, TaxYearParams } from '../types'
import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'
import kinderbijslag from './data/kinderbijslag.json'
import kotTabel from './data/kot-tabel-2026.json'

const MINFIN: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2026, bijlage 1 Fiscale parameters 2025-2026',
  url: 'https://open.overheid.nl/documenten/c3d48c04-1009-4ffe-a54b-cebf13427ab5/file',
  datum: '2025-12-16',
}
const BD_VA: Bron = {
  titel: 'Belastingdienst, tarieven en heffingskortingen voorlopige aanslag 2026',
  url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen',
  datum: '2026-01-15',
}
const BD_ZVW: Bron = {
  titel: 'Belastingdienst, percentages inkomensafhankelijke bijdrage Zvw',
  url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/werk_en_inkomen/zorgverzekeringswet/veranderingen-bijdrage-zvw/percentages-zvw',
  datum: '2026-01-01',
}
const TOESLAGEN: Bron = {
  titel: 'Toeslagenkaart 2026 en Besluit kinderopvangtoeslag 2026 (Stb. 2025, 233)',
  url: 'https://www.rijksoverheid.nl/onderwerpen/kinderopvangtoeslag/bedragen-kinderopvangtoeslag-2026',
  datum: '2025-10-15',
}
const BESLUIT_YOUNGTIMER: Bron = {
  titel: 'Besluit van 12 februari 2026, nr. 2026-2493, introduceren overgangstermijn versoberen youngtimerregeling (Stcrt. 2026, 6596)',
  url: 'https://zoek.officielebekendmakingen.nl/stcrt-2026-6596.html',
  datum: '2026-02-20',
}
const AMENDEMENT_IACK: Bron = {
  titel: 'Gewijzigd amendement Grinwis c.s. (Kamerstuk 36418 nr. 61): geen geboortedatumgrens, afbouw 2027-2034',
  url: 'https://zoek.officielebekendmakingen.nl/kst-36418-61.html',
  datum: '2023-10-24',
}

const params2026: TaxYearParams = {
  jaar: 2026,
  status: 'voorlopig', // box 3 bank- en schuldforfait zijn voorlopig tot februari 2027
  bijgewerkt: '2026-10-05',
  changelog: [
    { datum: '2025-09-16', wat: 'Prinsjesdag: voorstel Belastingplan 2026 (box 3 toen 7,78% en heffingsvrij vermogen 51.396)' },
    { datum: '2025-11-13', wat: 'Amendementen: box 3 forfait overig 6,00% en heffingsvrij vermogen 59.357; Hillen-afbouw 4,8 punt per jaar' },
    { datum: '2025-12-16', wat: 'Eerste Kamer akkoord met pakket Belastingplan 2026; status definitief', bron: MINFIN },
    { datum: '2026-01-15', wat: 'Box 3 forfaits bank 1,28% en schulden 2,70% (voorlopig; definitief februari 2027)', bron: BD_VA },
    { datum: '2026-06-25', wat: 'Kilometertarief privévervoer 0,25 met terugwerkende kracht tot 1-1-2026 (beleidsbesluit)' },
    { datum: '2026-10-04', wat: 'Parameters geverifieerd tegen MinFin-bijlage en Belastingdienst (402 controles)' },
    { datum: '2026-10-04', wat: 'Volledige kinderopvangtoeslagtabel 2026 (69 rijen) uit Stb. 2025, 233 in plaats van ankerrijen', bron: TOESLAGEN },
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
      wat: 'Ronde 2 (contract): nieuwe velden hir.langlopendVanafJaren, arbeidsbeloningPartnerMin, tbsVrijstellingPct, auto.youngtimerOvergang, auto.btwPrive, stakingslijfrenteRegels, eigenWoning.reserveTermijnJaren, box2.verliesverrekening, box2.belastingkorting, overig.aanslagRendementsgrondslag (38479), overig.belastingrenteRegels en overig.invordering',
      bron: { titel: 'Wet IB 2001 art. 3.16 lid 4, 3.54, 3.99b, 3.119aa, 3.129, 4.49, 4.53 en 9.4; AWR art. 30f-30fe; Invorderingswet 1990 art. 9; Belastingdienst, btw en privégebruik auto van de zaak', url: 'https://wetten.overheid.nl/BWBR0011353/2026-01-01', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'arbeidsbeloningPartnerMin weer weggehaald: de drempel van art. 3.16 lid 4 staat alleen in ondernemer.meewerkaftrek.maxVergoeding (één veld voor dezelfde drempel); auto.youngtimerOvergang krijgt de vorm { terBeschikkingUiterlijk, youngtimerOp, oudeLeeftijd }: het overgangsrecht geldt alleen voor een auto die op 31-12-2025 al youngtimer was',
      bron: { titel: 'Toets ronde 2 (fiscaal): besluit 12-2-2026 nr. 2026-2493 (Stcrt. 20-2-2026); Wet IB 2001 art. 3.16 lid 4, 9.4 en 10.1; SRA, belastingrente 2026; ECB-persbericht 10-9-2026', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (na de nacontrole): overig.belastingrenteRegels.navorderingVerzoekMaxWeken 12 toegevoegd: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt de belastingrente uiterlijk 12 weken na ontvangst van het verzoek',
      bron: { titel: 'AWR art. 30fc lid 5', url: 'https://wetten.overheid.nl/BWBR0002320/2026-01-01#HoofdstukV_Afdeling3_Artikel30fc', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: "Ronde 2 (A6): ondernemer.auto.youngtimerLeeftijd 15 wordt 16 (Belastingplan 2026: de leeftijdsgrens van de youngtimerregeling gaat per 1-1-2026 van 15 naar 16 jaar) en youngtimerOvergang { terBeschikkingUiterlijk: '2025-12-31', youngtimerOp: '2025-12-31', oudeLeeftijd: 15 }: art. 3.20 lid 1 zoals dat luidde op 31-12-2025 mag in 2026 worden toegepast als de auto in de loop van 2025 meer dan 15 maar minder dan 16 jaar geleden voor het eerst in gebruik is genomen en uiterlijk 31-12-2025 ter beschikking staat (goedkeuring, dus een keuze). Tekst van het besluit gezien bij de primaire bron (Staatscourant): veldStatus auto definitief",
      bron: BESLUIT_YOUNGTIMER,
    },
  ],
  indexatie: { tcf: 1.029, toegepastDeel: 0.528, schijf1Factor: 0.75, beleidsmatigToptariefgrens: 432 },
  varianten: [],

  box1: {
    status: 'definitief',
    bron: MINFIN,
    waarde: {
      schijven: [
        { tot: 38883, tarief: 0.3575, belastingDeel: 0.081 },
        { tot: 78426, tarief: 0.3756, belastingDeel: 0.3756 },
        { tot: null, tarief: 0.495, belastingDeel: 0.495 },
      ],
      premies: { aow: 0.179, anw: 0.001, wlz: 0.0965 },
      schijf1TotGeborenVoor1946: 41123,
      aftrekTariefMax: 0.3756,
      tariefmaatregelPosten: ['ondernemersaftrek', 'mkb', 'eigenWoning', 'pga'],
      verliesverrekening: { terug: 3, vooruit: 9 },
    },
  },

  heffingskortingen: {
    status: 'definitief',
    bron: MINFIN,
    veldBron: { iack: AMENDEMENT_IACK },
    waarde: {
      algemeen: { max: 3115, afbouwVanaf: 29736, afbouwPct: 0.06398, grondslag: 'verzamelinkomen', aowMax: 1556, aowAfbouwPct: 0.03195 },
      arbeid: {
        opbouw: [
          { tot: 11965, basis: 0, pct: 0.08324 },
          { tot: 25845, basis: 996, pct: 0.31009 },
          { tot: 45592, basis: 5300, pct: 0.0195 },
        ],
        max: 5685,
        afbouwVanaf: 45592,
        afbouwPct: 0.0651,
      },
      arbeidAow: {
        opbouw: [
          { tot: 11965, basis: 0, pct: 0.04156 },
          { tot: 25845, basis: 498, pct: 0.15483 },
          { tot: 45592, basis: 2647, pct: 0.00974 },
        ],
        max: 2840,
        afbouwVanaf: 45592,
        afbouwPct: 0.0325,
      },
      iack: { pct: 0.1145, drempel: 6239, max: 3032, maxLeeftijdKind: 12, minMaandenHuishouden: 6, coOuderMinDagen: 156, actief: true },
      ouderen: { max: 2067, grens: 46002, afbouwPct: 0.15, alleenstaand: 540 },
      jonggehandicapt: 923,
      groenBeleggen: { pct: 0.001, max: null },
      uitbetalingMinstverdienende: { geborenVoor: '1963-01-01', pct: 0 },
    },
  },

  ondernemer: {
    status: 'definitief',
    bron: MINFIN,
    veldStatus: { auto: 'definitief' },
    veldBron: { auto: BESLUIT_YOUNGTIMER },
    waarde: {
      urencriterium: { uren: 1225, grotendeelsPct: 0.5, startersVrijstellingJaren: 5, zwangerschapWeken: 16, verlaagdAO: 800 },
      zelfstandigenaftrek: 1200,
      aowFactor: 0.5,
      startersaftrek: 2123,
      startersaftrekMaxKeer: 3,
      startersaftrekBinnenJaren: 5,
      startersaftrekAO: { staffel: [12000, 8000, 4000], actief: true },
      soAftrek: { basis: 15979, starters: 7996, minUren: 500 },
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
      mkbWinstvrijstelling: 0.127,
      beperktAftrekbaar: { drempel: 5700, aftrekbaarDeel: 0.8 },
      kia: { minPerBedrijfsmiddel: 450, ondergrens: 2900, pct: 0.28, pctTot: 71683, vastBedrag: 20072, vastTot: 132746, afbouwPct: 0.0756, nulBoven: 398236 },
      desinvestering: { drempel: 2900, jaren: 5 },
      eia: { pct: 0.4, minPerBedrijfsmiddel: 2500, meldTermijnMaanden: 3 },
      mia: { pcts: [0.27, 0.36, 0.45], minPerBedrijfsmiddel: 2500 },
      vamil: { pct: 0.75 },
      afschrijving: { maxPctPerJaar: 0.2, goodwillPct: 0.1, directAftrekbaarTot: 450, bodemwaardeGebouwEigenGebruik: 1, willekeurigStarters: true },
      hir: { termijnJaren: 3, langlopendVanafJaren: 10 },
      kilometerTariefPrivevervoer: 0.25,
      auto: {
        bijtellingAlgemeen: 0.22,
        bijtellingNulEmissiePerToelatingsjaar: BIJTELLING_NUL_EMISSIE,
        youngtimerPct: 0.35,
        youngtimerLeeftijd: 16,
        termijnMaanden: 60,
        priveKmGrens: 500,
        youngtimerOvergang: { terBeschikkingUiterlijk: '2025-12-31', youngtimerOp: '2025-12-31', oudeLeeftijd: 15 },
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
    bron: MINFIN,
    waarde: {
      lijfrente: {
        regime: 'wtp',
        pct: 0.3,
        franchise: 19172,
        inkomensgrens: 137800,
        maxJaarruimte: 35589,
        maxReserveringsruimte: 42753,
        reserveringsruimtePctGrondslag: null,
        terugkijkJaren: 10,
        factorA: { toegestaan: true, factor: 6.27 },
        maxJarenNaAOW: 5,
        saldomethodeMax: 2269,
      },
      stakingslijfrente: { hoog: 574867, midden: 287445, laag: 143732 },
      stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: 5, middenBinnenJarenVoorAow: 15, arbeidsongeschiktMinPct: 0.45, betaaltermijnMaanden: 6 },
      uitkering: {
        afkoopKleineLijfrente: 5513,
        afkoopAOMax: 51440,
        tijdelijkeOudedagslijfrenteMax: 27192,
        revisierentePct: 0.2,
        bedragIneens: { vanaf: '2029-01-01', pct: 0.1 },
      },
      nettolijfrente: { actief: true },
      baz: { actief: false },
    },
  },

  eigenWoning: {
    status: 'definitief',
    bron: MINFIN,
    waarde: {
      forfait: [
        { tot: 12500, pct: 0 },
        { tot: 25000, pct: 0.001 },
        { tot: 50000, pct: 0.002 },
        { tot: 75000, pct: 0.0025 },
        { tot: 1350000, pct: 0.0035 },
        { tot: null, pct: 0.0235, vast: 4725 },
      ],
      hillenPct: 0.71867,
      hillenStap: 0.048,
      aflossingseisVanaf: '2013-01-01',
      maxAftrekJaren: 30,
      aftrekTermijnStartUiterlijk: '2001-01-01',
      kewVrijstelling: 207500,
      wozPeildatum: 'vorigJaar',
      reserveTermijnJaren: 3,
    },
  },

  box2: {
    status: 'definitief',
    bron: MINFIN,
    waarde: {
      schijven: [
        { tot: 68843, tarief: 0.245 },
        { tot: null, tarief: 0.31 },
      ],
      grensPerPersoon: true,
      gebruikelijkLoonNorm: 58000,
      dividendbelasting: 0.15,
      excessiefLenen: { grens: 500000 },
      verliesverrekening: { terug: 1, vooruit: 6, oudeVerliezen: { totEnMetJaar: 2018, vooruit: 9 } },
      belastingkorting: { jarenNaEerste: 7, uiterlijkJarenNaVerlies: 9 },
    },
  },

  box3: {
    status: 'definitief',
    bron: MINFIN,
    veldStatus: { forfaitBank: 'voorlopig', forfaitSchulden: 'voorlopig' },
    veldBron: { forfaitBank: BD_VA, forfaitSchulden: BD_VA },
    toelichting: 'Overbruggingsstelsel; tegenbewijs via de aangifte (Wet tegenbewijsregeling box 3, Stb. 2025, 195).',
    waarde: {
      regime: 'forfaitair',
      tarief: 0.36,
      heffingsvrijVermogen: 59357,
      schuldendrempel: 3800,
      forfaitBank: 0.0128,
      forfaitOverig: 0.06,
      forfaitSchulden: 0.027,
      vrijstellingen: { groen: 26715, contant: 672, uitvaart: 8904, nettolijfrente: true },
      tegenbewijs: { beschikbaar: true, kanaal: 'aangifte', eigenGebruikPct: 0.0506 },
      arbitrageMaanden: 3,
      bronbelastingMaxPct: 0.15,
      dac8Rapportage: true,
    },
  },

  zvw: {
    status: 'definitief',
    bron: BD_ZVW,
    waarde: { pctOndernemer: 0.0485, pctWerkgever: 0.061, maxBijdrageInkomen: 79409 },
  },

  pga: {
    status: 'definitief',
    bron: MINFIN,
    waarde: {
      giften: { drempelPct: 0.01, drempelMin: 60, maxPct: 0.1, periodiekMax: 1500000, cultureelMultiplier: 1.25, cultureelMaxExtra: 1250, naturaGrens: 10000 },
      zorgkosten: {
        actief: true,
        drempelMinPP: 166,
        drempelMinTotInkomen: 9680,
        pctLaag: 0.0165,
        grensHoog: 51411,
        vastHoog: 848,
        pctHoog: 0.0575,
        verhogingPct: 0.4,
        verhogingPctAow: 1.13,
        verhogingTotInkomen: 41123,
      },
      scholing: { actief: false, drempel: 250, max: 15000 },
      alimentatie: true,
    },
  },

  loon: {
    status: 'definitief',
    bron: MINFIN,
    waarde: {
      reisaftrek: {
        tabel: [
          { vanafKm: 10, bedrag: 574 },
          { vanafKm: 15, bedrag: 762 },
          { vanafKm: 20, bedrag: 1268 },
          { vanafKm: 30, bedrag: 1572 },
          { vanafKm: 40, bedrag: 2047 },
          { vanafKm: 50, bedrag: 2279 },
          { vanafKm: 60, bedrag: 2527 },
          { vanafKm: 70, bedrag: 2614 },
          { vanafKm: 80, bedrag: 2649 },
        ],
        kmBedrag: 0.29,
        max: 2649,
      },
    },
  },

  toeslagen: {
    status: 'definitief',
    bron: TOESLAGEN,
    waarde: {
      vermogensgrens: { alleen: 146011, metPartner: 184633 },
      kot: {
        regime: 'toeslag',
        maxUurprijs: { dagopvang: 11.23, bso: 9.98, gastouder: 8.49 },
        maxUrenPerMaand: 230,
        tabel: kotTabel.rijen,
        terugwerkendeMaanden: 3,
      },
      kgb: {
        maxPerKind: { tot12: 2580, van12: 724, van16: 964 },
        aloKop: 3416,
        afbouw: [{ vanafAlleen: 29736, vanafPaar: 39141, pct: 0.076 }],
      },
      kinderbijslag: kinderbijslag['2026'],
      zorgtoeslag: {
        standaardpremie: 2119,
        drempelinkomen: 29736,
        afbouwPct: 0.1373,
        maxAlleen: 1550,
        maxPaar: 2963,
        grensAlleen: 40857,
        grensPaar: 51142,
      },
    },
  },

  arbeidsrelatie: {
    status: 'definitief',
    toelichting: 'Handhavingsplan arbeidsrelaties 2026; rechtsvermoeden art. 7:610aa BW (Stb. 2026, 158 en 207).',
    waarde: {
      handhaving: { regime: 'overgang', verzuimboetes: false, vergrijpboetes: true },
      rechtsvermoedenUurtarief: { actiefVanaf: '2026-12-31', drempel: 38 },
      modelovereenkomstenGeldigTot: '2029-12-31',
      zelfstandigenwet: { actief: false },
      concentratieWaarschuwingPct: 0.7,
    },
  },

  schenken: {
    status: 'definitief',
    bron: MINFIN,
    waarde: { kindJaarlijks: 6908, kindEenmalig: 33129, kindStudie: 69009, overig: 2769 },
  },

  overig: {
    status: 'definitief',
    bron: MINFIN,
    toelichting: 'Belastingrente Vpb sinds HR 16-1-2026 gelijk aan IB.',
    waarde: {
      belastingrenteIB: 0.05,
      belastingrenteVpb: 0.05,
      aanslaggrens: 58,
      teruggaafgrens: 18,
      aanslagRendementsgrondslag: 38479,
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

export default params2026
