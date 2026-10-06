import type { Bron, TaxYearParams } from '../types'
import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'
import kinderbijslag from './data/kinderbijslag.json'
import kotTabel from './data/kot-tabel-2025.json'

/**
 * Belastingjaar 2025 (afgesloten). Eerste jaar met de afbouw van de algemene heffingskorting
 * op het verzamelinkomen, box 2 met 31% als hoog tarief en tegenbewijs in box 3 via de
 * aangifte zelf. Box 3-forfaits bank en schulden zijn sinds 20 februari 2026 definitief.
 */

const MINFIN_2025: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2025, bijlage 1 Fiscale parameters 2024-2025',
  url: 'https://open.overheid.nl/documenten/dcbb490f-d406-4842-ac33-b5c397e19df0/file',
  datum: '2024-12-18',
}
const MINFIN_2026: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2026, bijlage 1 Fiscale parameters 2025-2026',
  url: 'https://open.overheid.nl/documenten/c3d48c04-1009-4ffe-a54b-cebf13427ab5/file',
  datum: '2025-12-16',
}
const BOX3_DEFINITIEF: Bron = {
  titel: 'Regeling definitieve forfaitaire rendementspercentages box 3 2025 (Stcrt. 2026, 3708)',
  url: 'https://www.fiscount.nl/publicaties/fiscaal/definitieve-forfaitaire-rendementspercentages-box-3-in-2025-vastgesteld/',
  datum: '2026-02-20',
}
const BD_ZVW: Bron = {
  titel: 'Belastingdienst, percentages inkomensafhankelijke bijdrage Zvw',
  url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/werk_en_inkomen/zorgverzekeringswet/veranderingen-bijdrage-zvw/percentages-zvw',
  datum: '2025-01-01',
}
const TOESLAGEN_2025: Bron = {
  titel: 'Toeslagenkaart 2025, rekenhulpen kindgebonden budget en zorgtoeslag 2025 (Dienst Toeslagen)',
  url: 'https://download.belastingdienst.nl/toeslagen/docs/toeslagenkaart_2025_tg7101z51pl.pdf',
  datum: '2025-01-01',
}
const KOT_2025: Bron = {
  titel: 'Besluit van 23 september 2024 tot wijziging van het Besluit kinderopvangtoeslag (Stb. 2024, 273)',
  url: 'https://zoek.officielebekendmakingen.nl/stb-2024-273.html',
  datum: '2024-09-23',
}
const ZORGTOESLAG_2025: Bron = {
  titel: 'Dienst Toeslagen, berekening zorgtoeslag 2025',
  url: 'https://download.belastingdienst.nl/toeslagen/docs/berekening_zorgtoeslag_tg0821z51fd.pdf',
  datum: '2025-01-01',
}
const KINDERBIJSLAG: Bron = {
  titel: 'Kinderbijslagbedragen 2025 (Stcrt. 2024, 42409 en Stcrt. 2025, 21953)',
  url: 'https://www.svb.nl/nl/kinderbijslag/bedragen-betaaldagen/bedragen-kinderbijslag',
  datum: '2025-06-15',
}

const params2025: TaxYearParams = {
  jaar: 2025,
  status: 'definitief',
  bijgewerkt: '2026-10-05',
  changelog: [
    { datum: '2024-12-17', wat: 'Eerste Kamer akkoord met pakket Belastingplan 2025', bron: MINFIN_2025 },
    { datum: '2025-01-01', wat: 'Voorlopige aanslag rekent box 3 met bank 1,44% en schulden 2,62%' },
    { datum: '2026-01-16', wat: 'Belastingrente Vpb met terugwerkende kracht gelijk aan IB (HR 16-1-2026): 6,5%' },
    { datum: '2026-02-20', wat: 'Box 3 forfaits 2025 definitief: bank 1,37%, overig 5,88%, schulden 2,70%', bron: BOX3_DEFINITIEF },
    {
      datum: '2026-10-04',
      wat: 'Jaarmodule aangemaakt uit de MinFin-bijlagen 2024-2025 en 2025-2026; KOT gastouder 8,10 (Stb. 2024, 273), KGB-afbouw 7,10%, kinderbijslag 2025 volgens Staatscourant',
      bron: MINFIN_2026,
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
      wat: 'Ronde 2 (contract): nieuwe velden hir.langlopendVanafJaren, arbeidsbeloningPartnerMin, tbsVrijstellingPct, auto.youngtimerOvergang, auto.btwPrive, stakingslijfrenteRegels, eigenWoning.reserveTermijnJaren, box2.verliesverrekening, box2.belastingkorting, overig.aanslagRendementsgrondslag (37395), overig.belastingrenteRegels en overig.invordering',
      bron: { titel: 'Wet IB 2001 art. 3.16 lid 4, 3.54, 3.99b, 3.119aa, 3.129, 4.49, 4.53 en 9.4; AWR art. 30f-30fe; Invorderingswet 1990 art. 9; Belastingdienst, btw en privégebruik auto van de zaak', url: 'https://wetten.overheid.nl/BWBR0011353/2025-01-01', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'arbeidsbeloningPartnerMin weer weggehaald: de drempel van art. 3.16 lid 4 staat alleen in ondernemer.meewerkaftrek.maxVergoeding (één veld voor dezelfde drempel); auto.youngtimerOvergang krijgt de vorm { terBeschikkingUiterlijk, youngtimerOp, oudeLeeftijd }: het overgangsrecht geldt alleen voor een auto die op 31-12-2025 al youngtimer was',
      bron: { titel: 'Toets ronde 2 (fiscaal): besluit 12-2-2026 nr. 2026-2493 (Stcrt. 20-2-2026); Wet IB 2001 art. 3.16 lid 4, 9.4 en 10.1; SRA, belastingrente 2026; ECB-persbericht 10-9-2026', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (na de nacontrole): overig.belastingrenteRegels.navorderingVerzoekMaxWeken 12 toegevoegd: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt de belastingrente uiterlijk 12 weken na ontvangst van het verzoek (nagekeken in de tekst geldend op 1-1-2026; aangenomen gelijk in 2025)',
      bron: { titel: 'AWR art. 30fc lid 5', url: 'https://wetten.overheid.nl/BWBR0002320/2026-01-01#HoofdstukV_Afdeling3_Artikel30fc', datum: '2026-10-05' },
    },
  ],
  indexatie: { tcf: 1.012, toegepastDeel: 1, schijf1Factor: 0.75, beleidsmatigToptariefgrens: 393 },
  varianten: [],

  box1: {
    status: 'definitief',
    bron: MINFIN_2025,
    waarde: {
      schijven: [
        { tot: 38441, tarief: 0.3582, belastingDeel: 0.0817 },
        { tot: 76817, tarief: 0.3748, belastingDeel: 0.3748 },
        { tot: null, tarief: 0.495, belastingDeel: 0.495 },
      ],
      premies: { aow: 0.179, anw: 0.001, wlz: 0.0965 },
      schijf1TotGeborenVoor1946: 40502,
      aftrekTariefMax: 0.3748,
      tariefmaatregelPosten: ['ondernemersaftrek', 'mkb', 'eigenWoning', 'pga'],
      verliesverrekening: { terug: 3, vooruit: 9 },
    },
  },

  heffingskortingen: {
    status: 'definitief',
    bron: MINFIN_2025,
    toelichting: 'Vanaf 2025 bouwt de algemene heffingskorting af op het verzamelinkomen. IACK zonder geboortedatumgrens (amendement Grinwis c.s.).',
    waarde: {
      algemeen: { max: 3068, afbouwVanaf: 28406, afbouwPct: 0.06337, grondslag: 'verzamelinkomen', aowMax: 1536, aowAfbouwPct: 0.0317 },
      arbeid: {
        opbouw: [
          { tot: 12169, basis: 0, pct: 0.08053 },
          { tot: 26288, basis: 980, pct: 0.3003 },
          { tot: 43071, basis: 5220, pct: 0.02258 },
        ],
        max: 5599,
        afbouwVanaf: 43071,
        afbouwPct: 0.0651,
      },
      arbeidAow: {
        opbouw: [
          { tot: 12169, basis: 0, pct: 0.04029 },
          { tot: 26288, basis: 491, pct: 0.15023 },
          { tot: 43071, basis: 2612, pct: 0.0113 },
        ],
        max: 2802,
        afbouwVanaf: 43071,
        afbouwPct: 0.03257,
      },
      iack: { pct: 0.1145, drempel: 6145, max: 2986, maxLeeftijdKind: 12, minMaandenHuishouden: 6, coOuderMinDagen: 156, actief: true },
      ouderen: { max: 2035, grens: 45308, afbouwPct: 0.15, alleenstaand: 531 },
      jonggehandicapt: 909,
      groenBeleggen: { pct: 0.001, max: null },
      uitbetalingMinstverdienende: { geborenVoor: '1963-01-01', pct: 0 },
    },
  },

  ondernemer: {
    status: 'definitief',
    bron: MINFIN_2025,
    waarde: {
      urencriterium: { uren: 1225, grotendeelsPct: 0.5, startersVrijstellingJaren: 5, zwangerschapWeken: 16, verlaagdAO: 800 },
      zelfstandigenaftrek: 2470,
      aowFactor: 0.5,
      startersaftrek: 2123,
      startersaftrekMaxKeer: 3,
      startersaftrekBinnenJaren: 5,
      startersaftrekAO: { staffel: [12000, 8000, 4000], actief: true },
      soAftrek: { basis: 15738, starters: 7875, minUren: 500 },
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
      kia: { minPerBedrijfsmiddel: 450, ondergrens: 2900, pct: 0.28, pctTot: 70602, vastBedrag: 19769, vastTot: 130744, afbouwPct: 0.0756, nulBoven: 392230 },
      desinvestering: { drempel: 2900, jaren: 5 },
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
    bron: MINFIN_2025,
    toelichting: 'Afkoopgrens bij arbeidsongeschiktheid volgens art. 3.133 Wet IB 2001 (tekst 2025).',
    waarde: {
      lijfrente: {
        regime: 'wtp',
        pct: 0.3,
        franchise: 18475,
        inkomensgrens: 137800,
        maxJaarruimte: 35798,
        maxReserveringsruimte: 42108,
        reserveringsruimtePctGrondslag: null,
        terugkijkJaren: 10,
        factorA: { toegestaan: true, factor: 6.27 },
        maxJarenNaAOW: 5,
        saldomethodeMax: 2269,
      },
      stakingslijfrente: { hoog: 566197, midden: 283110, laag: 141564 },
      stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: 5, middenBinnenJarenVoorAow: 15, arbeidsongeschiktMinPct: 0.45, betaaltermijnMaanden: 6 },
      uitkering: {
        afkoopKleineLijfrente: 5429,
        afkoopAOMax: 50664,
        tijdelijkeOudedagslijfrenteMax: 26781,
        revisierentePct: 0.2,
        bedragIneens: { vanaf: null, pct: 0.1 },
      },
      nettolijfrente: { actief: true },
      baz: { actief: false },
    },
  },

  eigenWoning: {
    status: 'definitief',
    bron: MINFIN_2025,
    waarde: {
      forfait: [
        { tot: 12500, pct: 0 },
        { tot: 25000, pct: 0.001 },
        { tot: 50000, pct: 0.002 },
        { tot: 75000, pct: 0.0025 },
        { tot: 1330000, pct: 0.0035 },
        { tot: null, pct: 0.0235, vast: 4655 },
      ],
      hillenPct: 0.766667,
      hillenStap: 0.033333,
      aflossingseisVanaf: '2013-01-01',
      maxAftrekJaren: 30,
      aftrekTermijnStartUiterlijk: '2001-01-01',
      kewVrijstelling: 204000,
      wozPeildatum: 'vorigJaar',
      reserveTermijnJaren: 3,
    },
  },

  box2: {
    status: 'definitief',
    bron: MINFIN_2025,
    waarde: {
      schijven: [
        { tot: 67804, tarief: 0.245 },
        { tot: null, tarief: 0.31 },
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
    bron: MINFIN_2025,
    veldBron: { forfaitBank: BOX3_DEFINITIEF, forfaitSchulden: BOX3_DEFINITIEF, forfaitOverig: BOX3_DEFINITIEF },
    toelichting: 'Overbruggingsstelsel; vanaf belastingjaar 2025 tegenbewijs in de aangifte zelf. Forfaits bank en schulden definitief vastgesteld op 20 februari 2026 (voorlopig was 1,44% en 2,62%).',
    waarde: {
      regime: 'forfaitair',
      tarief: 0.36,
      heffingsvrijVermogen: 57684,
      schuldendrempel: 3800,
      forfaitBank: 0.0137,
      forfaitOverig: 0.0588,
      forfaitSchulden: 0.027,
      vrijstellingen: { groen: 26312, contant: 661, uitvaart: 8769, nettolijfrente: true },
      tegenbewijs: { beschikbaar: true, kanaal: 'aangifte', eigenGebruikPct: 0 },
      arbitrageMaanden: 3,
      bronbelastingMaxPct: 0.15,
      dac8Rapportage: false,
    },
  },

  zvw: {
    status: 'definitief',
    bron: BD_ZVW,
    waarde: { pctOndernemer: 0.0526, pctWerkgever: 0.0651, maxBijdrageInkomen: 75864 },
  },

  pga: {
    status: 'definitief',
    bron: MINFIN_2025,
    waarde: {
      giften: { drempelPct: 0.01, drempelMin: 60, maxPct: 0.1, periodiekMax: 1500000, cultureelMultiplier: 1.25, cultureelMaxExtra: 1250, naturaGrens: 10000 },
      // vastHoog = 1,65% × 50.635; verhoging tot de eerste-schijfgrens voor geboren vóór 1946.
      zorgkosten: {
        actief: true,
        drempelMinPP: 164,
        drempelMinTotInkomen: 9534,
        pctLaag: 0.0165,
        grensHoog: 50635,
        vastHoog: 835,
        pctHoog: 0.0575,
        verhogingPct: 0.4,
        verhogingPctAow: 1.13,
        verhogingTotInkomen: 40502,
      },
      scholing: { actief: false, drempel: 250, max: 15000 },
      alimentatie: true,
    },
  },

  loon: {
    status: 'definitief',
    bron: MINFIN_2025,
    waarde: {
      reisaftrek: {
        tabel: [
          { vanafKm: 10, bedrag: 565 },
          { vanafKm: 15, bedrag: 750 },
          { vanafKm: 20, bedrag: 1248 },
          { vanafKm: 30, bedrag: 1548 },
          { vanafKm: 40, bedrag: 2016 },
          { vanafKm: 50, bedrag: 2244 },
          { vanafKm: 60, bedrag: 2488 },
          { vanafKm: 70, bedrag: 2574 },
          { vanafKm: 80, bedrag: 2609 },
        ],
        kmBedrag: 0.29,
        max: 2609,
      },
    },
  },

  toeslagen: {
    status: 'definitief',
    bron: TOESLAGEN_2025,
    veldBron: { kot: KOT_2025, zorgtoeslag: ZORGTOESLAG_2025, kinderbijslag: KINDERBIJSLAG },
    waarde: {
      vermogensgrens: { alleen: 141896, metPartner: 179429 },
      kot: {
        regime: 'toeslag',
        maxUurprijs: { dagopvang: 10.71, bso: 9.52, gastouder: 8.1 },
        maxUrenPerMaand: 230,
        tabel: kotTabel.rijen,
        terugwerkendeMaanden: 3,
      },
      kgb: {
        maxPerKind: { tot12: 2511, van12: 703, van16: 936 },
        aloKop: 3389,
        afbouw: [{ vanafAlleen: 28406, vanafPaar: 37545, pct: 0.071 }],
      },
      kinderbijslag: kinderbijslag['2025'],
      // Normpremie 1,896% (alleen) en 4,273% (paar) van het drempelinkomen plus 13,70% daarboven.
      zorgtoeslag: {
        standaardpremie: 2112,
        drempelinkomen: 28406,
        afbouwPct: 0.137,
        maxAlleen: 1573,
        maxPaar: 3010,
        grensAlleen: 39719,
        grensPaar: 50206,
      },
    },
  },

  arbeidsrelatie: {
    status: 'definitief',
    toelichting: 'Handhavingsmoratorium Wet DBA opgeheven per 1-1-2025; in 2025 geen boetes (zachte landing).',
    waarde: {
      handhaving: { regime: 'overgang', verzuimboetes: false, vergrijpboetes: false },
      rechtsvermoedenUurtarief: { actiefVanaf: null, drempel: 0 },
      modelovereenkomstenGeldigTot: '2029-12-31',
      zelfstandigenwet: { actief: false },
      concentratieWaarschuwingPct: 0.7,
    },
  },

  schenken: {
    status: 'definitief',
    bron: MINFIN_2025,
    waarde: { kindJaarlijks: 6713, kindEenmalig: 32195, kindStudie: 67064, overig: 2690 },
  },

  overig: {
    status: 'definitief',
    bron: MINFIN_2025,
    toelichting: 'Belastingrente Vpb sinds HR 16-1-2026 gelijk aan IB.',
    waarde: {
      belastingrenteIB: 0.065,
      belastingrenteVpb: 0.065,
      aanslaggrens: 57,
      teruggaafgrens: 18,
      aanslagRendementsgrondslag: 37395,
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

export default params2025
