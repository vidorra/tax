import type { Bron, TaxYearParams } from '../types'
import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'
import kinderbijslag from './data/kinderbijslag.json'
import kotTabel from './data/kot-tabel-2027.json'

/**
 * Belastingjaar 2028: CONCEPT (draft), afgeleid van 2027 met scripts/tax-derive.ts en daarna
 * met de hand aangevuld met wat al bekend is: Belastingplan 2027 artikel II (tarieven 2028,
 * toptariefgrens +1.166, startersaftrek en specifieke zorgkosten vervallen, youngtimer 20 jaar),
 * het nieuwe box 3-stelsel (Wet werkelijk rendement box 3 met novelle), zelfstandigenaftrek 900,
 * IACK-verlaging, KGB-afbouw 8,50% en 12,80%, AOW-leeftijd 67 jaar en 3 maanden.
 * Indexatie: tcf 1.025, toegepast deel 0.122, schijf 1-factor 0.75, beleidsmatig toptariefgrens 1166.
 * Status: geschat, behalve waar een voorstel of de wet het bedrag al noemt. Handmatig nalopen:
 *  - heffingskortingen.iack.max: wettelijke verlaging (320 per jaar, prijspeil 2023) handmatig verwerken
 *  - inkomensvoorziening.lijfrente.franchise: volgt AOW, handmatig (AOW-uitkering gehuwden × 100/75)
 *  - inkomensvoorziening.lijfrente.inkomensgrens: controleer bevriezing of indexatie
 *  - box2.gebruikelijkLoonNorm: volgt de Nieuwsbrief Loonheffingen
 *  - box3.forfaitBank / forfaitSchulden / forfaitOverig: volgen de Belastingdienst (september en februari)
 *  - toeslagen: KOT-tabel, uurprijzen, KGB, zorgtoeslag en vermogensgrens wachten op het KOT-besluit en de SZW/VWS-begroting
 */

const BP2027: Bron = {
  titel: 'Wetsvoorstel Belastingplan 2027, artikel II (wijzigingen per 1 januari 2028)',
  url: 'https://www.rijksfinancien.nl/sites/default/files/bestanden/belastingplan-2027/wetsvoorstel-belastingplan-2027/Wetsvoorstel-Belastingplan-2027.pdf',
  datum: '2026-09-15',
}
const BOX3_2028: Bron = {
  titel: 'Wet werkelijk rendement box 3 (36748) en novelle van 29 september 2026',
  url: 'https://www.taxence.nl/nieuws/kabinet-kiest-in-box-3-grotendeels-voor-vermogenswinstbelasting/',
  datum: '2026-09-29',
}

const params2028: TaxYearParams = {
  jaar: 2028,
  status: 'geschat',
  bijgewerkt: '2026-10-05',
  changelog: [
    {
      datum: '2026-10-04',
      wat: 'Skelet afgeleid van 2027 met tax-derive: bedragen × 1.00305 (tcf 1.025 aangenomen, toegepast deel 0.122), grens schijf 1 × 1.00229, toptariefgrens +1166',
    },
    {
      datum: '2026-10-04',
      wat: 'Handmatig aangevuld: tarieven 8,49% en 38,12%, startersaftrek 0, zorgkosten vervallen, youngtimer 20, box 3 nieuw stelsel, IACK-verlaging, KGB-afbouw 2028, AOW-leeftijd 67 jaar en 3 maanden',
      bron: BP2027,
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
      wat: 'Ronde 2 (contract): nieuwe velden hir.langlopendVanafJaren, arbeidsbeloningPartnerMin, tbsVrijstellingPct, auto.youngtimerOvergang, auto.btwPrive, stakingslijfrenteRegels, eigenWoning.reserveTermijnJaren, box2.verliesverrekening, box2.belastingkorting, overig.aanslagRendementsgrondslag (38479), overig.belastingrenteRegels en overig.invordering',
      bron: { titel: 'Wet IB 2001 art. 3.16 lid 4, 3.54, 3.99b, 3.119aa, 3.129, 4.49, 4.53 en 9.4; AWR art. 30f-30fe; Invorderingswet 1990 art. 9; Belastingdienst, btw en privégebruik auto van de zaak', url: 'https://wetten.overheid.nl/BWBR0011353/2028-01-01', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'arbeidsbeloningPartnerMin weer weggehaald: de drempel van art. 3.16 lid 4 staat alleen in ondernemer.meewerkaftrek.maxVergoeding (één veld voor dezelfde drempel); auto.youngtimerOvergang krijgt de vorm { terBeschikkingUiterlijk, youngtimerOp, oudeLeeftijd }: het overgangsrecht geldt alleen voor een auto die op 31-12-2025 al youngtimer was; youngtimerOvergang 2028 blijft als schatting staan (zelfde voorwaarden als 2027); of het overgangsrecht in 2028 doorloopt, is niet duidelijk en moet worden nagekeken',
      bron: { titel: 'Toets ronde 2 (fiscaal): besluit 12-2-2026 nr. 2026-2493 (Stcrt. 20-2-2026); Wet IB 2001 art. 3.16 lid 4, 9.4 en 10.1; SRA, belastingrente 2026; ECB-persbericht 10-9-2026', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (na de nacontrole): overig.belastingrenteRegels.navorderingVerzoekMaxWeken 12 toegevoegd: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt de belastingrente uiterlijk 12 weken na ontvangst van het verzoek, ongewijzigd ten opzichte van 2026 aangenomen',
      bron: { titel: 'AWR art. 30fc lid 5', url: 'https://wetten.overheid.nl/BWBR0002320/2026-01-01#HoofdstukV_Afdeling3_Artikel30fc', datum: '2026-10-05' },
    },
  ],
  indexatie: { tcf: 1.025, toegepastDeel: 0.122, schijf1Factor: 0.75, beleidsmatigToptariefgrens: 1166 },
  varianten: [],
  box1: {
    status: 'geschat',
    bron: BP2027,
    veldStatus: { verliesverrekening: 'definitief' },
    toelichting:
      'Tarieven volgens BP2027 art. II: eerste schijf 0,09 punt lager (8,49% belasting), tweede schijf 0,04 punt lager (38,12%); toptariefgrens 2027-grens × indexatie + 1.166. De grenzen hangen af van de tabelcorrectiefactor 2028 (hier 1,025 aangenomen) en zijn daarom geschat.',
    waarde: {
      schijven: [
        { tot: 39337, tarief: 0.3614, belastingDeel: 0.0849 },
        { tot: 79831, tarief: 0.3812, belastingDeel: 0.3812 },
        { tot: null, tarief: 0.495, belastingDeel: 0.495 },
      ],
      premies: { aow: 0.179, anw: 0.001, wlz: 0.0965 },
      schijf1TotGeborenVoor1946: 41732,
      aftrekTariefMax: 0.3812,
      tariefmaatregelPosten: ['ondernemersaftrek', 'mkb', 'eigenWoning', 'pga'],
      verliesverrekening: { terug: 3, vooruit: 9 },
    },
  },
  heffingskortingen: {
    status: 'geschat',
    toelichting:
      'Bedragen 2027 × 1,00305; afbouw algemene heffingskorting zo gekozen dat die bij de toptariefgrens nul is. IACK-maximum: 2.927 (2.918 geïndexeerd) min de wettelijke verlaging van 320 (prijspeil 2023) × 1,14256 = 366, dus 2.561. Heffingskorting groen beleggen vervalt met de groenvrijstelling. De contourennota herziening IB-stelsel (eind 2026) kan minder heffingskortingen vanaf 2028 brengen.',
    waarde: {
      algemeen: {
        max: 3164,
        afbouwVanaf: 31004,
        afbouwPct: 0.0648,
        grondslag: 'verzamelinkomen',
        aowMax: 1601,
        aowAfbouwPct: 0.03358,
      },
      arbeid: {
        opbouw: [
          { tot: 12476, basis: 0, pct: 0.09503 },
          { tot: 26948, basis: 1186, pct: 0.30205 },
          { tot: 47980, basis: 5557, pct: 0.01855 },
        ],
        max: 5947,
        afbouwVanaf: 47980,
        afbouwPct: 0.0651,
      },
      arbeidAow: {
        opbouw: [
          { tot: 12476, basis: 0, pct: 0.04752 },
          { tot: 26948, basis: 593, pct: 0.15082 },
          { tot: 47980, basis: 2775, pct: 0.0093 },
        ],
        max: 2971,
        afbouwVanaf: 47980,
        afbouwPct: 0.0325,
      },
      iack: {
        pct: 0.1145,
        drempel: 6335,
        max: 2561,
        maxLeeftijdKind: 12,
        minMaandenHuishouden: 6,
        coOuderMinDagen: 156,
        actief: true,
      },
      ouderen: { max: 1999, grens: 46719, afbouwPct: 0.15, alleenstaand: 549 },
      jonggehandicapt: 938,
      groenBeleggen: { pct: 0, max: null },
      uitbetalingMinstverdienende: { geborenVoor: '1963-01-01', pct: 0 },
    },
  },
  ondernemer: {
    status: 'geschat',
    bron: BP2027,
    veldStatus: { zelfstandigenaftrek: 'definitief', startersaftrek: 'voorstel', startersaftrekAO: 'voorstel', afschrijving: 'voorstel', mkbWinstvrijstelling: 'definitief', urencriterium: 'definitief' },
    toelichting:
      'Zelfstandigenaftrek 900 (wet). Startersaftrek vervalt (BP2027 art. II, onderdeel C); startersaftrek bij arbeidsongeschiktheid bestaat nog tot 2029. Willekeurige afschrijving voor starters vervalt per 2028. Stakingsaftrek 908 en meewerkaftrek op 25% van de oude staffel tot ze per 2030 vervallen. Youngtimergrens 20 jaar. Overige bedragen geschat.',
    waarde: {
      urencriterium: {
        uren: 1225,
        grotendeelsPct: 0.5,
        startersVrijstellingJaren: 5,
        zwangerschapWeken: 16,
        verlaagdAO: 800,
      },
      zelfstandigenaftrek: 900,
      aowFactor: 0.5,
      startersaftrek: 0,
      startersaftrekMaxKeer: 3,
      startersaftrekBinnenJaren: 5,
      startersaftrekAO: { staffel: [12000, 8000, 4000], actief: true },
      soAftrek: { basis: 16227, starters: 8121, minUren: 500 },
      meewerkaftrek: {
        staffel: [
          { vanafUren: 525, pct: 0.003125 },
          { vanafUren: 875, pct: 0.005 },
          { vanafUren: 1225, pct: 0.0075 },
          { vanafUren: 1750, pct: 0.01 },
        ],
        maxVergoeding: 5000,
        actief: true,
      },
      stakingsaftrek: 908,
      tbsVrijstellingPct: 0.12,
      mkbWinstvrijstelling: 0.127,
      beperktAftrekbaar: { drempel: 5700, aftrekbaarDeel: 0.8 },
      kia: {
        minPerBedrijfsmiddel: 450,
        ondergrens: 2900,
        pct: 0.28,
        pctTot: 72799,
        vastBedrag: 20384,
        vastTot: 134813,
        afbouwPct: 0.0756,
        nulBoven: 404443,
      },
      desinvestering: { drempel: 2900, jaren: 5 },
      eia: { pct: 0.455, minPerBedrijfsmiddel: 2500, meldTermijnMaanden: 3 },
      mia: { pcts: [0.27, 0.36, 0.45], minPerBedrijfsmiddel: 2500 },
      vamil: { pct: 0.75 },
      afschrijving: {
        maxPctPerJaar: 0.2,
        goodwillPct: 0.1,
        directAftrekbaarTot: 450,
        bodemwaardeGebouwEigenGebruik: 1,
        willekeurigStarters: false,
      },
      hir: { termijnJaren: 3, langlopendVanafJaren: 10 },
      kilometerTariefPrivevervoer: 0.25,
      auto: {
        bijtellingAlgemeen: 0.22,
        bijtellingNulEmissiePerToelatingsjaar: BIJTELLING_NUL_EMISSIE,
        youngtimerPct: 0.35,
        youngtimerLeeftijd: 20,
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
      werkruimte: {
        zelfstandigheidsEis: true,
        inkomensEisMetWerkplekElders: [0.7, 0.3],
        inkomensEisZonderWerkplekElders: 0.3,
      },
      nietBenutteZelfstandigenaftrekJaren: 9,
    },
  },
  inkomensvoorziening: {
    status: 'geschat',
    veldStatus: { nettolijfrente: 'definitief' },
    toelichting:
      'Franchise volgt de AOW-uitkering en moet handmatig worden bijgewerkt (nu de schatting voor 2027). Aftoppingsgrens 137.800 bevroren tot en met 2032 (voorstel). Factor A blijft in de params toegestaan: voor jaarruimte 2028 (inkomen 2027) mag 6,27 × factor A nog voor regelingen die in 2027 niet onder de Wtp vielen; vanaf jaarruimte 2029 alleen de Wtp-premie. Bedrag ineens vanaf 1-1-2029; verplichte AOV (BAZ) niet vóór 2030.',
    waarde: {
      lijfrente: {
        regime: 'wtp',
        pct: 0.3,
        franchise: 19650,
        inkomensgrens: 137800,
        maxJaarruimte: 35445,
        maxReserveringsruimte: 43419,
        reserveringsruimtePctGrondslag: null,
        terugkijkJaren: 10,
        factorA: { toegestaan: true, factor: 6.27 },
        maxJarenNaAOW: 5,
        saldomethodeMax: 2269,
      },
      stakingslijfrente: { hoog: 583816, midden: 291920, laag: 145970 },
      stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: 5, middenBinnenJarenVoorAow: 15, arbeidsongeschiktMinPct: 0.45, betaaltermijnMaanden: 6 },
      uitkering: {
        afkoopKleineLijfrente: 5599,
        afkoopAOMax: 52241,
        tijdelijkeOudedagslijfrenteMax: 27615,
        revisierentePct: 0.2,
        bedragIneens: { vanaf: '2029-01-01', pct: 0.1 },
      },
      nettolijfrente: { actief: true },
      baz: { actief: false, pct: 0.054, maxPremiePerMaand: 177, wachttijdWeken: 104 },
    },
  },
  eigenWoning: {
    status: 'geschat',
    veldStatus: { hillenPct: 'definitief', hillenStap: 'definitief' },
    toelichting: 'Hillen-aftrek 62,267% volgt het wettelijke afbouwpad (4,8 punt per jaar). Forfaitgrens en vrijstelling geschat.',
    waarde: {
      forfait: [
        { tot: 12500, pct: 0 },
        { tot: 25000, pct: 0.001 },
        { tot: 50000, pct: 0.002 },
        { tot: 75000, pct: 0.0025 },
        { tot: 1360000, pct: 0.0035 },
        { tot: null, pct: 0.0235, vast: 4760 },
      ],
      hillenPct: 0.62267,
      hillenStap: 0.048,
      aflossingseisVanaf: '2013-01-01',
      maxAftrekJaren: 30,
      aftrekTermijnStartUiterlijk: '2001-01-01',
      kewVrijstelling: 210500,
      wozPeildatum: 'vorigJaar',
      reserveTermijnJaren: 3,
    },
  },
  box2: {
    status: 'geschat',
    toelichting: 'Afgeleid van 2027 met tax-derive (status geschat).',
    waarde: {
      schijven: [{ tot: 69819, tarief: 0.245 }, { tot: null, tarief: 0.31 }],
      grensPerPersoon: true,
      gebruikelijkLoonNorm: 59000,
      dividendbelasting: 0.15,
      excessiefLenen: { grens: 500000 },
      verliesverrekening: { terug: 1, vooruit: 6, oudeVerliezen: { totEnMetJaar: 2018, vooruit: 9 } },
      belastingkorting: { jarenNaEerste: 7, uiterlijkJarenNaVerlies: 9 },
    },
  },
  box3: {
    status: 'voorstel',
    bron: BOX3_2028,
    veldStatus: { schuldendrempel: 'geschat', vrijstellingen: 'geschat', forfaitBank: 'geschat', forfaitOverig: 'geschat', forfaitSchulden: 'geschat', dac8Rapportage: 'definitief' },
    toelichting:
      'Nieuw stelsel per 2028 (Wet werkelijk rendement box 3, Tweede Kamer 12-2-2026, novelle 29-9-2026, Eerste Kamer nog niet): werkelijk rendement op banktegoeden, vermogenswinst bij verkoop voor financiële instrumenten en vastgoed, vermogensaanwas voor crypto (tot 2030), heffingsvrij resultaat 1.000, verliesverrekening boven 500. Geen heffingsvrij vermogen en geen tegenbewijsregeling meer (die loopt tot en met 2027). De forfaitvelden zijn alleen ter vergelijking gevuld met de waarden van 2027. Groenvrijstelling vervalt.',
    waarde: {
      regime: 'werkelijkRendement',
      tarief: 0.36,
      heffingsvrijVermogen: 0,
      schuldendrempel: 3800,
      forfaitBank: 0.0127,
      forfaitOverig: 0.0637,
      forfaitSchulden: 0.0285,
      vrijstellingen: { groen: 0, contant: 682, uitvaart: 9042, nettolijfrente: true },
      tegenbewijs: { beschikbaar: false, kanaal: 'geen', eigenGebruikPct: 0 },
      arbitrageMaanden: 3,
      bronbelastingMaxPct: 0.15,
      dac8Rapportage: true,
      regime2028: {
        perCategorie: { bank: 'werkelijkRendement', financieelInstrument: 'vermogenswinst', crypto: 'vermogensaanwas', onroerend: 'vermogenswinst' },
        heffingsvrijResultaat: 1000,
        verliesdrempel: 500,
      },
    },
  },
  zvw: {
    status: 'geschat',
    toelichting: 'Afgeleid van 2027 met tax-derive (status geschat).',
    waarde: { pctOndernemer: 0.0502, pctWerkgever: 0.0627, maxBijdrageInkomen: 82547 },
  },
  pga: {
    status: 'geschat',
    bron: BP2027,
    veldStatus: { zorgkosten: 'voorstel' },
    toelichting: 'Aftrek specifieke zorgkosten vervalt per 2028 (BP2027 art. II, onderdeel G); de drempelbedragen blijven alleen ter vergelijking staan.',
    waarde: {
      giften: {
        drempelPct: 0.01,
        drempelMin: 60,
        maxPct: 0.1,
        periodiekMax: 1500000,
        cultureelMultiplier: 1.25,
        cultureelMaxExtra: 1250,
        naturaGrens: 10000,
      },
      zorgkosten: {
        actief: false,
        drempelMinPP: 169,
        drempelMinTotInkomen: 9831,
        pctLaag: 0.0165,
        grensHoog: 52212,
        vastHoog: 861,
        pctHoog: 0.0575,
        verhogingPct: 0.4,
        verhogingPctAow: 1.13,
        verhogingTotInkomen: 41732,
      },
      scholing: { actief: false, drempel: 250, max: 15000 },
      alimentatie: true,
    },
  },
  loon: {
    status: 'geschat',
    toelichting: 'Afgeleid van 2027 met tax-derive (status geschat).',
    waarde: {
      reisaftrek: {
        tabel: [
          { vanafKm: 10, bedrag: 583 },
          { vanafKm: 15, bedrag: 773 },
          { vanafKm: 20, bedrag: 1288 },
          { vanafKm: 30, bedrag: 1597 },
          { vanafKm: 40, bedrag: 2079 },
          { vanafKm: 50, bedrag: 2314 },
          { vanafKm: 60, bedrag: 2567 },
          { vanafKm: 70, bedrag: 2655 },
          { vanafKm: 80, bedrag: 2690 },
        ],
        kmBedrag: 0.29,
        max: 2690,
      },
    },
  },
  toeslagen: {
    status: 'geschat',
    toelichting:
      'KOT blijft in 2028 een toeslag (directe financiering gepland per 2029); tabel en uurprijzen van 2027 aangehouden. KGB-afbouw 2028 volgens raming 36923: 8,50% en vanaf 63.156 12,80%; eerste afbouwpunt WML-afhankelijk (2027 × 1,02 geschat). Kinderbijslag: bedragen tweede helft 2027 aangehouden.',
    waarde: {
      vermogensgrens: { alleen: 119122, metPartner: 158748 },
      kot: {
        regime: 'toeslag',
        maxUurprijs: { dagopvang: 11.6, bso: 10.31, gastouder: 8.77 },
        maxUrenPerMaand: 230,
        tabel: kotTabel.rijen,
        terugwerkendeMaanden: 3,
      },
      kgb: {
        maxPerKind: { tot12: 2653, van12: 729, van16: 976 },
        aloKop: 3505,
        afbouw: [
          { vanafAlleen: 31528, vanafPaar: 41371, pct: 0.085 },
          { vanafAlleen: 63156, vanafPaar: 63156, pct: 0.128 },
        ],
      },
      kinderbijslag: kinderbijslag['2028'],
      zorgtoeslag: {
        standaardpremie: 2271,
        drempelinkomen: 30910,
        afbouwPct: 0.1373,
        maxAlleen: 1680,
        maxPaar: 3223,
        grensAlleen: 42950,
        grensPaar: 54150,
      },
    },
  },
  arbeidsrelatie: {
    status: 'geschat',
    toelichting: 'Zelfstandigenwet (zelfstandigentoets, ten minste drie opdrachtgevers in twee jaar) beoogd per 1-1-2028; consultatie oktober 2026. Rechtsvermoeden-uurtarief geïndexeerd met het minimumloon (bedrag geschat).',
    waarde: {
      handhaving: { regime: 'regulier', verzuimboetes: true, vergrijpboetes: true },
      rechtsvermoedenUurtarief: { actiefVanaf: '2026-12-31', drempel: 38 },
      modelovereenkomstenGeldigTot: '2029-12-31',
      zelfstandigenwet: { actief: true, minOpdrachtgevers: 3, toetsJaren: 2 },
      concentratieWaarschuwingPct: 0.7,
    },
  },
  schenken: {
    status: 'geschat',
    toelichting: 'Afgeleid van 2027 met tax-derive (status geschat).',
    waarde: { kindJaarlijks: 7015, kindEenmalig: 33644, kindStudie: 70083, overig: 2812 },
  },
  overig: {
    status: 'geschat',
    veldStatus: { aowLeeftijd: 'definitief' },
    toelichting: 'AOW-leeftijd 2028 t/m 2031: 67 jaar en 3 maanden. Belastingrente en aanslaggrens geschat; pseudo-eindheffing 12% en innovatiebox-forfait 100.000 volgen het Belastingplan 2027.',
    waarde: {
      belastingrenteIB: 0.055,
      belastingrenteVpb: 0.055,
      aanslaggrens: 60,
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
      innovatiebox: { tarief: 0.09, forfaitPct: 0.25, forfaitMax: 100000 },
      pseudoEindheffingFossieleAuto: 0.12,
      aowLeeftijd: { jaren: 67, maanden: 3 },
    },
  },
}

export default params2028
