import type { Bron, TaxYearParams } from '../types'
import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'
import kinderbijslag from './data/kinderbijslag.json'
import kotTabel from './data/kot-tabel-2021.json'

/**
 * Belastingjaar 2021 (bevroren). Toetsjaar van het voorbeeldhuishouden (lib/voorbeeld): box 1 37,10% tot
 * 68.507 met premies tot 35.129, tariefmaatregel 6,5%, zelfstandigenaftrek 6.670, MKB 14%, Zvw 5,75% tot
 * 58.311, eigenwoningforfait 0,50%, reserveringsruimte begrensd op 7.489.
 *
 * Bronnen: MinFin-bijlagen Fiscale parameters 2020-2023 en 2021-2024, aanvullende parameters
 * 2021 (Belangrijkste wijzigingen belastingen 2021) en de wettekst per 1-1-2021.
 */

const MINFIN_2024: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2024, bijlage 1 Fiscale parameters 2021-2024',
  url: 'https://www.rijksoverheid.nl/binaries/rijksoverheid/documenten/publicaties/2023/12/20/belangrijkste-wijzigingen-belastingen-2024/20240108+-+Eindejaarsbericht+-+V1.2.pdf',
  datum: '2023-12-19',
}
const MINFIN_2021: Bron = {
  titel: 'Belangrijkste wijzigingen belastingen 2021, bijlage 2 Aanvullende fiscale parameters',
  url: 'https://www.accountant.nl/siteassets/accountant.nl/diversen/belangrijkste-wijzigingen-belastingen-2021.pdf',
  datum: '2020-12-15',
}
const WET_IB_2021: Bron = {
  titel: 'Wet inkomstenbelasting 2001, tekst geldend op 1 januari 2021',
  url: 'https://wetten.overheid.nl/BWBR0011353/2021-01-01',
  datum: '2021-01-01',
}
const KOT_2021: Bron = {
  titel: 'Besluit van 14 september 2020 tot wijziging van het Besluit kinderopvangtoeslag (Stb. 2020, 376)',
  url: 'https://zoek.officielebekendmakingen.nl/stb-2020-376.html',
  datum: '2020-09-14',
}
const KGB_2021: Bron = {
  titel: 'Wet op het kindgebonden budget, art. 1 en 2, tekst geldend in 2021',
  url: 'https://wetten.overheid.nl/BWBR0022751/2021-07-01',
  datum: '2021-01-01',
}
const ZORGTOESLAG_2021: Bron = {
  titel: 'Regeling vaststelling standaardpremie 2021 (1.705) en normpremiepercentages zorgtoeslag 2021',
  url: 'https://www.taxlive.nl/nl/documenten/vn-vandaag/regeling-vaststelling-standaardpremie-en-bestuursrechtelijke-premies-2021/',
  datum: '2020-11-01',
}
const KINDERBIJSLAG_2021: Bron = {
  titel: 'Kinderbijslagbedragen 2021 (Stcrt. 2020, 66667 en Stcrt. 2021, 31645)',
  url: 'https://zoek.officielebekendmakingen.nl/stcrt-2020-66667.html',
  datum: '2021-06-15',
}

const params2021: TaxYearParams = {
  jaar: 2021,
  status: 'definitief',
  bijgewerkt: '2026-10-06',
  changelog: [
    { datum: '2020-12-15', wat: 'Belastingplan 2021 aangenomen', bron: MINFIN_2021 },
    { datum: '2022-06-30', wat: 'Rechtsherstel box 3 na het Kerstarrest (beleidsbesluit, later Wet rechtsherstel box 3): forfait op de werkelijke vermogensmix (sparen 0,01%, overig 5,69%, schulden 2,46%); laagste van oud en nieuw stelsel' },
    {
      datum: '2026-10-04',
      wat: 'Jaarmodule aangemaakt en gecontroleerd tegen de MinFin-bijlagen 2020-2023 en 2021-2024 en de wettekst per 1-1-2021; volledige KOT-tabel uit Stb. 2020, 376',
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
      wat: 'Ronde 2 (contract): nieuwe velden hir.langlopendVanafJaren, arbeidsbeloningPartnerMin, tbsVrijstellingPct, auto.youngtimerOvergang, auto.btwPrive, stakingslijfrenteRegels, eigenWoning.reserveTermijnJaren, box2.verliesverrekening, box2.belastingkorting, overig.aanslagRendementsgrondslag (31340), overig.belastingrenteRegels en overig.invordering',
      bron: { titel: 'Wet IB 2001 art. 3.16 lid 4, 3.54, 3.99b, 3.119aa, 3.129, 4.49, 4.53 en 9.4; AWR art. 30f-30fe; Invorderingswet 1990 art. 9; Belastingdienst, btw en privégebruik auto van de zaak', url: 'https://wetten.overheid.nl/BWBR0011353/2021-01-01', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'arbeidsbeloningPartnerMin weer weggehaald: de drempel van art. 3.16 lid 4 staat alleen in ondernemer.meewerkaftrek.maxVergoeding (één veld voor dezelfde drempel); auto.youngtimerOvergang krijgt de vorm { terBeschikkingUiterlijk, youngtimerOp, oudeLeeftijd }: het overgangsrecht geldt alleen voor een auto die op 31-12-2025 al youngtimer was',
      bron: { titel: 'Toets ronde 2 (fiscaal): besluit 12-2-2026 nr. 2026-2493 (Stcrt. 20-2-2026); Wet IB 2001 art. 3.16 lid 4, 9.4 en 10.1; SRA, belastingrente 2026; ECB-persbericht 10-9-2026', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (na de nacontrole): overig.belastingrenteRegels.navorderingVerzoekMaxWeken 12 toegevoegd: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt de belastingrente uiterlijk 12 weken na ontvangst van het verzoek (nagekeken in de tekst geldend op 1-1-2026; aangenomen gelijk in 2021)',
      bron: { titel: 'AWR art. 30fc lid 5', url: 'https://wetten.overheid.nl/BWBR0002320/2026-01-01#HoofdstukV_Afdeling3_Artikel30fc', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-06',
      wat: 'Bronvermelding en toelichting: schijven en Zvw verwijzen naar de MinFin-bijlage Fiscale parameters 2021-2024, de rekenvoorbeelden komen uit het voorbeeldhuishouden; geen waarde gewijzigd',
      bron: MINFIN_2024,
    },
  ],
  indexatie: { tcf: 1.016, toegepastDeel: 1, schijf1Factor: 0.75, beleidsmatigToptariefgrens: -1096 },
  varianten: [],

  box1: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Formeel twee schijven (37,10% tot en met 68.507); de knik op 35.129 is de premiegrens. Grondslagverminderende posten tegen maximaal 43% (tariefmaatregel 6,5%).',
    waarde: {
      schijven: [
        { tot: 35129, tarief: 0.371, belastingDeel: 0.0945 },
        { tot: 68507, tarief: 0.371, belastingDeel: 0.371 },
        { tot: null, tarief: 0.495, belastingDeel: 0.495 },
      ],
      premies: { aow: 0.179, anw: 0.001, wlz: 0.0965 },
      schijf1TotGeborenVoor1946: 35941,
      aftrekTariefMax: 0.43,
      tariefmaatregelPosten: ['ondernemersaftrek', 'mkb', 'eigenWoning', 'pga'],
      verliesverrekening: { terug: 3, vooruit: 9 },
    },
  },

  heffingskortingen: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Algemene heffingskorting bouwt af op het box 1-inkomen. Niet-verzilverde kortingen worden voor 13,33% uitbetaald aan een minstverdienende partner geboren vóór 1963.',
    waarde: {
      algemeen: { max: 2837, afbouwVanaf: 21043, afbouwPct: 0.05977, grondslag: 'box1', aowMax: 1469, aowAfbouwPct: 0.03093 },
      arbeid: {
        opbouw: [
          { tot: 10108, basis: 0, pct: 0.04581 },
          { tot: 21835, basis: 463, pct: 0.28771 },
          { tot: 35652, basis: 3837, pct: 0.02663 },
        ],
        max: 4205,
        afbouwVanaf: 35652,
        afbouwPct: 0.06,
      },
      arbeidAow: {
        opbouw: [
          { tot: 10108, basis: 0, pct: 0.02371 },
          { tot: 21835, basis: 240, pct: 0.1489 },
          { tot: 35652, basis: 1987, pct: 0.01378 },
        ],
        max: 2178,
        afbouwVanaf: 35652,
        afbouwPct: 0.03105,
      },
      iack: { pct: 0.1145, drempel: 5153, max: 2815, maxLeeftijdKind: 12, minMaandenHuishouden: 6, coOuderMinDagen: null, actief: true },
      ouderen: { max: 1703, grens: 37970, afbouwPct: 0.15, alleenstaand: 443 },
      jonggehandicapt: 761,
      groenBeleggen: { pct: 0.007, max: null },
      uitbetalingMinstverdienende: { geborenVoor: '1963-01-01', pct: 0.1333 },
    },
  },

  ondernemer: {
    status: 'definitief',
    bron: MINFIN_2024,
    veldBron: { for: WET_IB_2021 },
    toelichting: 'Laatste jaren met FOR-dotatie (9,44% van de winst, maximaal 9.395). Gebouwen in eigen gebruik: afschrijven tot 50% van de WOZ-waarde.',
    waarde: {
      urencriterium: { uren: 1225, grotendeelsPct: 0.5, startersVrijstellingJaren: 5, zwangerschapWeken: 16, verlaagdAO: 800 },
      zelfstandigenaftrek: 6670,
      aowFactor: 0.5,
      startersaftrek: 2123,
      startersaftrekMaxKeer: 3,
      startersaftrekBinnenJaren: 5,
      startersaftrekAO: { staffel: [12000, 8000, 4000], actief: true },
      soAftrek: { basis: 13188, starters: 6598, minUren: 500 },
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
      beperktAftrekbaar: { drempel: 4700, aftrekbaarDeel: 0.8 },
      kia: { minPerBedrijfsmiddel: 450, ondergrens: 2400, pct: 0.28, pctTot: 59170, vastBedrag: 16568, vastTot: 109574, afbouwPct: 0.0756, nulBoven: 328721 },
      desinvestering: { drempel: 2400, jaren: 5 },
      eia: { pct: 0.455, minPerBedrijfsmiddel: 2500, meldTermijnMaanden: 3 },
      mia: { pcts: [0.135, 0.27, 0.36], minPerBedrijfsmiddel: 2500 },
      vamil: { pct: 0.75 },
      afschrijving: { maxPctPerJaar: 0.2, goodwillPct: 0.1, directAftrekbaarTot: 450, bodemwaardeGebouwEigenGebruik: 0.5, willekeurigStarters: true },
      hir: { termijnJaren: 3, langlopendVanafJaren: 10 },
      kilometerTariefPrivevervoer: 0.19,
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
        dotatie: true,
        dotatiePct: 0.0944,
        dotatieMax: 9395,
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
    bron: MINFIN_2021,
    veldBron: { uitkering: WET_IB_2021 },
    toelichting:
      'Pre-Wtp: jaarruimte 13,3% van de premiegrondslag minus 6,27 × factor A minus de FOR-toevoeging; reserveringsruimte maximaal 17% van de premiegrondslag en 7.489 (14.785 bij tien jaar of minder voor de AOW-leeftijd), zeven jaar terug. Voorbeeld: staat er uit 2019 en 2020 samen meer open dan 7.489, dan telt alleen 7.489 als reserveringsruimte en gaat de rest van de premie uit de jaarruimte 2021.',
    waarde: {
      lijfrente: {
        regime: 'pre-wtp',
        pct: 0.133,
        franchise: 12672,
        inkomensgrens: 112189,
        maxJaarruimte: 13236,
        maxReserveringsruimte: 7489,
        reserveringsruimtePctGrondslag: 0.17,
        terugkijkJaren: 7,
        factorA: { toegestaan: true, factor: 6.27 },
        maxJarenNaAOW: 0,
        saldomethodeMax: 2269,
      },
      stakingslijfrente: { hoog: 474517, midden: 237267, laag: 118640 },
      stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: 5, middenBinnenJarenVoorAow: 15, arbeidsongeschiktMinPct: 0.45, betaaltermijnMaanden: 6 },
      uitkering: {
        afkoopKleineLijfrente: 4547,
        afkoopAOMax: 42460,
        tijdelijkeOudedagslijfrenteMax: 22443,
        revisierentePct: 0.2,
        bedragIneens: { vanaf: null, pct: 0.1 },
      },
      nettolijfrente: { actief: true },
      baz: { actief: false },
    },
  },

  eigenWoning: {
    status: 'definitief',
    bron: WET_IB_2021,
    toelichting: 'Art. 3.112 Wet IB 2001 (tekst 2021). Voorbeeld 2021: WOZ 338.000 × 0,50% = 1.690.',
    waarde: {
      forfait: [
        { tot: 12500, pct: 0 },
        { tot: 25000, pct: 0.002 },
        { tot: 50000, pct: 0.003 },
        { tot: 75000, pct: 0.004 },
        { tot: 1110000, pct: 0.005 },
        { tot: null, pct: 0.0235, vast: 5550 },
      ],
      hillenPct: 0.9,
      hillenStap: 0.033333,
      aflossingseisVanaf: '2013-01-01',
      maxAftrekJaren: 30,
      aftrekTermijnStartUiterlijk: '2001-01-01',
      kewVrijstelling: 171000,
      wozPeildatum: 'vorigJaar',
      reserveTermijnJaren: 3,
    },
  },

  box2: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Eén tarief van 26,9%. De regeling excessief lenen bestond nog niet (geen grens).',
    waarde: {
      schijven: [{ tot: null, tarief: 0.269 }],
      grensPerPersoon: true,
      gebruikelijkLoonNorm: 46000,
      dividendbelasting: 0.15,
      excessiefLenen: { grens: Number.POSITIVE_INFINITY },
      verliesverrekening: { terug: 1, vooruit: 6, oudeVerliezen: { totEnMetJaar: 2018, vooruit: 9 } },
      belastingkorting: { jarenNaEerste: 7, uiterlijkJarenNaVerlies: 9 },
    },
  },

  box3: {
    status: 'definitief',
    bron: MINFIN_2024,
    veldBron: { vrijstellingen: MINFIN_2021 },
    toelichting:
      'Schijvenstelsel 2017: effectief rendement per schijf van de grondslag (67/33 en 21/79 verdeling sparen/beleggen met 0,03% en 5,69%). Na de Wet rechtsherstel box 3 geldt het laagste van dit stelsel en het forfait op de werkelijke vermogensmix (forfaitBank, forfaitOverig, forfaitSchulden). Tegenbewijs via het formulier Opgaaf werkelijk rendement.',
    waarde: {
      regime: 'schijven2017',
      tarief: 0.31,
      heffingsvrijVermogen: 50000,
      schuldendrempel: 3200,
      forfaitBank: 0.0001,
      forfaitOverig: 0.0569,
      forfaitSchulden: 0.0246,
      schijven2017: [
        { tot: 50000, pct: 0.01898 },
        { tot: 950000, pct: 0.04501 },
        { tot: null, pct: 0.0569 },
      ],
      vrijstellingen: { groen: 60429, contant: 552, uitvaart: 7348, nettolijfrente: true },
      tegenbewijs: { beschikbaar: true, kanaal: 'owr-formulier', eigenGebruikPct: 0 },
      arbitrageMaanden: 3,
      bronbelastingMaxPct: 0.15,
      dac8Rapportage: false,
    },
  },

  zvw: {
    status: 'definitief',
    bron: MINFIN_2024,
    waarde: { pctOndernemer: 0.0575, pctWerkgever: 0.07, maxBijdrageInkomen: 58311 },
  },

  pga: {
    status: 'definitief',
    bron: MINFIN_2024,
    veldBron: { scholing: WET_IB_2021 },
    toelichting: 'Laatste jaar met aftrek van scholingsuitgaven (drempel 250, maximum 15.000). Periodieke giften zonder maximum. vastHoog = 1,65% × 42.434.',
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
        drempelMinPP: 139,
        drempelMinTotInkomen: 7989,
        pctLaag: 0.0165,
        grensHoog: 42434,
        vastHoog: 700,
        pctHoog: 0.0575,
        verhogingPct: 0.4,
        verhogingPctAow: 1.13,
        verhogingTotInkomen: 35941,
      },
      scholing: { actief: true, drempel: 250, max: 15000 },
      alimentatie: true,
    },
  },

  loon: {
    status: 'definitief',
    bron: WET_IB_2021,
    toelichting: 'Art. 3.87 Wet IB 2001 (tekst 2021); boven 90 km bij minder dan vier dagen per week 0,24 per km.',
    waarde: {
      reisaftrek: {
        tabel: [
          { vanafKm: 10, bedrag: 471 },
          { vanafKm: 15, bedrag: 626 },
          { vanafKm: 20, bedrag: 1045 },
          { vanafKm: 30, bedrag: 1296 },
          { vanafKm: 40, bedrag: 1689 },
          { vanafKm: 50, bedrag: 1879 },
          { vanafKm: 60, bedrag: 2083 },
          { vanafKm: 70, bedrag: 2155 },
          { vanafKm: 80, bedrag: 2185 },
        ],
        kmBedrag: 0.24,
        max: 2185,
      },
    },
  },

  toeslagen: {
    status: 'definitief',
    bron: KOT_2021,
    veldBron: { kgb: KGB_2021, vermogensgrens: KGB_2021, zorgtoeslag: ZORGTOESLAG_2021, kinderbijslag: KINDERBIJSLAG_2021 },
    toelichting:
      'KGB 2021 kent bedragen per aantal kinderen (1 kind 1.204, 2 kinderen 2.226, 3 kinderen 3.145, daarna 919 per kind); maxPerKind.tot12 bevat het bedrag voor het eerste kind. Drempel paren = drempelinkomen 21.835 + 17.018. Vermogensgrens volgens de Wet op het kindgebonden budget (zorgtoeslag 2021 had afwijkende grenzen). KOT 2021 met koppeling gewerkte uren (140% dagopvang, 70% bso van de gewerkte uren). Zorgtoeslag: normpremie 1,885% (alleen) en 4,195% (paar) van het drempelinkomen plus 13,58% daarboven; maxima afgeleid, inkomensgrenzen zoals gepubliceerd.',
    waarde: {
      vermogensgrens: { alleen: 116613, metPartner: 147459 },
      kot: {
        regime: 'toeslag',
        maxUurprijs: { dagopvang: 8.46, bso: 7.27, gastouder: 6.49 },
        maxUrenPerMaand: 230,
        tabel: kotTabel.rijen,
        terugwerkendeMaanden: 3,
      },
      kgb: {
        maxPerKind: { tot12: 1204, van12: 247, van16: 441 },
        aloKop: 3242,
        afbouw: [{ vanafAlleen: 21835, vanafPaar: 38853, pct: 0.0675 }],
      },
      kinderbijslag: kinderbijslag['2021'],
      zorgtoeslag: {
        standaardpremie: 1705,
        drempelinkomen: 21835,
        afbouwPct: 0.1358,
        maxAlleen: 1293,
        maxPaar: 2494,
        grensAlleen: 31138,
        grensPaar: 39979,
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
    toelichting: 'In 2021 gold voor de schenkbelasting een tijdelijke verhoging van 1.000 op de jaarlijkse vrijstellingen (kind 6.604, overig 3.244; erfbelasting overig 2.244).',
    waarde: { kindJaarlijks: 6604, kindEenmalig: 26881, kindStudie: 55996, overig: 3244 },
  },

  overig: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Belastingrente IB 4% en Vpb 8% in 2021.',
    waarde: {
      belastingrenteIB: 0.04,
      belastingrenteVpb: 0.08,
      aanslaggrens: 48,
      teruggaafgrens: 15,
      aanslagRendementsgrondslag: 31340,
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
      vpb: { grens: 245000, laag: 0.15, hoog: 0.25 },
      innovatiebox: { tarief: 0.09, forfaitPct: 0.25, forfaitMax: 25000 },
      pseudoEindheffingFossieleAuto: 0,
      aowLeeftijd: { jaren: 66, maanden: 4 },
    },
  },
}

export default params2021
