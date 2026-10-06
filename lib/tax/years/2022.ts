import type { Bron, TaxYearParams } from '../types'
import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'
import kinderbijslag from './data/kinderbijslag.json'
import kotTabel from './data/kot-tabel-2022.json'

/**
 * Belastingjaar 2022 (bevroren). Nodig voor de tienjaarsterugblik van de reserveringsruimte
 * (laatste jaar met 13,3%, franchise 12.837 en inkomensgrens 114.866) en
 * voor middeling 2022-2024. Laatste jaar van het box 3-schijvenstelsel en van de FOR-dotatie.
 *
 * Bronnen: MinFin-bijlagen Fiscale parameters 2020-2023 en 2021-2024, aanvullende parameters
 * 2022-2023 (Belangrijkste wijzigingen belastingen 2023) en de wettekst per 1-1-2022.
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
const WET_IB_2022: Bron = {
  titel: 'Wet inkomstenbelasting 2001, tekst geldend op 1 januari 2022',
  url: 'https://wetten.overheid.nl/BWBR0011353/2022-01-01',
  datum: '2022-01-01',
}
const KOT_2022: Bron = {
  titel: 'Besluit van 31 augustus 2021 tot wijziging van het Besluit kinderopvangtoeslag (Stb. 2021, 434)',
  url: 'https://zoek.officielebekendmakingen.nl/stb-2021-434.html',
  datum: '2021-08-31',
}
const TOESLAGEN_2022: Bron = {
  titel: 'Dienst Toeslagen, berekening kindgebonden budget 2022 en berekening zorgtoeslag 2022',
  url: 'https://download.belastingdienst.nl/toeslagen/docs/berekening_kindgebonden_budget_tg0811z21fd.pdf',
  datum: '2022-01-01',
}
const KINDERBIJSLAG_2022: Bron = {
  titel: 'Kinderbijslagbedragen 2022 (Stcrt. 2021, 50384 en Stcrt. 2022, 16361)',
  url: 'https://zoek.officielebekendmakingen.nl/stcrt-2022-16361.html',
  datum: '2022-06-15',
}
const ZVW_2022: Bron = {
  titel: 'Inkomensafhankelijke bijdrage Zvw 2022 (5,50% en 6,75%, maximum 59.706)',
  url: 'https://www.salarisvanmorgen.nl/2021/09/23/werkgeversheffing-zvw-omlaag-in-2022-naar-670-procent/',
  datum: '2021-11-15',
}

const params2022: TaxYearParams = {
  jaar: 2022,
  status: 'definitief',
  bijgewerkt: '2026-10-06',
  changelog: [
    { datum: '2021-12-21', wat: 'Belastingplan 2022 aangenomen', bron: MINFIN_2024 },
    { datum: '2022-06-30', wat: 'Rechtsherstel box 3 na het Kerstarrest (2021 en 2022): aangifte 2022 rekent het laagste van het schijvenstelsel en het forfait op de werkelijke vermogensmix (sparen 0,00%, overig 5,53%, schulden 2,28%)' },
    {
      datum: '2026-10-04',
      wat: 'Jaarmodule aangemaakt en gecontroleerd tegen de MinFin-bijlagen 2020-2023 en 2021-2024 en de wettekst per 1-1-2022; volledige KOT-tabel uit Stb. 2021, 434',
      bron: MINFIN_2023,
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
      wat: 'Ronde 2 (contract): nieuwe velden hir.langlopendVanafJaren, arbeidsbeloningPartnerMin, tbsVrijstellingPct, auto.youngtimerOvergang, auto.btwPrive, stakingslijfrenteRegels, eigenWoning.reserveTermijnJaren, box2.verliesverrekening, box2.belastingkorting, overig.aanslagRendementsgrondslag (31747), overig.belastingrenteRegels en overig.invordering',
      bron: { titel: 'Wet IB 2001 art. 3.16 lid 4, 3.54, 3.99b, 3.119aa, 3.129, 4.49, 4.53 en 9.4; AWR art. 30f-30fe; Invorderingswet 1990 art. 9; Belastingdienst, btw en privégebruik auto van de zaak', url: 'https://wetten.overheid.nl/BWBR0011353/2022-01-01', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'arbeidsbeloningPartnerMin weer weggehaald: de drempel van art. 3.16 lid 4 staat alleen in ondernemer.meewerkaftrek.maxVergoeding (één veld voor dezelfde drempel); auto.youngtimerOvergang krijgt de vorm { terBeschikkingUiterlijk, youngtimerOp, oudeLeeftijd }: het overgangsrecht geldt alleen voor een auto die op 31-12-2025 al youngtimer was',
      bron: { titel: 'Toets ronde 2 (fiscaal): besluit 12-2-2026 nr. 2026-2493 (Stcrt. 20-2-2026); Wet IB 2001 art. 3.16 lid 4, 9.4 en 10.1; SRA, belastingrente 2026; ECB-persbericht 10-9-2026', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (na de nacontrole): overig.belastingrenteRegels.navorderingVerzoekMaxWeken 12 toegevoegd: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt de belastingrente uiterlijk 12 weken na ontvangst van het verzoek (nagekeken in de tekst geldend op 1-1-2026; aangenomen gelijk in 2022)',
      bron: { titel: 'AWR art. 30fc lid 5', url: 'https://wetten.overheid.nl/BWBR0002320/2026-01-01#HoofdstukV_Afdeling3_Artikel30fc', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (A2): overig.aanslaggrens van 49 naar 48 en overig.teruggaafgrens van 16 naar 15, volgens de tekst van art. 9.4 lid 1 onder a en lid 5 geldend op 1 januari 2022 (fiscaal-ronde2.md 1.1, voorbeeld G7)',
      bron: { titel: 'Wet inkomstenbelasting 2001, art. 9.4, tekst geldend op 1 januari 2022', url: 'https://wetten.overheid.nl/BWBR0011353/2022-01-01#Hoofdstuk9_Artikel9.4', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-06',
      wat: 'Bronvermelding: de lijfrentewaarden verwijzen naar de MinFin-bijlage van het blok; geen waarde gewijzigd',
      bron: MINFIN_2023,
    },
  ],
  indexatie: { tcf: 1.013, toegepastDeel: 1, schijf1Factor: 0.75, beleidsmatigToptariefgrens: 0 },
  varianten: [],

  box1: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Formeel twee schijven (37,07% tot en met 69.398); de knik op 35.472 is de premiegrens. Grondslagverminderende posten tegen maximaal 40% (tariefmaatregel 9,5%).',
    waarde: {
      schijven: [
        { tot: 35472, tarief: 0.3707, belastingDeel: 0.0942 },
        { tot: 69398, tarief: 0.3707, belastingDeel: 0.3707 },
        { tot: null, tarief: 0.495, belastingDeel: 0.495 },
      ],
      premies: { aow: 0.179, anw: 0.001, wlz: 0.0965 },
      schijf1TotGeborenVoor1946: 36409,
      aftrekTariefMax: 0.4,
      tariefmaatregelPosten: ['ondernemersaftrek', 'mkb', 'eigenWoning', 'pga'],
      verliesverrekening: { terug: 3, vooruit: 9 },
    },
  },

  heffingskortingen: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Algemene heffingskorting bouwt af op het box 1-inkomen. Niet-verzilverde kortingen worden voor 6,67% uitbetaald aan een minstverdienende partner geboren vóór 1963.',
    waarde: {
      algemeen: { max: 2888, afbouwVanaf: 21317, afbouwPct: 0.06007, grondslag: 'box1', aowMax: 1494, aowAfbouwPct: 0.03106 },
      arbeid: {
        opbouw: [
          { tot: 10350, basis: 0, pct: 0.04541 },
          { tot: 22356, basis: 470, pct: 0.28461 },
          { tot: 36649, basis: 3887, pct: 0.0261 },
        ],
        max: 4260,
        afbouwVanaf: 36649,
        afbouwPct: 0.0586,
      },
      arbeidAow: {
        opbouw: [
          { tot: 10350, basis: 0, pct: 0.02348 },
          { tot: 22356, basis: 244, pct: 0.14718 },
          { tot: 36649, basis: 2011, pct: 0.01349 },
        ],
        max: 2204,
        afbouwVanaf: 36649,
        afbouwPct: 0.0303,
      },
      iack: { pct: 0.1145, drempel: 5219, max: 2534, maxLeeftijdKind: 12, minMaandenHuishouden: 6, coOuderMinDagen: null, actief: true },
      ouderen: { max: 1726, grens: 38464, afbouwPct: 0.15, alleenstaand: 449 },
      jonggehandicapt: 771,
      groenBeleggen: { pct: 0.007, max: null },
      uitbetalingMinstverdienende: { geborenVoor: '1963-01-01', pct: 0.0667 },
    },
  },

  ondernemer: {
    status: 'definitief',
    bron: MINFIN_2024,
    veldBron: { for: WET_IB_2022 },
    toelichting: 'Laatste jaar met FOR-dotatie (9,44% van de winst, maximaal 9.632). Gebouwen in eigen gebruik: afschrijven tot 50% van de WOZ-waarde.',
    waarde: {
      urencriterium: { uren: 1225, grotendeelsPct: 0.5, startersVrijstellingJaren: 5, zwangerschapWeken: 16, verlaagdAO: 800 },
      zelfstandigenaftrek: 6310,
      aowFactor: 0.5,
      startersaftrek: 2123,
      startersaftrekMaxKeer: 3,
      startersaftrekBinnenJaren: 5,
      startersaftrekAO: { staffel: [12000, 8000, 4000], actief: true },
      soAftrek: { basis: 13360, starters: 6684, minUren: 500 },
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
      beperktAftrekbaar: { drempel: 4800, aftrekbaarDeel: 0.8 },
      kia: { minPerBedrijfsmiddel: 450, ondergrens: 2400, pct: 0.28, pctTot: 59939, vastBedrag: 16783, vastTot: 110998, afbouwPct: 0.0756, nulBoven: 332994 },
      desinvestering: { drempel: 2400, jaren: 5 },
      eia: { pct: 0.455, minPerBedrijfsmiddel: 2500, meldTermijnMaanden: 3 },
      mia: { pcts: [0.27, 0.36, 0.45], minPerBedrijfsmiddel: 2500 },
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
        dotatieMax: 9632,
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
    bron: MINFIN_2023,
    veldBron: { uitkering: WET_IB_2022 },
    toelichting:
      'Pre-Wtp: jaarruimte 13,3% van de premiegrondslag minus 6,27 × factor A minus de FOR-toevoeging; reserveringsruimte maximaal 17% van de premiegrondslag en 7.587 (14.978 bij tien jaar of minder voor de AOW-leeftijd), zeven jaar terug. Boven de inkomensgrens: 13,3% × (114.866 − 12.837) = 13.570 verrekenbare premiegrondslag 2022 (het maximum).',
    waarde: {
      lijfrente: {
        regime: 'pre-wtp',
        pct: 0.133,
        franchise: 12837,
        inkomensgrens: 114866,
        maxJaarruimte: 13570,
        maxReserveringsruimte: 7587,
        reserveringsruimtePctGrondslag: 0.17,
        terugkijkJaren: 7,
        factorA: { toegestaan: true, factor: 6.27 },
        maxJarenNaAOW: 0,
        saldomethodeMax: 2269,
      },
      stakingslijfrente: { hoog: 480686, midden: 240352, laag: 120183 },
      stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: 5, middenBinnenJarenVoorAow: 15, arbeidsongeschiktMinPct: 0.45, betaaltermijnMaanden: 6 },
      uitkering: {
        afkoopKleineLijfrente: 4607,
        afkoopAOMax: 43012,
        tijdelijkeOudedagslijfrenteMax: 22735,
        revisierentePct: 0.2,
        bedragIneens: { vanaf: null, pct: 0.1 },
      },
      nettolijfrente: { actief: true },
      baz: { actief: false },
    },
  },

  eigenWoning: {
    status: 'definitief',
    bron: WET_IB_2022,
    toelichting: 'Art. 3.112 Wet IB 2001 (tekst 2022).',
    waarde: {
      forfait: [
        { tot: 12500, pct: 0 },
        { tot: 25000, pct: 0.0015 },
        { tot: 50000, pct: 0.0025 },
        { tot: 75000, pct: 0.0035 },
        { tot: 1130000, pct: 0.0045 },
        { tot: null, pct: 0.0235, vast: 5085 },
      ],
      hillenPct: 0.866667,
      hillenStap: 0.033333,
      aflossingseisVanaf: '2013-01-01',
      maxAftrekJaren: 30,
      aftrekTermijnStartUiterlijk: '2001-01-01',
      kewVrijstelling: 173500,
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
      gebruikelijkLoonNorm: 48000,
      dividendbelasting: 0.15,
      excessiefLenen: { grens: Number.POSITIVE_INFINITY },
      verliesverrekening: { terug: 1, vooruit: 6, oudeVerliezen: { totEnMetJaar: 2018, vooruit: 9 } },
      belastingkorting: { jarenNaEerste: 7, uiterlijkJarenNaVerlies: 9 },
    },
  },

  box3: {
    status: 'definitief',
    bron: MINFIN_2024,
    veldBron: { vrijstellingen: MINFIN_2023 },
    toelichting:
      'Laatste jaar van het schijvenstelsel 2017: effectief rendement per schijf (67/33 en 21/79 verdeling sparen/beleggen met -0,01% en 5,53%). Na het rechtsherstel box 3 geldt het laagste van dit stelsel en het forfait op de werkelijke vermogensmix (forfaitBank, forfaitOverig, forfaitSchulden). Tegenbewijs via het formulier Opgaaf werkelijk rendement.',
    waarde: {
      regime: 'schijven2017',
      tarief: 0.31,
      heffingsvrijVermogen: 50650,
      schuldendrempel: 3200,
      forfaitBank: 0,
      forfaitOverig: 0.0553,
      forfaitSchulden: 0.0228,
      schijven2017: [
        { tot: 50650, pct: 0.01818 },
        { tot: 962350, pct: 0.04366 },
        { tot: null, pct: 0.0553 },
      ],
      vrijstellingen: { groen: 61215, contant: 560, uitvaart: 7444, nettolijfrente: true },
      tegenbewijs: { beschikbaar: true, kanaal: 'owr-formulier', eigenGebruikPct: 0 },
      arbitrageMaanden: 3,
      bronbelastingMaxPct: 0.15,
      dac8Rapportage: false,
    },
  },

  zvw: {
    status: 'definitief',
    bron: ZVW_2022,
    waarde: { pctOndernemer: 0.055, pctWerkgever: 0.0675, maxBijdrageInkomen: 59706 },
  },

  pga: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Aftrek scholingsuitgaven vervallen per 2022 (vervangen door STAP-budget). Periodieke giften zonder maximum. vastHoog = 1,65% × 42.986.',
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
        drempelMinPP: 141,
        drempelMinTotInkomen: 8093,
        pctLaag: 0.0165,
        grensHoog: 42986,
        vastHoog: 709,
        pctHoog: 0.0575,
        verhogingPct: 0.4,
        verhogingPctAow: 1.13,
        verhogingTotInkomen: 36409,
      },
      scholing: { actief: false, drempel: 250, max: 15000 },
      alimentatie: true,
    },
  },

  loon: {
    status: 'definitief',
    bron: MINFIN_2023,
    toelichting: 'Art. 3.87 Wet IB 2001 (tekst 2022); boven 90 km bij minder dan vier dagen per week 0,24 per km.',
    waarde: {
      reisaftrek: {
        tabel: [
          { vanafKm: 10, bedrag: 478 },
          { vanafKm: 15, bedrag: 635 },
          { vanafKm: 20, bedrag: 1059 },
          { vanafKm: 30, bedrag: 1313 },
          { vanafKm: 40, bedrag: 1711 },
          { vanafKm: 50, bedrag: 1904 },
          { vanafKm: 60, bedrag: 2111 },
          { vanafKm: 70, bedrag: 2184 },
          { vanafKm: 80, bedrag: 2214 },
        ],
        kmBedrag: 0.24,
        max: 2214,
      },
    },
  },

  toeslagen: {
    status: 'definitief',
    bron: TOESLAGEN_2022,
    veldBron: { kot: KOT_2022, kinderbijslag: KINDERBIJSLAG_2022 },
    toelichting:
      'KGB 2022 kent bedragen per aantal kinderen (1 kind 1.220, 2 kinderen 2.326, 3 kinderen 3.327, daarna 1.001 per kind); maxPerKind.tot12 bevat het bedrag voor het eerste kind. KOT 2022 met koppeling gewerkte uren (140% van de gewerkte uren). Zorgtoeslag: normpremie 1,848% (alleen) en 4,225% (paar) van het drempelinkomen plus 13,61% daarboven; maxima en inkomensgrenzen afgeleid (grens = drempel + (maximum − 24) / 13,61%).',
    waarde: {
      vermogensgrens: { alleen: 120020, metPartner: 151767 },
      kot: {
        regime: 'toeslag',
        maxUurprijs: { dagopvang: 8.5, bso: 7.31, gastouder: 6.52 },
        maxUrenPerMaand: 230,
        tabel: kotTabel.rijen,
        terugwerkendeMaanden: 3,
      },
      kgb: {
        maxPerKind: { tot12: 1220, van12: 251, van16: 447 },
        aloKop: 3285,
        afbouw: [{ vanafAlleen: 22356, vanafPaar: 39596, pct: 0.0675 }],
      },
      kinderbijslag: kinderbijslag['2022'],
      zorgtoeslag: {
        standaardpremie: 1749,
        drempelinkomen: 22356,
        afbouwPct: 0.1361,
        maxAlleen: 1336,
        maxPaar: 2553,
        grensAlleen: 31996,
        grensPaar: 40938,
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
    waarde: { kindJaarlijks: 5677, kindEenmalig: 27231, kindStudie: 56724, overig: 2274 },
  },

  overig: {
    status: 'definitief',
    bron: MINFIN_2024,
    toelichting: 'Belastingrente IB 4% en Vpb 8% in 2022.',
    waarde: {
      belastingrenteIB: 0.04,
      belastingrenteVpb: 0.08,
      aanslaggrens: 48,
      teruggaafgrens: 15,
      aanslagRendementsgrondslag: 31747,
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
      vpb: { grens: 395000, laag: 0.15, hoog: 0.258 },
      innovatiebox: { tarief: 0.09, forfaitPct: 0.25, forfaitMax: 25000 },
      pseudoEindheffingFossieleAuto: 0,
      aowLeeftijd: { jaren: 66, maanden: 7 },
    },
  },
}

export default params2022
