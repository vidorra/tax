import type { Bron, TaxYearParams } from '../types'
import { BIJTELLING_NUL_EMISSIE } from './data/bijtelling'
import kinderbijslag from './data/kinderbijslag.json'
import kotTabel from './data/kot-tabel-2027.json'

/**
 * Belastingjaar 2027 (lopend wetgevingstraject). Basis is het wetsvoorstel Belastingplan 2027
 * (sleuteltabel, Prinsjesdag 15 september 2026). Status per veld: wat al wet is (zelfstandigen-
 * aftrek 900, MKB 12,7%, Hillen 67,067%, groenvrijstelling 200, KGB-afbouw 8,05%) staat op
 * definitief; schijven, kortingen en box 2 zijn voorstel; bedragen die pas met de
 * bijstellingsregeling van december bekend worden zijn geschat met de beperkte indexatie
 * 1,01248 (48% van de tabelcorrectiefactor 1,026).
 *
 * Variant 'brief-29-09' volgt de Kamerbrief van 29 september 2026 (nota van wijziging en
 * novelle): hogere toptariefgrens, kleinere verhoging arbeidskorting, box 2 29,2%, excessief
 * lenen 420.000 en een strenger box 3.
 *
 * Onderhoud: KOT-besluit half oktober 2026, WML en Zvw in november, Tweede Kamer 12 november,
 * Eerste Kamer 15 december 2026, definitieve box 3-forfaits begin 2028.
 */

const BP2027: Bron = {
  titel: 'Wetsvoorstel Belastingplan 2027 met memorie van toelichting (tabellen 1 en 2)',
  url: 'https://www.rijksfinancien.nl/sites/default/files/bestanden/belastingplan-2027/wetsvoorstel-belastingplan-2027/Wetsvoorstel-Belastingplan-2027.pdf',
  datum: '2026-09-15',
}
const BRIEF_29_09: Bron = {
  titel: 'Kamerbrief 29 september 2026: aanvullende maatregelen Belastingplan 2027 en novelle box 3',
  url: 'https://www.forvismazars.com/nl/nl/wie-zijn-wij/nieuws-events-en-publicaties/nieuws/aanvullende-maatregelen-belastingplan-2027',
  datum: '2026-09-29',
}
const ONDERNEMERSPLEIN: Bron = {
  titel: 'Ondernemersplein, wetswijzigingen IB 2027 (zelfstandigenaftrek 900 al wet; stakings- en meewerkaftrek -75% via wetsvoorstel start-ups en scale-ups)',
  url: 'https://ondernemersplein.overheid.nl/wetswijzigingen/',
  datum: '2026-09-16',
}
const VWS_2027: Bron = {
  titel: 'Begroting VWS 2027: raming Zvw-bijdrage 5,02% en maximum bijdrage-inkomen 82.547',
  datum: '2026-09-15',
}
const BOX3_VA_2027: Bron = {
  titel: 'Eerste inschatting forfaits box 3 2027 (bank 1,27%, schulden 2,85%)',
  url: 'https://fiscalert.nl/belastingen/artikelen/box-3-percentages-voor-voorlopige-aanslag-2027-bekend/',
  datum: '2026-09-16',
}
const KOT_2027: Bron = {
  titel: 'Gewijzigd ontwerpbesluit kinderopvangtoeslag 2027 (voorhang tot 13 oktober 2026); tabel via kinderopvang-wijzer.nl',
  url: 'https://www.kinderopvang-wijzer.nl/info/kinderopvangtoeslag-tabel-2027/',
  datum: '2026-10-04',
}
const SZW_2027: Bron = {
  titel: 'Tweede nota van wijziging wetsvoorstel 36923 (kindgebonden budget en kinderbijslag) en SZW-begroting 2027',
  url: 'https://www.eerstekamer.nl/behandeling/20260917/nota_van_wijziging_tweede_nota_van/document3/f=/vn0zmz4cg0yw.pdf',
  datum: '2026-09-17',
}
const VERMOGENSTOETS_2027: Bron = {
  titel: 'Wetsvoorstel 36932 vereenvoudiging toeslagen (vermogensgrenzen 2027)',
  url: 'https://www.eerstekamer.nl/wetsvoorstel/36932_wet_vereenvoudiging',
  datum: '2026-09-15',
}

const params2027: TaxYearParams = {
  jaar: 2027,
  status: 'geschat',
  bijgewerkt: '2026-10-05',
  changelog: [
    { datum: '2026-09-15', wat: 'Prinsjesdag: wetsvoorstel Belastingplan 2027 (indexatie 48%, schijf 2 bevroren op 78.426, tarieven 36,23% en 38,16%, arbeidskorting +173, startersaftrek 10, EIA 45,5%)', bron: BP2027 },
    { datum: '2026-09-16', wat: 'Ontwerpbesluit kinderopvangtoeslag 2027 in voorhang: maximum uurprijzen 11,60 / 10,31 / 8,77 en voorlopige tabel', bron: KOT_2027 },
    { datum: '2026-09-17', wat: 'Tweede nota van wijziging 36923: KGB 2.653 per kind, tweede afbouwpunt 61.917 met 9,95%, kinderbijslag circa 321,89', bron: SZW_2027 },
    { datum: '2026-09-29', wat: 'Brief 29 september 2026 als variant opgenomen (toptariefgrens 80.578, arbeidskorting +133, box 2 29,2%, box 3 30.846 en 7,87%)', bron: BRIEF_29_09 },
    { datum: '2026-10-04', wat: 'Jaarmodule aangemaakt met status per veld; KIA, drempels, franchise en vrijstellingen geschat met 1,01248' },
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
      bron: { titel: 'Wet IB 2001 art. 3.16 lid 4, 3.54, 3.99b, 3.119aa, 3.129, 4.49, 4.53 en 9.4; AWR art. 30f-30fe; Invorderingswet 1990 art. 9; Belastingdienst, btw en privégebruik auto van de zaak', url: 'https://wetten.overheid.nl/BWBR0011353/2027-01-01', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'arbeidsbeloningPartnerMin weer weggehaald: de drempel van art. 3.16 lid 4 staat alleen in ondernemer.meewerkaftrek.maxVergoeding (één veld voor dezelfde drempel); auto.youngtimerOvergang krijgt de vorm { terBeschikkingUiterlijk, youngtimerOp, oudeLeeftijd }: het overgangsrecht geldt alleen voor een auto die op 31-12-2025 al youngtimer was; overig.aanslaggrens 59 wordt 58 en overig.aanslagRendementsgrondslag 38479 wordt 38959: beide geschat als het bedrag van 2026 × 1,01248, naar beneden afgerond, zoals de indexatie van eerdere jaren; toelichting belastingrente: peilmoment is de laatste ECB-rente voor basisherfinancieringstransacties die vóór 1 november van het voorafgaande jaar is gepubliceerd (2,65% per 16-9-2026), plus 3 punt, afgerond op halve procenten, minimaal 4,5% en hooguit 2 punt verschil met het lopende percentage: 5,5% (geschat)',
      bron: { titel: 'Toets ronde 2 (fiscaal): besluit 12-2-2026 nr. 2026-2493 (Stcrt. 20-2-2026); Wet IB 2001 art. 3.16 lid 4, 9.4 en 10.1; SRA, belastingrente 2026; ECB-persbericht 10-9-2026', datum: '2026-10-05' },
    },
    {
      datum: '2026-10-05',
      wat: 'Ronde 2 (na de nacontrole): overig.belastingrenteRegels.navorderingVerzoekMaxWeken 12 toegevoegd: bij een navorderingsaanslag naar aanleiding van een verzoek eindigt de belastingrente uiterlijk 12 weken na ontvangst van het verzoek, ongewijzigd ten opzichte van 2026 aangenomen',
      bron: { titel: 'AWR art. 30fc lid 5', url: 'https://wetten.overheid.nl/BWBR0002320/2026-01-01#HoofdstukV_Afdeling3_Artikel30fc', datum: '2026-10-05' },
    },
  ],
  indexatie: { tcf: 1.026, toegepastDeel: 0.48, schijf1Factor: 0.75, beleidsmatigToptariefgrens: -979 },
  varianten: [
    {
      id: 'brief-29-09',
      label: 'Brief 29 september 2026',
      status: 'voorstel',
      bron: BRIEF_29_09,
      toelichting:
        'Nota van wijziging en novelle van 29 september 2026: toptariefgrens 80.578 in plaats van 78.426; verhoging arbeidskorting 133 in plaats van 173 (alle drie de knikbedragen 40 lager, maximum circa 5.889; het eerste opbouwpercentage daalt mee, de andere blijven gelijk); afbouw algemene heffingskorting circa 6,35% zodat die bij 80.578 op nul uitkomt; hoog box 2-tarief 29,2% (2027 t/m 2030); excessief lenen 420.000 (daarna 80.000 per jaar lager tot 100.000 in 2031); box 3 heffingsvrij vermogen 30.846 en forfait overige bezittingen 7,87%.',
      pas: (p: TaxYearParams): TaxYearParams => {
        const verschilArbeidskorting = 40 // 173 − 133
        const toptariefgrens = 80578
        const schijven = p.box1.waarde.schijven
        schijven[schijven.length - 2].tot = toptariefgrens

        const ahk = p.heffingskortingen.waarde.algemeen
        ahk.afbouwPct = 0.0635 // 3.154 / (80.578 − 30.910) = 6,3502%

        const ak = p.heffingskortingen.waarde.arbeid
        const [t1, t2, t3] = ak.opbouw
        t1.pct = Math.round(((t2.basis - verschilArbeidskorting) / t1.tot) * 1e5) / 1e5
        t2.basis -= verschilArbeidskorting
        t3.basis -= verschilArbeidskorting
        ak.max -= verschilArbeidskorting

        const b2 = p.box2.waarde
        b2.schijven[b2.schijven.length - 1].tarief = 0.292
        b2.excessiefLenen.grens = 420000

        p.box3.waarde.heffingsvrijVermogen = 30846
        p.box3.waarde.forfaitOverig = 0.0787

        p.changelog = [
          ...p.changelog,
          { datum: '2026-09-29', wat: 'Variant brief 29 september 2026 toegepast', bron: BRIEF_29_09 },
        ]
        return p
      },
    },
  ],

  box1: {
    status: 'voorstel',
    bron: BP2027,
    veldStatus: { premies: 'voorlopig', verliesverrekening: 'definitief', tariefmaatregelPosten: 'definitief' },
    toelichting:
      'Grens schijf 1 geïndexeerd met 1,00936 (75% van 1,01248); toptariefgrens bevroren op 78.426 door een beleidsmatige verlaging van 979. Premiepercentages volgen uit de SZW-regeling van december (voorlopig).',
    waarde: {
      schijven: [
        { tot: 39247, tarief: 0.3623, belastingDeel: 0.0858 },
        { tot: 78426, tarief: 0.3816, belastingDeel: 0.3816 },
        { tot: null, tarief: 0.495, belastingDeel: 0.495 },
      ],
      premies: { aow: 0.179, anw: 0.001, wlz: 0.0965 },
      schijf1TotGeborenVoor1946: 41637,
      aftrekTariefMax: 0.3816,
      tariefmaatregelPosten: ['ondernemersaftrek', 'mkb', 'eigenWoning', 'pga'],
      verliesverrekening: { terug: 3, vooruit: 9 },
    },
  },

  heffingskortingen: {
    status: 'voorstel',
    bron: BP2027,
    veldStatus: { arbeidAow: 'geschat', groenBeleggen: 'definitief', uitbetalingMinstverdienende: 'definitief' },
    toelichting:
      'Afbouwpunten van algemene heffingskorting en arbeidskorting hangen af van het minimumloon (november). Knikbedragen arbeidskorting 1.182 / 5.540 / 5.929 uit de MvT; de inkomensgrenzen 12.438 en 26.866 zijn WML-afhankelijk. Arbeidskorting AOW geschat op de verhouding van 2026 (circa 50%). IACK: wettelijke verlaging van het maximum met 134 (prijspeil 2023) is definitief, de bedragen zijn voorstel; daarna 320 per jaar tot het artikel vervalt per 2035. Heffingskorting groen beleggen 0,1% van de vrijstelling van 200, maximaal 2.',
    waarde: {
      algemeen: { max: 3154, afbouwVanaf: 30910, afbouwPct: 0.06638, grondslag: 'verzamelinkomen', aowMax: 1596, aowAfbouwPct: 0.03358 },
      arbeid: {
        opbouw: [
          { tot: 12438, basis: 0, pct: 0.09503 },
          { tot: 26866, basis: 1182, pct: 0.30205 },
          { tot: 47834, basis: 5540, pct: 0.01855 },
        ],
        max: 5929,
        afbouwVanaf: 47834,
        afbouwPct: 0.0651,
      },
      // Geschat: 2027-knikbedragen × verhouding AOW/niet-AOW van 2026 (498/996, 2.647/5.300, 2.840/5.685).
      arbeidAow: {
        opbouw: [
          { tot: 12438, basis: 0, pct: 0.04752 },
          { tot: 26866, basis: 591, pct: 0.15082 },
          { tot: 47834, basis: 2767, pct: 0.0093 },
        ],
        max: 2962,
        afbouwVanaf: 47834,
        afbouwPct: 0.0325,
      },
      iack: { pct: 0.1145, drempel: 6316, max: 2918, maxLeeftijdKind: 12, minMaandenHuishouden: 6, coOuderMinDagen: 156, actief: true },
      ouderen: { max: 1993, grens: 46577, afbouwPct: 0.15, alleenstaand: 547 },
      jonggehandicapt: 935,
      groenBeleggen: { pct: 0.001, max: 2 },
      uitbetalingMinstverdienende: { geborenVoor: '1963-01-01', pct: 0 },
    },
  },

  ondernemer: {
    status: 'voorstel',
    bron: BP2027,
    veldStatus: {
      urencriterium: 'definitief',
      zelfstandigenaftrek: 'definitief',
      aowFactor: 'definitief',
      startersaftrekMaxKeer: 'definitief',
      startersaftrekBinnenJaren: 'definitief',
      soAftrek: 'geschat',
      mkbWinstvrijstelling: 'definitief',
      beperktAftrekbaar: 'geschat',
      kia: 'geschat',
      desinvestering: 'geschat',
      mia: 'definitief',
      vamil: 'definitief',
      hir: 'definitief',
      for: 'definitief',
      werkruimte: 'definitief',
      nietBenutteZelfstandigenaftrekJaren: 'definitief',
    },
    veldBron: { zelfstandigenaftrek: ONDERNEMERSPLEIN, stakingsaftrek: ONDERNEMERSPLEIN, meewerkaftrek: ONDERNEMERSPLEIN },
    toelichting:
      'Zelfstandigenaftrek 900 staat sinds Belastingplan 2023 in de wet. Startersaftrek 10 (2028: vervalt), EIA 45,5%, youngtimer 17 jaar en kilometertarief 0,25 via Belastingplan 2027. Stakingsaftrek 908 en meewerkaftrek met 75% verlaagd via het wetsvoorstel Fiscale stimulering start-ups en scale-ups (beide nul per 2030). Willekeurige afschrijving starters vervalt per 2028. KIA, S&O-aftrek, drempel gemengde kosten en desinvesteringsdrempel geschat met 1,01248 (drempels afgerond op honderdtallen); de KIA-versobering uit de Voorjaarsnota 2026 is geschrapt.',
    waarde: {
      urencriterium: { uren: 1225, grotendeelsPct: 0.5, startersVrijstellingJaren: 5, zwangerschapWeken: 16, verlaagdAO: 800 },
      zelfstandigenaftrek: 900,
      aowFactor: 0.5,
      startersaftrek: 10,
      startersaftrekMaxKeer: 3,
      startersaftrekBinnenJaren: 5,
      startersaftrekAO: { staffel: [12000, 8000, 4000], actief: true },
      soAftrek: { basis: 16178, starters: 8096, minUren: 500 },
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
      kia: { minPerBedrijfsmiddel: 450, ondergrens: 2900, pct: 0.28, pctTot: 72578, vastBedrag: 20322, vastTot: 134403, afbouwPct: 0.0756, nulBoven: 403206 },
      desinvestering: { drempel: 2900, jaren: 5 },
      eia: { pct: 0.455, minPerBedrijfsmiddel: 2500, meldTermijnMaanden: 3 },
      mia: { pcts: [0.27, 0.36, 0.45], minPerBedrijfsmiddel: 2500 },
      vamil: { pct: 0.75 },
      afschrijving: { maxPctPerJaar: 0.2, goodwillPct: 0.1, directAftrekbaarTot: 450, bodemwaardeGebouwEigenGebruik: 1, willekeurigStarters: true },
      hir: { termijnJaren: 3, langlopendVanafJaren: 10 },
      kilometerTariefPrivevervoer: 0.25,
      auto: {
        bijtellingAlgemeen: 0.22,
        bijtellingNulEmissiePerToelatingsjaar: BIJTELLING_NUL_EMISSIE,
        youngtimerPct: 0.35,
        youngtimerLeeftijd: 17,
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
    status: 'voorstel',
    bron: BP2027,
    veldStatus: { lijfrente: 'geschat', stakingslijfrente: 'geschat', uitkering: 'geschat', nettolijfrente: 'definitief' },
    toelichting:
      'Aftoppingsgrens 137.800 bevroren tot en met 2032 (BP2027 art. LVII, voorstel). Franchise volgt de AOW-uitkering per 1-1-2027 en is geschat op 19.650 (bandbreedte 19.550 à 19.750); maximum jaarruimte = 30% × (137.800 − franchise). Maximum reserveringsruimte 42.753 × 1,01248. Factor A blijft voor jaarruimte 2027 bruikbaar voor regelingen die nog niet onder de Wtp vallen. Bedrag ineens 10% vanaf 1-1-2029. BAZ (verplichte AOV, wetsvoorstel 36912) niet vóór 2030.',
    waarde: {
      lijfrente: {
        regime: 'wtp',
        pct: 0.3,
        franchise: 19650,
        inkomensgrens: 137800,
        maxJaarruimte: 35445,
        maxReserveringsruimte: 43287,
        reserveringsruimtePctGrondslag: null,
        terugkijkJaren: 10,
        factorA: { toegestaan: true, factor: 6.27 },
        maxJarenNaAOW: 5,
        saldomethodeMax: 2269,
      },
      stakingslijfrente: { hoog: 582041, midden: 291032, laag: 145526 },
      stakingslijfrenteRegels: { hoogBinnenJarenVoorAow: 5, middenBinnenJarenVoorAow: 15, arbeidsongeschiktMinPct: 0.45, betaaltermijnMaanden: 6 },
      uitkering: {
        afkoopKleineLijfrente: 5582,
        afkoopAOMax: 52082,
        tijdelijkeOudedagslijfrenteMax: 27531,
        revisierentePct: 0.2,
        bedragIneens: { vanaf: '2029-01-01', pct: 0.1 },
      },
      nettolijfrente: { actief: true },
      baz: { actief: false, pct: 0.054, maxPremiePerMaand: 177, wachttijdWeken: 104 },
    },
  },

  eigenWoning: {
    status: 'voorlopig',
    bron: BP2027,
    veldStatus: { hillenPct: 'definitief', hillenStap: 'definitief', aflossingseisVanaf: 'definitief', maxAftrekJaren: 'definitief', kewVrijstelling: 'geschat', wozPeildatum: 'definitief' },
    toelichting:
      'Forfait 0,35% tot 1.360.000 via de bijstellingsregeling van december (voorlopig). Hillen-aftrek 67,067% volgt het wettelijke afbouwpad (4,8 punt per jaar, nul vanaf 2041). Vrijstelling kapitaalverzekering eigen woning geschat met 1,01248.',
    waarde: {
      forfait: [
        { tot: 12500, pct: 0 },
        { tot: 25000, pct: 0.001 },
        { tot: 50000, pct: 0.002 },
        { tot: 75000, pct: 0.0025 },
        { tot: 1360000, pct: 0.0035 },
        { tot: null, pct: 0.0235, vast: 4760 },
      ],
      hillenPct: 0.67067,
      hillenStap: 0.048,
      aflossingseisVanaf: '2013-01-01',
      maxAftrekJaren: 30,
      aftrekTermijnStartUiterlijk: '2001-01-01',
      kewVrijstelling: 210090,
      wozPeildatum: 'vorigJaar',
      reserveTermijnJaren: 3,
    },
  },

  box2: {
    status: 'voorstel',
    bron: BP2027,
    veldStatus: { gebruikelijkLoonNorm: 'geschat', dividendbelasting: 'definitief', grensPerPersoon: 'definitief' },
    toelichting: 'Gebruikelijk loon 2027 volgt eind december (Nieuwsbrief Loonheffingen); geschat op 59.000.',
    waarde: {
      schijven: [
        { tot: 69607, tarief: 0.245 },
        { tot: null, tarief: 0.31 },
      ],
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
    bron: BP2027,
    veldStatus: {
      tarief: 'definitief',
      forfaitBank: 'voorlopig',
      forfaitSchulden: 'voorlopig',
      schuldendrempel: 'geschat',
      vrijstellingen: 'geschat',
      tegenbewijs: 'definitief',
      arbitrageMaanden: 'definitief',
      bronbelastingMaxPct: 'definitief',
      dac8Rapportage: 'definitief',
    },
    veldBron: { forfaitBank: BOX3_VA_2027, forfaitSchulden: BOX3_VA_2027 },
    toelichting:
      'Laatste jaar van het overbruggingsstelsel. Forfaits bank en schulden zijn een eerste inschatting (definitief begin 2028); bronnen noemen voor schulden 2,70% tot 2,85%. Groenvrijstelling 200 is wet (2028: nul); contant geld en uitvaart geschat met 1,01248. Tegenbewijs via de aangifte; eigen gebruik vastgoed 5,06% van de WOZ.',
    waarde: {
      regime: 'forfaitair',
      tarief: 0.36,
      heffingsvrijVermogen: 60098,
      schuldendrempel: 3800,
      forfaitBank: 0.0127,
      forfaitOverig: 0.0637,
      forfaitSchulden: 0.0285,
      vrijstellingen: { groen: 200, contant: 680, uitvaart: 9015, nettolijfrente: true },
      tegenbewijs: { beschikbaar: true, kanaal: 'aangifte', eigenGebruikPct: 0.0506 },
      arbitrageMaanden: 3,
      bronbelastingMaxPct: 0.15,
      dac8Rapportage: true,
    },
  },

  zvw: {
    status: 'voorlopig',
    bron: VWS_2027,
    toelichting: 'Raming begroting VWS 2027; vaststelling in november 2026.',
    waarde: { pctOndernemer: 0.0502, pctWerkgever: 0.0627, maxBijdrageInkomen: 82547 },
  },

  pga: {
    status: 'voorstel',
    bron: BP2027,
    veldStatus: { zorgkosten: 'geschat', alimentatie: 'definitief' },
    toelichting:
      'Aftrek specifieke zorgkosten bestaat in 2027 nog (vervalt per 2028 volgens het Belastingplan 2027); drempels geschat met 1,01248, verhoging tot de eerste-schijfgrens voor geboren vóór 1946. Periodieke giften maximaal 1,5 miljoen (overgangsrecht oude akten tot 2027).',
    waarde: {
      giften: { drempelPct: 0.01, drempelMin: 60, maxPct: 0.1, periodiekMax: 1500000, cultureelMultiplier: 1.25, cultureelMaxExtra: 1250, naturaGrens: 10000 },
      zorgkosten: {
        actief: true,
        drempelMinPP: 168,
        drempelMinTotInkomen: 9801,
        pctLaag: 0.0165,
        grensHoog: 52053,
        vastHoog: 859,
        pctHoog: 0.0575,
        verhogingPct: 0.4,
        verhogingPctAow: 1.13,
        verhogingTotInkomen: 41637,
      },
      scholing: { actief: false, drempel: 250, max: 15000 },
      alimentatie: true,
    },
  },

  loon: {
    status: 'geschat',
    bron: BP2027,
    toelichting: 'Reisaftrek 2026 × 1,01248; het kilometerbedrag boven 90 km blijft 0,29 tot de bijstellingsregeling.',
    waarde: {
      reisaftrek: {
        tabel: [
          { vanafKm: 10, bedrag: 581 },
          { vanafKm: 15, bedrag: 771 },
          { vanafKm: 20, bedrag: 1284 },
          { vanafKm: 30, bedrag: 1592 },
          { vanafKm: 40, bedrag: 2073 },
          { vanafKm: 50, bedrag: 2307 },
          { vanafKm: 60, bedrag: 2559 },
          { vanafKm: 70, bedrag: 2647 },
          { vanafKm: 80, bedrag: 2682 },
        ],
        kmBedrag: 0.29,
        max: 2682,
      },
    },
  },

  toeslagen: {
    status: 'voorstel',
    bron: SZW_2027,
    veldStatus: { kot: 'voorlopig', zorgtoeslag: 'geschat' },
    veldBron: { kot: KOT_2027, vermogensgrens: VERMOGENSTOETS_2027 },
    toelichting:
      'KOT: maximum uurprijzen en tabel uit het ontwerpbesluit (Staatsblad uiterlijk 15 oktober 2026); 96% tot 71.903 voor het eerste kind, laagste percentage 39,1% vanaf 179.459. KGB: afbouw 8,05% vanaf 30.910 / 40.560 (8,05% is wet, afbouwpunten WML-afhankelijk) en 9,95% vanaf 61.917 (tweede knikpunt, voorstel 36923); kindbedrag 2.653 en kinderbijslag circa 321,89 alleen bij aanname van 36923. Vermogensgrens 119.122 / 158.748 volgens wetsvoorstel 36932. Zorgtoeslag geraamd (november): maximum 1.680 / 3.223, grens 42.950 / 54.150; standaardpremie geschat.',
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
          { vanafAlleen: 30910, vanafPaar: 40560, pct: 0.0805 },
          { vanafAlleen: 61917, vanafPaar: 61917, pct: 0.0995 },
        ],
      },
      kinderbijslag: kinderbijslag['2027'],
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
    status: 'definitief',
    veldStatus: { zelfstandigenwet: 'voorstel' },
    toelichting:
      'Reguliere handhaving Wet DBA met verzuim- en vergrijpboetes (Handhavingsplan). Rechtsvermoeden van een arbeidsovereenkomst bij een uurtarief tot en met 38 vanaf 31-12-2026 (art. 7:610aa BW), daarna geïndexeerd met het minimumloon. Zelfstandigenwet (zelfstandigentoets) in consultatie, beoogd per 2028.',
    waarde: {
      handhaving: { regime: 'regulier', verzuimboetes: true, vergrijpboetes: true },
      rechtsvermoedenUurtarief: { actiefVanaf: '2026-12-31', drempel: 38 },
      modelovereenkomstenGeldigTot: '2029-12-31',
      zelfstandigenwet: { actief: false },
      concentratieWaarschuwingPct: 0.7,
    },
  },

  schenken: {
    status: 'geschat',
    toelichting: 'Schenkvrijstellingen 2026 × 1,01248 tot de bijstellingsregeling van december.',
    waarde: { kindJaarlijks: 6994, kindEenmalig: 33542, kindStudie: 69870, overig: 2803 },
  },

  overig: {
    status: 'voorstel',
    bron: BP2027,
    veldStatus: {
      belastingrenteIB: 'geschat',
      belastingrenteVpb: 'geschat',
      aanslaggrens: 'geschat',
      teruggaafgrens: 'definitief',
      aanslagRendementsgrondslag: 'geschat',
      belastingrenteRegels: 'definitief',
      invordering: 'definitief',
      middeling: 'definitief',
      vpb: 'definitief',
      aowLeeftijd: 'definitief',
    },
    toelichting:
      'Belastingrente geschat op 5,5%: de laatste ECB-rente voor basisherfinancieringstransacties die vóór 1 november 2026 is gepubliceerd (2,65% per 16-9-2026) plus 3 punt, afgerond op halve procenten, minimaal 4,5% en hooguit 2 punt verschil met 2026; vaststelling in december. Rekenen gaat via de periodetabel years/data/belastingrente.ts. Aanslaggrens (58) en grens rendementsgrondslag (38.959) geschat als het bedrag van 2026 × 1,01248, naar beneden afgerond. Innovatiebox forfait maximaal 100.000 en pseudo-eindheffing 12% voor fossiele auto van de zaak (overgangsrecht tot eind 2030) zijn voorstel.',
    waarde: {
      belastingrenteIB: 0.055,
      belastingrenteVpb: 0.055,
      aanslaggrens: 58,
      teruggaafgrens: 18,
      aanslagRendementsgrondslag: 38959,
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
      aowLeeftijd: { jaren: 67, maanden: 0 },
    },
  },
}

export default params2027
