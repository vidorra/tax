import type { Bron, TaxYearParams } from '../types'
import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'
import kinderbijslag from './data/kinderbijslag.json'
import kotTabel from './data/kot-tabel-2023.json'

/**
 * Belastingjaar 2023 (bevroren). Eerste jaar van het box 3-overbruggingsstelsel (forfait per
 * vermogenscategorie, tegenbewijs via het formulier OWR), van de Wtp-lijfrenteregels (30%,
 * franchise 13.646) en het eerste jaar zonder FOR-dotatie.
 *
 * Bronnen: MinFin-bijlagen Fiscale parameters 2020-2023 en 2021-2024, aanvullende parameters
 * 2023-2024 (lijfrente na de Wtp) en de wettekst per 1-1-2023.
 */

const MINFIN_2024: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2024, bijlage 1 Fiscale parameters 2021-2024',
  url: 'https://www.rijksoverheid.nl/binaries/rijksoverheid/documenten/publicaties/2023/12/20/belangrijkste-wijzigingen-belastingen-2024/20240108+-+Eindejaarsbericht+-+V1.2.pdf',
  datum: '2023-12-19',
}
const MINFIN_2023: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2023, bijlage 1 Fiscale parameters 2020-2023 en bijlage 2 Aanvullende fiscale parameters 2022-2023',
  url: 'https://www.rijksoverheid.nl/documenten/publicaties/2022/12/20/belangrijkste-wijzigingen-belastingen-2023',
  datum: '2022-12-20',
}
const WET_IB_2023: Bron = {
  titel: 'Wet inkomstenbelasting 2001, tekst geldend op 1 januari 2023',
  url: 'https://wetten.overheid.nl/BWBR0011353/2023-01-01',
  datum: '2023-01-01',
}
const KOT_2023: Bron = {
  titel: 'Besluit van 23 september 2022 tot wijziging van het Besluit kinderopvangtoeslag (Stb. 2022, 386); maximum uurprijzen extra verhoogd per 1-1-2023',
  url: 'https://zoek.officielebekendmakingen.nl/stb-2022-386.html',
  datum: '2022-09-23',
}
const TOESLAGEN_2023: Bron = {
  titel: 'Dienst Toeslagen, berekening kindgebonden budget 2023 en berekening zorgtoeslag 2023',
  url: 'https://download.belastingdienst.nl/toeslagen/docs/berekening_kindgebonden_budget_tg0811z32fd.pdf',
  datum: '2023-01-01',
}
const KINDERBIJSLAG_2023: Bron = {
  titel: 'Kinderbijslagbedragen 2023 (Stcrt. 2022, 32251 en Stcrt. 2023, 17197)',
  url: 'https://zoek.officielebekendmakingen.nl/stcrt-2023-17197.html',
  datum: '2023-06-14',
}
const ZVW_2023: Bron = {
  titel: 'Inkomensafhankelijke bijdrage Zvw 2023 (5,43% en 6,68%, maximum 66.956)',
  url: 'https://www.salarisvanmorgen.nl/2022/11/14/maximum-bijdrageloon-en-inkomensafhankelijke-bijdrage-zvw-in-2023/',
  datum: '2022-11-14',
}
const MINFIN_2024_AANVULLEND: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2024, bijlage 2 Aanvullende fiscale parameters 2023-2024 (bedragen 2023 na de Wtp)',
  url: 'https://www.rijksoverheid.nl/binaries/rijksoverheid/documenten/publicaties/2023/12/20/belangrijkste-wijzigingen-belastingen-2024/20240108+-+Eindejaarsbericht+-+V1.2.pdf',
  datum: '2023-12-19',
}

const params2023: TaxYearParams = {
  jaar: 2023,
  status: 'definitief',
  bijgewerkt: '2026-10-06',
  changelog: [
    { datum: '2022-12-20', wat: 'Belastingplan 2023 en Wet overbrugging box 3 aangenomen', bron: MINFIN_2023 },
    { datum: '2023-07-01', wat: 'Wet toekomst pensioenen: lijfrente met terugwerkende kracht tot 1-1-2023 naar 30%, franchise 13.646, inkomensgrens 128.810, maximum reserveringsruimte 38.000 en terugkijkperiode tien jaar', bron: MINFIN_2024_AANVULLEND },
    { datum: '2023-07-01', wat: 'Belastingrente IB 5% (vanaf 1 oktober 6%); Vpb 9% (vanaf 1 oktober 10%)' },
    {
      datum: '2026-10-04',
      wat: 'Jaarmodule aangemaakt en gecontroleerd tegen de MinFin-bijlagen 2020-2023 en 2021-2024 en de wettekst per 1-1-2023; volledige KOT-tabel uit Stb. 2022, 386',
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
      wat: 'Ronde 2 (contract): nieuwe velden hir.langlopendVanafJaren, arbeidsbeloningPartnerMin, tbsVrijstellingPct, auto.youngtimerOvergang, auto.btwPrive, stakingslijfrenteRegels, eigenWoning.reserveTermijnJaren, box2.verliesverrekening, box2.belastingkorting, overig.aanslagRendementsgrondslag (33748), overig.belastingrenteRegels en overig.invordering',
      bron: { titel: 'Wet IB 2001 art. 3.16 lid 4, 3.54, 3.99b, 3.119aa, 3.129, 4.49, 4.53 en 9.4; AWR art. 30f-30fe; Invorderingswet 1990 art. 9; Belastingdienst, btw en privégebruik auto van de zaak', url: 'https://wetten.overheid.nl/BWBR0011353/2023-01-01', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'arbeidsbeloningPartnerMin weer weggehaald: de drempel van art. 3.16 lid 4 staat alleen in ondernemer.meewerkaftrek.maxVergoeding (één veld voor dezelfde drempel); auto.youngtimerOvergang krijgt de vorm { terBeschikkingUiterlijk, youngtimerOp, oudeLeeftijd }: het overgangsrecht geldt alleen voor een auto die op 31-12-2025 al youngtimer was',
      bron: { titel: 'Toets ronde 2 (fiscaal): besluit 12-2-2026 nr. 2026-2493 (Stcrt. 20-2-2026); Wet IB 2001 art. 3.16 lid 4, 9.4 en 10.1; SRA, belastingrente 2026; ECB-persbericht 10-9-2026', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (na de nacontrole): overig.belastingrenteRegels.navorderingVerzoekMaxWeken 12 toegevoegd: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt de belastingrente uiterlijk 12 weken na ontvangst van het verzoek (nagekeken in de tekst geldend op 1-1-2026; aangenomen gelijk in 2023). overig.belastingrenteIB blijft 6% (het percentage aan het eind van 2023; alleen nog compatibiliteit tot de belastingpot de periodetabel gebruikt)',
      bron: { titel: 'AWR art. 30fc lid 5', url: 'https://wetten.overheid.nl/BWBR0002320/2026-01-01#HoofdstukV_Afdeling3_Artikel30fc', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-06',
      wat: 'Toelichting lijfrente: rekenvoorbeeld met een verzonnen inkomen; geen waarde gewijzigd',
      bron: MINFIN_2024_AANVULLEND,
    },
  ],
  indexatie: { tcf: 1.063, toegepastDeel: 1, schijf1Factor: 0.75, beleidsmatigToptariefgrens: -739 },
  varianten: [],

  box1: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Formeel twee schijven (36,93% tot en met 73.031); de knik op 37.149 is de premiegrens. Vanaf 2023 is het maximale aftrektarief gelijk aan het basistarief (tariefmaatregel 12,57%).',
    waarde: {
      schijven: [
        { tot: 37149, tarief: 0.3693, belastingDeel: 0.0928 },
        { tot: 73031, tarief: 0.3693, belastingDeel: 0.3693 },
        { tot: null, tarief: 0.495, belastingDeel: 0.495 },
      ],
      premies: { aow: 0.179, anw: 0.001, wlz: 0.0965 },
      schijf1TotGeborenVoor1946: 38703,
      aftrekTariefMax: 0.3693,
      tariefmaatregelPosten: ['ondernemersaftrek', 'mkb', 'eigenWoning', 'pga'],
      verliesverrekening: { terug: 3, vooruit: 9 },
    },
  },

  heffingskortingen: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Algemene heffingskorting bouwt af op het box 1-inkomen. Vanaf 2023 geen uitbetaling meer van niet-verzilverde kortingen aan de minstverdienende partner.',
    waarde: {
      algemeen: { max: 3070, afbouwVanaf: 22660, afbouwPct: 0.06095, grondslag: 'box1', aowMax: 1583, aowAfbouwPct: 0.03141 },
      arbeid: {
        opbouw: [
          { tot: 10740, basis: 0, pct: 0.08231 },
          { tot: 23201, basis: 884, pct: 0.29861 },
          { tot: 37691, basis: 4605, pct: 0.03085 },
        ],
        max: 5052,
        afbouwVanaf: 37691,
        afbouwPct: 0.0651,
      },
      arbeidAow: {
        opbouw: [
          { tot: 10740, basis: 0, pct: 0.04241 },
          { tot: 23201, basis: 457, pct: 0.15388 },
          { tot: 37691, basis: 2374, pct: 0.01589 },
        ],
        max: 2604,
        afbouwVanaf: 37691,
        afbouwPct: 0.03355,
      },
      iack: { pct: 0.1145, drempel: 5547, max: 2694, maxLeeftijdKind: 12, minMaandenHuishouden: 6, coOuderMinDagen: null, actief: true },
      ouderen: { max: 1835, grens: 40888, afbouwPct: 0.15, alleenstaand: 478 },
      jonggehandicapt: 820,
      groenBeleggen: { pct: 0.007, max: null },
      uitbetalingMinstverdienende: { geborenVoor: '1963-01-01', pct: 0 },
    },
  },

  ondernemer: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Geen FOR-dotatie meer vanaf 2023; een bestaande FOR blijft staan en neemt af bij staking, AOW-leeftijd, twee jaar geen urencriterium of omzetting in een lijfrente. Gebouwen in eigen gebruik: afschrijven tot 50% van de WOZ-waarde.',
    waarde: {
      urencriterium: { uren: 1225, grotendeelsPct: 0.5, startersVrijstellingJaren: 5, zwangerschapWeken: 16, verlaagdAO: 800 },
      zelfstandigenaftrek: 5030,
      aowFactor: 0.5,
      startersaftrek: 2123,
      startersaftrekMaxKeer: 3,
      startersaftrekBinnenJaren: 5,
      startersaftrekAO: { staffel: [12000, 8000, 4000], actief: true },
      soAftrek: { basis: 14202, starters: 7106, minUren: 500 },
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
      mkbWinstvrijstelling: 0.14,
      beperktAftrekbaar: { drempel: 5100, aftrekbaarDeel: 0.8 },
      kia: { minPerBedrijfsmiddel: 450, ondergrens: 2600, pct: 0.28, pctTot: 63716, vastBedrag: 17841, vastTot: 117991, afbouwPct: 0.0756, nulBoven: 353973 },
      desinvestering: { drempel: 2600, jaren: 5 },
      eia: { pct: 0.455, minPerBedrijfsmiddel: 2500, meldTermijnMaanden: 3 },
      mia: { pcts: [0.27, 0.36, 0.45], minPerBedrijfsmiddel: 2500 },
      vamil: { pct: 0.75 },
      afschrijving: { maxPctPerJaar: 0.2, goodwillPct: 0.1, directAftrekbaarTot: 450, bodemwaardeGebouwEigenGebruik: 0.5, willekeurigStarters: true },
      hir: { termijnJaren: 3, langlopendVanafJaren: 10 },
      kilometerTariefPrivevervoer: 0.21,
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
    bron: MINFIN_2024_AANVULLEND,
    veldBron: { uitkering: WET_IB_2023 },
    toelichting:
      'Wtp met terugwerkende kracht tot 1-1-2023: jaarruimte 30% van de premiegrondslag minus 6,27 × factor A of de Wtp-premie, minus de FOR-toename van 2022 (art. 10a.29 lid 11, alleen 2023 en 2024). Voorbeeld: inkomen 88.500 geeft 30% × (88.500 − 13.646) = 22.457 verrekenbare premiegrondslag 2023 (naar boven afgerond). Aftrek tot vijf jaar na het AOW-jaar.',
    waarde: {
      lijfrente: {
        regime: 'wtp',
        pct: 0.3,
        franchise: 13646,
        inkomensgrens: 128810,
        maxJaarruimte: 34550,
        maxReserveringsruimte: 38000,
        reserveringsruimtePctGrondslag: null,
        terugkijkJaren: 10,
        factorA: { toegestaan: true, factor: 6.27 },
        maxJarenNaAOW: 5,
        saldomethodeMax: 2269,
      },
      stakingslijfrente: { hoog: 510970, midden: 255495, laag: 127755 },
      stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: 5, middenBinnenJarenVoorAow: 15, arbeidsongeschiktMinPct: 0.45, betaaltermijnMaanden: 6 },
      uitkering: {
        afkoopKleineLijfrente: 4898,
        afkoopAOMax: 45722,
        tijdelijkeOudedagslijfrenteMax: 24168,
        revisierentePct: 0.2,
        bedragIneens: { vanaf: null, pct: 0.1 },
      },
      nettolijfrente: { actief: true },
      baz: { actief: false },
    },
  },

  eigenWoning: {
    status: 'definitief',
    bron: WET_IB_2023,
    toelichting: 'Art. 3.112 Wet IB 2001 (tekst 2023).',
    waarde: {
      forfait: [
        { tot: 12500, pct: 0 },
        { tot: 25000, pct: 0.001 },
        { tot: 50000, pct: 0.002 },
        { tot: 75000, pct: 0.0025 },
        { tot: 1200000, pct: 0.0035 },
        { tot: null, pct: 0.0235, vast: 4200 },
      ],
      hillenPct: 0.833333,
      hillenStap: 0.033333,
      aflossingseisVanaf: '2013-01-01',
      maxAftrekJaren: 30,
      aftrekTermijnStartUiterlijk: '2001-01-01',
      kewVrijstelling: 184500,
      wozPeildatum: 'vorigJaar',
      reserveTermijnJaren: 3,
    },
  },

  box2: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Eén tarief van 26,9%. Wet excessief lenen bij de eigen vennootschap vanaf 2023: grens 700.000 op 31 december.',
    waarde: {
      schijven: [{ tot: null, tarief: 0.269 }],
      grensPerPersoon: true,
      gebruikelijkLoonNorm: 51000,
      dividendbelasting: 0.15,
      excessiefLenen: { grens: 700000 },
      verliesverrekening: { terug: 1, vooruit: 6, oudeVerliezen: { totEnMetJaar: 2018, vooruit: 9 } },
      belastingkorting: { jarenNaEerste: 7, uiterlijkJarenNaVerlies: 9 },
    },
  },

  box3: {
    status: 'definitief',
    bron: MINFIN_2024,
    veldBron: { vrijstellingen: MINFIN_2024_AANVULLEND },
    toelichting:
      'Eerste jaar van het overbruggingsstelsel (Wet overbrugging box 3). Definitieve forfaits 2023: bank 0,92%, overig 6,17%, schulden 2,46% (de voorlopige aanslag rekende met 0,01% voor banktegoeden). Tegenbewijs via het formulier Opgaaf werkelijk rendement.',
    waarde: {
      regime: 'forfaitair',
      tarief: 0.32,
      heffingsvrijVermogen: 57000,
      schuldendrempel: 3400,
      forfaitBank: 0.0092,
      forfaitOverig: 0.0617,
      forfaitSchulden: 0.0246,
      vrijstellingen: { groen: 65072, contant: 596, uitvaart: 7913, nettolijfrente: true },
      tegenbewijs: { beschikbaar: true, kanaal: 'owr-formulier', eigenGebruikPct: 0 },
      arbitrageMaanden: 3,
      bronbelastingMaxPct: 0.15,
      dac8Rapportage: false,
    },
  },

  zvw: {
    status: 'definitief',
    bron: ZVW_2023,
    waarde: { pctOndernemer: 0.0543, pctWerkgever: 0.0668, maxBijdrageInkomen: 66956 },
  },

  pga: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Periodieke giften zonder maximum. vastHoog = 1,65% × 45.695.',
    waarde: {
      giften: {
        drempelPct: 0.01,
        drempelMin: 60,
        maxPct: 0.1,
        periodiekMax: Number.POSITIVE_INFINITY,
        cultureelMultiplier: 1.25,
        cultureelMaxExtra: 1250,
        naturaGrens: 10000,
      },
      zorgkosten: {
        actief: true,
        drempelMinPP: 149,
        drempelMinTotInkomen: 8603,
        pctLaag: 0.0165,
        grensHoog: 45695,
        vastHoog: 754,
        pctHoog: 0.0575,
        verhogingPct: 0.4,
        verhogingPctAow: 1.13,
        verhogingTotInkomen: 38703,
      },
      scholing: { actief: false, drempel: 250, max: 15000 },
      alimentatie: true,
    },
  },

  loon: {
    status: 'definitief',
    bron: MINFIN_2023,
    toelichting: 'Art. 3.87 Wet IB 2001 (tekst 2023); boven 90 km bij minder dan vier dagen per week 0,26 per km.',
    waarde: {
      reisaftrek: {
        tabel: [
          { vanafKm: 10, bedrag: 509 },
          { vanafKm: 15, bedrag: 676 },
          { vanafKm: 20, bedrag: 1126 },
          { vanafKm: 30, bedrag: 1396 },
          { vanafKm: 40, bedrag: 1819 },
          { vanafKm: 50, bedrag: 2024 },
          { vanafKm: 60, bedrag: 2244 },
          { vanafKm: 70, bedrag: 2322 },
          { vanafKm: 80, bedrag: 2354 },
        ],
        kmBedrag: 0.26,
        max: 2354,
      },
    },
  },

  toeslagen: {
    status: 'definitief',
    bron: TOESLAGEN_2023,
    veldBron: { kot: KOT_2023, kinderbijslag: KINDERBIJSLAG_2023 },
    toelichting:
      'KGB 2023 kent bedragen per aantal kinderen (1 kind 1.653, 2 kinderen 3.185, daarna 1.532 per kind); maxPerKind.tot12 bevat het bedrag voor het eerste kind. KOT: koppeling gewerkte uren vervallen per 2023 (Stb. 2022, 386). Zorgtoeslag: normpremie 0,123% (alleen) en 2,378% (paar) van het drempelinkomen plus 13,64% daarboven; maxima en inkomensgrenzen afgeleid (grens = drempel + (maximum − 24) / 13,64%).',
    waarde: {
      vermogensgrens: { alleen: 127582, metPartner: 161329 },
      kot: {
        regime: 'toeslag',
        maxUurprijs: { dagopvang: 9.12, bso: 7.85, gastouder: 6.85 },
        maxUrenPerMaand: 230,
        tabel: kotTabel.rijen,
        terugwerkendeMaanden: 3,
      },
      kgb: {
        maxPerKind: { tot12: 1653, van12: 267, van16: 476 },
        aloKop: 3848,
        afbouw: [{ vanafAlleen: 25070, vanafPaar: 43397, pct: 0.0675 }],
      },
      kinderbijslag: kinderbijslag['2023'],
      zorgtoeslag: {
        standaardpremie: 1889,
        drempelinkomen: 25070,
        afbouwPct: 0.1364,
        maxAlleen: 1858,
        maxPaar: 3182,
        grensAlleen: 38516,
        grensPaar: 48223,
      },
    },
  },

  arbeidsrelatie: {
    status: 'definitief',
    toelichting: 'Handhavingsmoratorium Wet DBA (alleen handhaving bij kwaadwillenden).',
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
    waarde: { kindJaarlijks: 6035, kindEenmalig: 28947, kindStudie: 60298, overig: 2418 },
  },

  overig: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Belastingrente wijzigde in 2023: IB 4% tot 1 juli, 5% tot 1 oktober, daarna 6%; Vpb 8%, 9% en 10%. Opgenomen is het tarief aan het eind van het jaar.',
    waarde: {
      belastingrenteIB: 0.06,
      belastingrenteVpb: 0.1,
      aanslaggrens: 51,
      teruggaafgrens: 16,
      aanslagRendementsgrondslag: 33748,
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
      aowLeeftijd: { jaren: 66, maanden: 10 },
    },
  },
}

export default params2023
