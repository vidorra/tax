/**
 * Adversariële scenariotests uit de fiscale review van 4 oktober 2026.
 *
 * Elke verwachting is met de hand uitgerekend uit de wettelijke formule en de parameters van het jaar
 * (plan hoofdstuk 5 en 7); de berekening staat in het commentaar. Afronding: belasting per schijf, premie en
 * tariefmaatregel naar beneden, kortingen, MKB en KIA rekenkundig, jaarruimte naar boven.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '../engine'
import { getJaar } from '../years'
import { berekenBox1 } from '../modules/box1'
import { berekenHeffingskortingen, type HeffingskortingenContext } from '../modules/heffingskortingen'
import { kiaUitTabel, berekenInvesteringsaftrek, berekenDesinvesteringsbijtelling } from '../modules/onderneming/investeringsaftrek'
import { berekenBijtellingAuto } from '../modules/onderneming/auto'
import { toetsUrencriterium } from '../modules/onderneming/urencriterium'
import { berekenFor } from '../modules/onderneming/for'
import { berekenInkomensvoorziening } from '../modules/inkomensvoorziening'
import { berekenEigenWoning, forfaitVoorWoz } from '../modules/eigen-woning'
import { berekenBox3 } from '../modules/box3'
import { berekenKot, kotPercentage } from '../modules/toeslagen/kot'
import { berekenKgb } from '../modules/toeslagen/kgb'
import { berekenZorgtoeslag } from '../modules/toeslagen/zorgtoeslag'
import { berekenKinderbijslag } from '../modules/toeslagen/kinderbijslag'
import { lijfrenteParamsVoorJaar } from '../years/lijfrente-historie'
import type {
  HuishoudenInvoer,
  HuishoudenResultaat,
  KindInvoer,
  OndernemingInvoer,
  PersoonInvoer,
  Verdeling,
  VermogensPositie,
} from '../types'

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

const ALLES_A: Verdeling = { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 }

const ond = (saldo: number, extra: Partial<OndernemingInvoer> = {}): OndernemingInvoer => ({
  naam: 'Zaak',
  winstberekening: { soort: 'saldo', saldo },
  uren: { onderneming: 1400 },
  startjaar: 2010,
  ...extra,
})

const pers = (id: 'A' | 'B', extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id,
  geboortedatum: '1985-05-05',
  ondernemingen: [],
  loon: [],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...extra,
})

const loon = (bruto: number) => [{ omschrijving: 'loon', soort: 'loon' as const, bruto, ingehoudenLoonheffing: 0 }]

const hh = (jaar: number, personen: PersoonInvoer[], extra: Partial<HuishoudenInvoer> = {}): HuishoudenInvoer => ({
  jaar,
  personen,
  fiscaalPartner: personen.length === 2,
  kinderen: [],
  box3: { posities: [], schulden: [] },
  verdeling: ALLES_A,
  ...extra,
})

const run = (i: HuishoudenInvoer): HuishoudenResultaat => berekenHuishouden(i, { zonderMarginaleDruk: true })

const positie = (id: string, categorie: VermogensPositie['categorie'], waardeBegin: number, eigenaar: VermogensPositie['eigenaar'] = 'A', extra: Partial<VermogensPositie> = {}): VermogensPositie => ({
  id,
  omschrijving: id,
  categorie,
  eigenaar,
  waardeBegin,
  ...extra,
})

function hkCtx(jaar: number, extra: Partial<HeffingskortingenContext> = {}): HeffingskortingenContext {
  return {
    params: getJaar(jaar),
    jaar,
    arbeidsinkomen: 0,
    box1Inkomen: 0,
    verzamelinkomen: 0,
    geboortedatum: '1985-05-05',
    aowBereikt: false,
    heeftFiscaalPartner: false,
    isMinstverdienende: true,
    kinderen: [],
    groenVrijstelling: 0,
    maxVerzilverbaar: 1e9,
    ...extra,
  }
}

/** Seeded PRNG (mulberry32) zodat de eigenschapstests reproduceerbaar zijn. */
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const kosten = (r: HuishoudenResultaat) => r.personen.reduce((s, p) => s + p.verschuldigdIB + p.zvw.bijdrage, 0) - r.toeslagen.totaal

/** Alle getallen in een object (diep), met pad. */
function getallen(x: unknown, pad = '$', uit: Array<{ pad: string; waarde: number }> = []): Array<{ pad: string; waarde: number }> {
  if (typeof x === 'number') uit.push({ pad, waarde: x })
  else if (Array.isArray(x)) x.forEach((v, i) => getallen(v, `${pad}[${i}]`, uit))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) getallen(v, `${pad}.${k}`, uit)
  return uit
}

// ---------------------------------------------------------------------------
// Box 1
// ---------------------------------------------------------------------------

describe('box 1: schijfgrenzen, AOW en tariefmaatregel (2026)', () => {
  const p = getJaar(2026)
  const ctx = { params: p, aowBereikt: false, geborenVoor1946: false }

  it('precies op de grens van schijf 1 en schijf 2', () => {
    // 38.883: schijf 1 = floor(8,10% × 38.883 = 3.149,52) = 3.149; premie = floor(27,65% × 38.883 = 10.751,15) = 10.751
    const r1 = berekenBox1(38883, 0, ctx)
    expect(r1.schijven.map((s) => s.belasting)).toEqual([3149, 0, 0])
    expect(r1.premie).toBe(10751)
    // 78.426: schijf 2 = floor(37,56% × 39.543 = 14.852,35) = 14.852; niets in schijf 3
    const r2 = berekenBox1(78426, 0, ctx)
    expect(r2.schijven.map((s) => s.belasting)).toEqual([3149, 14852, 0])
    // 78.427: € 1 in schijf 3 = floor(0,495) = 0; 78.428: floor(0,99) = 0; 78.429: floor(1,485) = 1
    expect(berekenBox1(78427, 0, ctx).schijven[2].over).toBe(1)
    expect(berekenBox1(78429, 0, ctx).schijven[2].belasting).toBe(1)
  })

  it('AOW-gerechtigd geboren na 1946: geen AOW-premie, belastingdeel schijf 1 blijft', () => {
    // premie = floor((0,10% + 9,65%) × 38.883 = 3.791,09) = 3.791; schijf 1 = 3.149
    const r = berekenBox1(50000, 0, { params: p, aowBereikt: true, geborenVoor1946: false })
    expect(r.premie).toBe(3791)
    expect(r.schijven[0].belasting).toBe(3149)
    expect(r.schijven[0].tot).toBe(38883)
  })

  it('AOW-gerechtigd geboren vóór 1946: langere eerste schijf (41.123) voor belasting én premie', () => {
    // schijf 1 = floor(8,10% × 41.123 = 3.330,96) = 3.330; premie = floor(9,75% × 41.123 = 4.009,49) = 4.009
    // schijf 2 = floor(37,56% × (50.000 − 41.123) = 3.334,19) = 3.334
    const r = berekenBox1(50000, 0, { params: p, aowBereikt: true, geborenVoor1946: true })
    expect(r.schijven.map((s) => s.belasting)).toEqual([3330, 3334, 0])
    expect(r.premie).toBe(4009)
  })

  it('tariefmaatregel: helemaal, deels en niet in het toptarief', () => {
    // 80.000 + 5.000 aftrek: alles boven 78.426 → floor((49,5% − 37,56%) × 5.000) = 597
    expect(berekenBox1(80000, 5000, ctx).tariefmaatregel).toBe(597)
    // 76.000 + 5.000 = 81.000: 2.574 in het toptarief → floor(11,94% × 2.574 = 307,34) = 307
    expect(berekenBox1(76000, 5000, ctx).tariefmaatregel).toBe(307)
    // 70.000 + 5.000 = 75.000 < 78.426 → 0
    expect(berekenBox1(70000, 5000, ctx).tariefmaatregel).toBe(0)
  })

  it('negatief eigenwoningsaldo verschuift de grens van de tariefmaatregel (engine)', () => {
    // winst 100.000, geen urencriterium: MKB = round(12,7% × 100.000) = 12.700, belastbare winst 87.300
    // eigen woning: forfait 0,35% × 400.000 = 1.400 − rente 12.000 = −10.600 → box 1 = 76.700
    // aftrekposten 12.700 + 10.600 = 23.300; in toptarief: min(23.300, 76.700 + 23.300 − 78.426 = 21.574) = 21.574
    // tariefmaatregel = floor(11,94% × 21.574 = 2.575,94) = 2.575
    const r = run(hh(2026, [pers('A', { ondernemingen: [ond(100000, { uren: { onderneming: 0, urencriteriumGehaald: false } })] })], { eigenWoning: { woz: 400000, rente: 12000 } }))
    const a = r.personen[0]
    expect(a.box1.inkomen).toBe(76700)
    expect(a.box1.tariefmaatregel).toBe(2575)
  })
})

// ---------------------------------------------------------------------------
// Heffingskortingen
// ---------------------------------------------------------------------------

describe('heffingskortingen', () => {
  it('AHK bouwt in 2024 af op box 1, vanaf 2025 op het verzamelinkomen (box 3 telt mee)', () => {
    const box3 = { posities: [positie('fonds', 'beleggingen', 300000)], schulden: [] }
    // 2024: box 1 = 40.000 − ZA 3.750 = 36.250 − MKB round(13,31% × 36.250 = 4.824,9) = 4.825 → 31.425
    // AHK = 3.362 − 6,63% × (31.425 − 24.812) = 3.362 − 438,44 = 2.923,6 → 2.924 (box 3 telt niet mee)
    const a24 = run(hh(2024, [pers('A', { ondernemingen: [ond(40000)] })], { box3 })).personen[0]
    expect(a24.box1.inkomen).toBe(31425)
    expect(a24.box3Inkomen).toBeGreaterThan(0)
    expect(a24.heffingskortingen.algemeen).toBe(2924)
    // 2025: box 1 = 40.000 − 2.470 = 37.530 − round(12,7% × 37.530 = 4.766,31) = 4.766 → 32.764
    // box 3: 300.000 × 5,88% = 17.640; grondslag 300.000 − 57.684 = 242.316; 5,88% → voordeel round(14.248,18) = 14.248
    // verzamelinkomen 47.012 → AHK = 3.068 − 6,337% × (47.012 − 28.406) = 3.068 − 1.179,06 = 1.888,9 → 1.889
    const a25 = run(hh(2025, [pers('A', { ondernemingen: [ond(40000)] })], { box3 })).personen[0]
    expect(a25.box3Inkomen).toBe(14248)
    expect(a25.verzamelinkomen).toBe(47012)
    expect(a25.heffingskortingen.algemeen).toBe(1889)
  })

  it.each([
    // [jaar, arbeidsinkomen, verwachte arbeidskorting]
    // 2024: 8,425% × 11.490 = 968,03 → 968; 968 + 31,433% × 13.330 = 5.158,02 → 5.158; 5.158 + 2,471% × 15.137 = 5.532,04 → 5.532
    [2024, 11490, 968],
    [2024, 24820, 5158],
    [2024, 39957, 5532],
    [2024, 124934, 0], // 5.532 − 6,51% × 84.977 = 0,0 → 0
    // 2025: 8,053% × 12.169 = 979,97 → 980; 980 + 30,03% × 14.119 = 5.219,94 → 5.220; 5.220 + 2,258% × 16.783 = 5.598,96 → 5.599
    [2025, 12169, 980],
    [2025, 26288, 5220],
    [2025, 43071, 5599],
    [2025, 129078, 0],
    // 2026: 996 (995,97); 996 + 31,009% × 13.880 = 5.300,05 → 5.300; 5.300 + 1,95% × 19.747 = 5.685,07 → max 5.685
    [2026, 11965, 996],
    [2026, 20000, 3488], // 996 + 31,009% × 8.035 = 3.487,57 → 3.488
    [2026, 25845, 5300],
    [2026, 45592, 5685],
    [2026, 60000, 4747], // 5.685 − 6,51% × 14.408 = 4.747,04 → 4.747
    [2026, 132920, 0],
    // 2027 (sleuteltabel): 9,503% × 12.438 = 1.181,98 → 1.182; 1.182 + 30,205% × 14.428 = 5.539,98 → 5.540;
    // 5.540 + 1,855% × 20.968 = 5.928,96 → 5.929; nul bij 138.909
    [2027, 12438, 1182],
    [2027, 26866, 5540],
    [2027, 47834, 5929],
    [2027, 138909, 0],
  ])('arbeidskorting %i bij %i = %i', (jaar, ai, verwacht) => {
    expect(berekenHeffingskortingen(hkCtx(jaar, { arbeidsinkomen: ai })).arbeid).toBe(verwacht)
  })

  it('IACK: 11,45% boven de drempel tot het maximum', () => {
    const kind: KindInvoer = { id: 'k', geboortedatum: '2020-02-02' }
    // 2026: 11,45% × (20.000 − 6.239) = 1.575,63 → 1.576; maximum 3.032 vanaf 32.720
    expect(berekenHeffingskortingen(hkCtx(2026, { arbeidsinkomen: 20000, kinderen: [kind] })).iack).toBe(1576)
    expect(berekenHeffingskortingen(hkCtx(2026, { arbeidsinkomen: 40000, kinderen: [kind] })).iack).toBe(3032)
    expect(berekenHeffingskortingen(hkCtx(2026, { arbeidsinkomen: 6239, kinderen: [kind] })).iack).toBe(0)
  })

  it('IACK: kind geboren 30 juni of 1 juli hoort 6 maanden tot het huishouden, 2 juli niet', () => {
    const iack = (geboren: string) => berekenHeffingskortingen(hkCtx(2026, { arbeidsinkomen: 40000, kinderen: [{ id: 'k', geboortedatum: geboren }] })).iack
    expect(iack('2026-06-30')).toBe(3032)
    expect(iack('2026-07-01')).toBe(3032) // 1 juli t/m 31 december = precies 6 maanden
    expect(iack('2026-07-02')).toBe(0)
  })

  it('IACK: co-ouderschap 156 dagen wel, 155 niet; kind van 12 op 1 januari niet', () => {
    const met = (k: KindInvoer) => berekenHeffingskortingen(hkCtx(2026, { arbeidsinkomen: 40000, kinderen: [k] })).iack
    expect(met({ id: 'k', geboortedatum: '2018-01-01', coOuderschap: { dagenInHuishouden: 156 } })).toBe(3032)
    expect(met({ id: 'k', geboortedatum: '2018-01-01', coOuderschap: { dagenInHuishouden: 155 } })).toBe(0)
    expect(met({ id: 'k', geboortedatum: '2014-01-01' })).toBe(0) // 12 op 1-1-2026
    expect(met({ id: 'k', geboortedatum: '2014-01-02' })).toBe(3032) // nog 11 op 1-1-2026
  })

  it('IACK bij partners: alleen het laagste arbeidsinkomen; bij gelijk inkomen de oudste (art. 8.14a lid 3)', () => {
    const kinderen: KindInvoer[] = [{ id: 'k', geboortedatum: '2022-03-01' }]
    // A (1980) en B (1991) beide winst 31.000: gelijk arbeidsinkomen → alleen A, de oudste.
    // IACK = 11,45% × (31.000 − 6.239) = 2.835,13 → 2.835
    const gelijk = run(hh(2026, [pers('A', { geboortedatum: '1980-01-01', ondernemingen: [ond(31000)] }), pers('B', { geboortedatum: '1991-01-01', ondernemingen: [ond(31000)] })], { kinderen }))
    expect(gelijk.personen.find((x) => x.id === 'A')!.heffingskortingen.iack).toBe(2835)
    expect(gelijk.personen.find((x) => x.id === 'B')!.heffingskortingen.iack).toBe(0)
    // Omgekeerd: B is de oudste
    const omgekeerd = run(hh(2026, [pers('A', { geboortedatum: '1991-01-01', ondernemingen: [ond(31000)] }), pers('B', { geboortedatum: '1980-01-01', ondernemingen: [ond(31000)] })], { kinderen }))
    expect(omgekeerd.personen.find((x) => x.id === 'A')!.heffingskortingen.iack).toBe(0)
    expect(omgekeerd.personen.find((x) => x.id === 'B')!.heffingskortingen.iack).toBe(2835)
    // Partner zonder arbeidsinkomen: de verdiener is niet de minstverdienende; de partner zit onder de drempel.
    const zonder = run(hh(2026, [pers('A', { ondernemingen: [ond(30000)] }), pers('B')], { kinderen }))
    expect(zonder.personen.map((x) => x.heffingskortingen.iack)).toEqual([0, 0])
  })

  it('verzilvering: kortingen nooit hoger dan belasting plus premie', () => {
    // winst 10.000 zonder urencriterium: MKB 1.270 → box 1 8.730
    // belasting floor(8,10% × 8.730 = 707,13) = 707, premie floor(27,65% × 8.730 = 2.413,85) = 2.413 → 3.120
    // AHK 3.115 + AK round(8,324% × 10.000 = 832,4) = 832 → bruto 3.947, verzilverd 3.120
    const a = run(hh(2026, [pers('A', { ondernemingen: [ond(10000, { uren: { onderneming: 0, urencriteriumGehaald: false } })] })])).personen[0]
    expect(a.box1.belasting + a.box1.premie).toBe(3120)
    expect(a.heffingskortingen.bruto).toBe(3947)
    expect(a.heffingskortingen.verzilverd).toBe(3120)
    expect(a.verschuldigdIB).toBe(0)
  })

  it('verzilvering: eigenschap over veel inkomens en jaren', () => {
    const rnd = prng(42)
    for (let i = 0; i < 150; i++) {
      const jaar = 2021 + Math.floor(rnd() * 8)
      const winst = Math.round(rnd() * 120000) - 10000
      const aow = rnd() < 0.2
      const r = run(hh(jaar, [pers('A', { geboortedatum: aow ? '1950-03-03' : '1985-05-05', ondernemingen: [ond(winst)] })], { kinderen: rnd() < 0.5 ? [{ id: 'k', geboortedatum: `${jaar - 3}-04-04` }] : [] }))
      const a = r.personen[0]
      expect(a.heffingskortingen.verzilverd).toBeLessThanOrEqual(a.box1.belasting + a.box1.premie + a.box2Belasting + a.box3Belasting)
      expect(a.verschuldigdIB).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('AOW: varianten van kortingen en de persoonlijke AOW-leeftijd', () => {
  it('AHK, arbeidskorting en ouderenkorting voor AOW-gerechtigden (2026)', () => {
    const r = berekenHeffingskortingen(hkCtx(2026, { aowBereikt: true, arbeidsinkomen: 20000, verzamelinkomen: 50000, heeftFiscaalPartner: true }))
    // AHK AOW: 1.556 − 3,195% × (50.000 − 29.736) = 1.556 − 647,43 = 908,57 → 909
    expect(r.algemeen).toBe(909)
    // AK AOW: 498 + 15,483% × (20.000 − 11.965) = 498 + 1.244,06 = 1.742,06 → 1.742
    expect(r.arbeid).toBe(1742)
    // ouderenkorting: 2.067 − 15% × (50.000 − 46.002) = 1.467,3 → 1.467 (met partner, geen alleenstaande ouderenkorting)
    expect(r.ouderen).toBe(1467)
    // alleenstaand: + 540 → 2.007,3 → 2.007
    expect(berekenHeffingskortingen(hkCtx(2026, { aowBereikt: true, verzamelinkomen: 50000 })).ouderen).toBe(2007)
  })

  it.each([
    // [jaar, geboortedatum]: AOW bereikt in het jaar ervoor met de lagere AOW-leeftijd van dat jaar
    [2022, '1955-07-15'], // 66 jaar en 4 maanden in 2021: AOW op 15-11-2021
    [2024, '1957-02-15'], // 66 jaar en 10 maanden in 2023: AOW op 15-12-2023
    [2028, '1960-10-15'], // 67 jaar in 2027: AOW op 15-10-2027 (in 2028 is de leeftijd 67 jaar en 3 maanden)
  ])('%i: wie in het jaar ervoor de AOW-leeftijd bereikte, betaalt het hele jaar geen AOW-premie (geboren %s)', (jaar, geboren) => {
    const a = run(hh(jaar, [pers('A', { geboortedatum: geboren, ondernemingen: [ond(40000)] })])).personen[0]
    const p = getJaar(jaar).box1.waarde
    const grens = p.schijven[0].tot!
    // premie zonder AOW: floor((Anw + Wlz) × min(box 1, grens schijf 1))
    expect(a.box1.premie).toBe(Math.floor((p.premies.anw + p.premies.wlz) * Math.min(a.box1.inkomen, grens) + 1e-9))
    expect(a.waarschuwingen.some((w) => w.id === 'aow-in-jaar')).toBe(false)
  })

  it('lijfrente: grens is de persoonlijke AOW-datum plus 5 jaar', () => {
    // geboren 1-3-1954: AOW-leeftijd 66 jaar en 4 maanden (bereikt 1-7-2020), plus 5 jaar = 1-7-2025.
    // Op 1-1-2026 voorbij die grens: geen aftrek, ook al zou 67 + 5 jaar pas op 1-3-2026 vallen.
    const a = run(hh(2026, [pers('A', { geboortedatum: '1954-03-01', loon: loon(30000), inkomensvoorziening: { lijfrentePremies: 1000, aovPremies: 0, premiegrondslagInkomenVorigJaar: 40000 } })])).personen[0]
    expect(a.inkomensvoorziening.lijfrenteAftrek).toBe(0)
    expect(a.inkomensvoorziening.nietAftrekbaar).toBe(1000)
  })
})

describe('jaarparameters: steekproef tegen de verificatie van 4 oktober 2026 (audit2.json, plan hoofdstuk 7)', () => {
  it.each([
    // [jaar, pad, waarde]
    [2025, 'box1.schijven.0.tot', 38441], [2025, 'box1.schijven.1.tot', 76817], [2025, 'box1.schijven.0.belastingDeel', 0.0817],
    [2025, 'box1.schijf1TotGeborenVoor1946', 40502], [2025, 'heffingskortingen.algemeen.max', 3068], [2025, 'heffingskortingen.algemeen.afbouwPct', 0.06337],
    [2025, 'heffingskortingen.algemeen.aowAfbouwPct', 0.0317], [2025, 'heffingskortingen.arbeid.max', 5599], [2025, 'heffingskortingen.iack.drempel', 6145],
    [2025, 'ondernemer.zelfstandigenaftrek', 2470], [2025, 'ondernemer.kia.vastBedrag', 19769], [2025, 'inkomensvoorziening.lijfrente.franchise', 18475],
    [2025, 'box3.heffingsvrijVermogen', 57684], [2025, 'box3.forfaitBank', 0.0137], [2025, 'toeslagen.kot.maxUurprijs.gastouder', 8.1],
    [2026, 'box1.schijven.1.tot', 78426], [2026, 'box1.aftrekTariefMax', 0.3756], [2026, 'heffingskortingen.algemeen.afbouwVanaf', 29736],
    [2026, 'heffingskortingen.algemeen.aowMax', 1556], [2026, 'heffingskortingen.arbeid.afbouwVanaf', 45592], [2026, 'heffingskortingen.iack.max', 3032],
    [2026, 'ondernemer.zelfstandigenaftrek', 1200], [2026, 'ondernemer.kia.nulBoven', 398236], [2026, 'ondernemer.desinvestering.drempel', 2900],
    [2026, 'inkomensvoorziening.lijfrente.maxReserveringsruimte', 42753], [2026, 'eigenWoning.hillenPct', 0.71867], [2026, 'box2.schijven.0.tot', 68843],
    [2026, 'box3.forfaitOverig', 0.06], [2026, 'toeslagen.kgb.afbouw.0.vanafPaar', 39141], [2026, 'zvw.maxBijdrageInkomen', 79409],
    [2027, 'box1.schijven.0.tot', 39247], [2027, 'box1.schijven.0.belastingDeel', 0.0858], [2027, 'box1.schijven.1.tarief', 0.3816],
    [2027, 'box1.schijf1TotGeborenVoor1946', 41637], [2027, 'heffingskortingen.algemeen.max', 3154], [2027, 'heffingskortingen.algemeen.aowMax', 1596],
    [2027, 'heffingskortingen.arbeid.max', 5929], [2027, 'heffingskortingen.iack.max', 2918], [2027, 'ondernemer.startersaftrek', 10],
    [2027, 'ondernemer.stakingsaftrek', 908], [2027, 'ondernemer.eia.pct', 0.455], [2027, 'eigenWoning.hillenPct', 0.67067],
    [2027, 'box3.heffingsvrijVermogen', 60098], [2027, 'toeslagen.kgb.afbouw.1.vanafPaar', 61917], [2027, 'toeslagen.vermogensgrens.metPartner', 158748],
  ] as Array<[number, string, number]>)('%i %s = %d', (jaar, pad, waarde) => {
    const p = getJaar(jaar) as unknown as Record<string, { waarde: unknown }>
    const [blok, ...rest] = pad.split('.')
    const gevonden = rest.reduce<unknown>((x, k) => (x as Record<string, unknown>)[k], p[blok].waarde)
    expect(gevonden).toBe(waarde)
  })

  it('variant brief 29-9-2026 voor 2027', () => {
    const v = getJaar(2027, 'brief-29-09')
    expect(v.box1.waarde.schijven[1].tot).toBe(80578)
    expect(v.box3.waarde.heffingsvrijVermogen).toBe(30846)
    expect(v.box3.waarde.forfaitOverig).toBe(0.0787)
    expect(v.box2.waarde.schijven[1].tarief).toBe(0.292)
    expect(v.heffingskortingen.waarde.arbeid.max).toBe(5889)
  })
})

// ---------------------------------------------------------------------------
// Ondernemer
// ---------------------------------------------------------------------------

describe('ondernemer', () => {
  it('starter: zelfstandigen- en startersaftrek mogen hoger zijn dan de winst', () => {
    // 2026, gestart 2024: ZA 1.200 + startersaftrek 2.123 = 3.323 bij winst 2.000
    // MKB = round(12,7% × (2.000 − 3.323) = −168,02) = −168 → belastbare winst 2.000 − 3.323 + 168 = −1.155
    const a = run(hh(2026, [pers('A', { ondernemingen: [ond(2000, { startjaar: 2024, uren: { onderneming: 1300 } })] })])).personen[0]
    expect(a.ondernemersaftrek.zelfstandigenaftrek).toBe(1200)
    expect(a.ondernemersaftrek.startersaftrek).toBe(2123)
    expect(a.mkbVrijstelling).toBe(-168)
    expect(a.belastbareWinst).toBe(-1155)
    expect(a.box1.inkomen).toBe(0)
  })

  it('startersaftrek al 3 keer gebruikt: geen startersaftrek en zelfstandigenaftrek begrensd op de winst', () => {
    // art. 3.76 lid 5: de begrenzing vervalt alleen voor wie recht heeft op de startersaftrek
    const a = run(hh(2026, [pers('A', { ondernemingen: [ond(800, { startjaar: 2023, startersaftrekEerderGebruikt: 3 })] })])).personen[0]
    expect(a.ondernemersaftrek.startersaftrek).toBe(0)
    expect(a.ondernemersaftrek.zelfstandigenaftrek).toBe(800)
    expect(a.ondernemersaftrek.nietBenutteZelfstandigenaftrekNieuw).toBe(400)
  })

  it('niet-benutte zelfstandigenaftrek: negen jaar vooruit, daarna vervallen', () => {
    // 2017 → verrekenbaar in 2018 t/m 2026; 2016 → t/m 2025, dus vervallen in 2026
    const a = run(hh(2026, [pers('A', { ondernemingen: [ond(100000)], nietBenutteZelfstandigenaftrek: [{ jaar: 2016, bedrag: 700 }, { jaar: 2017, bedrag: 500 }] })])).personen[0]
    expect(a.ondernemersaftrek.verrekendNietBenut).toBe(500)
    // verrekening maximaal winst − zelfstandigenaftrek: winst 1.500, ZA 1.200 → 300
    const b = run(hh(2026, [pers('A', { ondernemingen: [ond(1500)], nietBenutteZelfstandigenaftrek: [{ jaar: 2020, bedrag: 500 }] })])).personen[0]
    expect(b.ondernemersaftrek.verrekendNietBenut).toBe(300)
  })

  it('urencriterium: grotendeelscriterium bij loondienst, vrijstelling voor starters, zwangerschapsverlof', () => {
    const p = getJaar(2026)
    // 1.300 uur onderneming + 1.400 uur loondienst: 1.300 / 2.700 = 48% → niet gehaald (geen starter)
    expect(toetsUrencriterium({ onderneming: 1300, loondienst: 1400 }, { params: p, jaar: 2026, startjaar: 2010 }).gehaald).toBe(false)
    // zelfde uren als starter (gestart 2023, 2026 − 2023 = 3 < 5): wel gehaald
    expect(toetsUrencriterium({ onderneming: 1300, loondienst: 1400 }, { params: p, jaar: 2026, startjaar: 2023 }).gehaald).toBe(true)
    // 900 uur + 16 weken × 30 uur = 1.380 ≥ 1.225; 20 weken wordt begrensd op 16
    const z = toetsUrencriterium({ onderneming: 900, zwangerschapWeken: 20, gemiddeldeUrenPerWeekVoorVerlof: 30 }, { params: p, jaar: 2026, startjaar: 2010 })
    expect(z.fictieveUren).toBe(480)
    expect(z.gehaald).toBe(true)
    expect(toetsUrencriterium({ onderneming: 1224 }, { params: p, jaar: 2026, startjaar: 2010 }).gehaald).toBe(false)
  })

  it('verlies box 1 uit een eerder jaar wordt verrekend, oudste eerst, en vervalt na 9 jaar', () => {
    // winst 50.000: ZA 1.200 → 48.800, MKB round(6.197,6) = 6.198 → 42.602
    const a = run(hh(2026, [pers('A', { ondernemingen: [ond(50000)], verliezen: [{ jaar: 2016, bedrag: 9999 }, { jaar: 2020, bedrag: 30000 }, { jaar: 2022, bedrag: 20000 }] })])).personen[0]
    expect(a.verliesverrekening).toBe(42602) // 30.000 uit 2020 + 12.602 uit 2022; 2016 vervallen
    expect(a.box1.inkomen).toBe(0)
  })

  it('verrekende verliezen uit eerdere jaren verlagen het verzamelinkomen niet (art. 2.18: inkomen uit werk en woning)', () => {
    // box 1 vóór verliesverrekening 42.602; verlies 2022 van 20.000 → belastbaar 22.602
    // verzamelinkomen = 42.602 → AHK = 3.115 − 6,398% × (42.602 − 29.736) = 3.115 − 823,17 = 2.291,8 → 2.292
    const a = run(hh(2026, [pers('A', { ondernemingen: [ond(50000)], verliezen: [{ jaar: 2022, bedrag: 20000 }] })])).personen[0]
    expect(a.box1.inkomen).toBe(22602)
    expect(a.verzamelinkomen).toBe(42602)
    expect(a.heffingskortingen.algemeen).toBe(2292)
  })

  it.each([
    // KIA 2026: tot en met 2.900 niets; 28% tot en met 71.683; vast 20.072 tot en met 132.746; afbouw 7,56%; nul boven 398.236
    [2900, 0],
    [2901, 812], // round(28% × 2.901 = 812,28)
    [71683, 20071], // round(20.071,24)
    [71684, 20072],
    [132746, 20072],
    [132747, 20072], // round(20.072 − 0,0756) = 20.072
    [398236, 1], // round(20.072 − 7,56% × 265.490 = 0,956) = 1
    [398237, 0],
  ])('KIA 2026 bij %i = %i', (inv, verwacht) => {
    expect(Math.round(kiaUitTabel(inv, getJaar(2026).ondernemer.waarde.kia))).toBe(verwacht)
  })

  it('EIA cumuleert met KIA; per bedrijfsmiddel minimaal 450 voor de KIA', () => {
    const r = berekenInvesteringsaftrek(
      [
        { omschrijving: 'Warmtepomp', datum: '2026-03-01', bedrag: 10000, regeling: 'eia', gemeld: true },
        { omschrijving: 'Muis', datum: '2026-03-01', bedrag: 449, regeling: 'kia' },
      ],
      { params: getJaar(2026) },
    )
    expect(r.kiaGrondslag).toBe(10000)
    expect(r.kia).toBe(2800) // 28% × 10.000
    expect(r.eia).toBe(4000) // 40% × 10.000
  })

  it('desinvesteringsbijtelling alleen boven de drempel en binnen vijf jaar', () => {
    const p = getJaar(2026)
    expect(berekenDesinvesteringsbijtelling([{ omschrijving: 'x', verkoopprijs: 2900, investeringsjaar: 2024, genotenPct: 0.28 }], { params: p, jaar: 2026 }).bijtelling).toBe(0)
    expect(berekenDesinvesteringsbijtelling([{ omschrijving: 'x', verkoopprijs: 3000, investeringsjaar: 2024, genotenPct: 0.28 }], { params: p, jaar: 2026 }).bijtelling).toBe(840)
    expect(berekenDesinvesteringsbijtelling([{ omschrijving: 'x', verkoopprijs: 3000, investeringsjaar: 2021, genotenPct: 0.28 }], { params: p, jaar: 2026 }).bijtelling).toBe(0)
  })

  it('meewerkaftrek 2027 is met 75% verlaagd; stakingsaftrek 2027 is 908', () => {
    // partner 1.300 uur (≥ 1.225): 2026 3% × 100.000 = 3.000; 2027 0,75% × 100.000 = 750
    const mee = (jaar: number) => run(hh(jaar, [pers('A', { ondernemingen: [ond(100000, { meewerkendePartner: { uren: 1300, vergoeding: 0 } })] })])).personen[0].ondernemersaftrek.meewerkaftrek
    expect(mee(2026)).toBe(3000)
    expect(mee(2027)).toBe(750)
    const stak = (jaar: number, w: number) => run(hh(jaar, [pers('A', { ondernemingen: [ond(100000, { staking: { stakingswinst: w } })] })])).personen[0].ondernemersaftrek.stakingsaftrek
    expect(stak(2026, 5000)).toBe(3630)
    expect(stak(2027, 5000)).toBe(908)
    expect(stak(2027, 500)).toBe(500)
  })

  it('bijtelling auto: nulemissie-cap per toelatingsjaar, einde van de 60 maanden, rittenregistratie', () => {
    const p = getJaar(2026)
    // toelating maart 2025: 17% over 30.000 + 22% over 20.000 = 5.100 + 4.400 = 9.500
    expect(berekenBijtellingAuto({ cataloguswaarde: 50000, datumEersteToelating: '2025-03-10', nulEmissie: true, autokosten: 20000 }, { params: p, jaar: 2026 }).bijtelling).toBe(9500)
    // toelating maart 2021: 60 maanden april 2021 t/m maart 2026 → 3 maanden (12% × 40.000 + 22% × 10.000 = 7.000)
    // en 9 maanden 22% × 50.000 = 11.000 → (3 × 7.000 + 9 × 11.000) / 12 = 10.000
    const r = berekenBijtellingAuto({ cataloguswaarde: 50000, datumEersteToelating: '2021-03-10', nulEmissie: true, autokosten: 20000 }, { params: p, jaar: 2026 })
    expect(r.soort).toBe('gemengd')
    expect(r.bijtelling).toBe(10000)
    expect(berekenBijtellingAuto({ cataloguswaarde: 50000, datumEersteToelating: '2025-03-10', nulEmissie: true, autokosten: 20000, priveKm: 500, rittenregistratie: true }, { params: p, jaar: 2026 }).bijtelling).toBe(0)
    expect(berekenBijtellingAuto({ cataloguswaarde: 50000, datumEersteToelating: '2025-03-10', nulEmissie: true, autokosten: 20000, priveKm: 501, rittenregistratie: true }, { params: p, jaar: 2026 }).bijtelling).toBe(9500)
    // nooit hoger dan de autokosten
    expect(berekenBijtellingAuto({ cataloguswaarde: 50000, datumEersteToelating: '2025-03-10', nulEmissie: true, autokosten: 4000 }, { params: p, jaar: 2026 }).bijtelling).toBe(4000)
  })

  it('youngtimer: vanaf de maand na de maand waarin de auto 15 jaar wordt (2025; 2026 grens 16, ronde 2 A6)', () => {
    // 2025 (grens 15): toelating 10-3-2010: 15 jaar op 10-3-2025, youngtimer vanaf april.
    // jan t/m mrt 22% × 30.000 = 6.600 per jaar; apr t/m dec 35% × 8.000 = 2.800 per jaar
    // (3 × 6.600 + 9 × 2.800) / 12 = 1.650 + 2.100 = 3.750
    const r = berekenBijtellingAuto({ cataloguswaarde: 30000, datumEersteToelating: '2010-03-10', nulEmissie: false, dagwaarde: 8000, autokosten: 20000 }, { params: getJaar(2025), jaar: 2025 })
    expect(r.bijtelling).toBe(3750)
    expect(r.soort).toBe('gemengd')
    const p = getJaar(2026)
    // 2026 (grens 16, besluit 12-2-2026): toelating 10-3-2011 is op 31-12-2025 nog geen 15, dus geen overgangsrecht en
    // in 2026 geen youngtimer: 22% × 30.000 = 6.600.
    expect(berekenBijtellingAuto({ cataloguswaarde: 30000, datumEersteToelating: '2011-03-10', nulEmissie: false, dagwaarde: 8000, autokosten: 20000 }, { params: p, jaar: 2026 }).bijtelling).toBe(6600)
    // heel 2026 youngtimer met het overgangsrecht (toelating 1-6-2010, eerste jaar na 31-12-2025): 35% × 8.000 = 2.800
    expect(berekenBijtellingAuto({ cataloguswaarde: 30000, datumEersteToelating: '2010-06-01', nulEmissie: false, dagwaarde: 8000, autokosten: 20000 }, { params: p, jaar: 2026 }).bijtelling).toBe(2800)
    // 2027: grens 17 jaar. Toelating 2010-06-01 wordt 17 op 1-6-2027 → youngtimer vanaf juli:
    // (6 × 22% × 30.000 + 6 × 2.800) / 12 = 3.300 + 1.400 = 4.700
    expect(berekenBijtellingAuto({ cataloguswaarde: 30000, datumEersteToelating: '2010-06-01', nulEmissie: false, dagwaarde: 8000, autokosten: 20000 }, { params: getJaar(2027), jaar: 2027 }).bijtelling).toBe(4700)
  })

  it('FOR (art. 3.70 lid 1 onder b): alleen bij staking, AOW of twee jaar geen urencriterium, en dan het meerdere boven het vermogen', () => {
    const p = getJaar(2026)
    const basis = { params: p, staking: false, aowBereikt: false, urencriteriumGehaald: true, winstVoorFor: 50000 }
    // Geen grond: een FOR boven het ondernemingsvermogen geeft geen afname.
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, basis).verplichteAfname).toBe(0)
    // Staking van de hele onderneming: ondernemingsvermogen daarna nihil, alles valt vrij.
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basis, staking: true }).verplichteAfname).toBe(20000)
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basis, staking: true, gedeeltelijkeStaking: true }).verplichteAfname).toBe(5000)
    // AOW of twee jaar geen urencriterium: alleen het meerdere boven het ondernemingsvermogen.
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 50000 }, { ...basis, aowBereikt: true }).verplichteAfname).toBe(0)
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basis, aowBereikt: true }).verplichteAfname).toBe(5000)
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 50000 }, { ...basis, urencriteriumGehaald: false, urencriteriumVorigJaar: false }).verplichteAfname).toBe(0)
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basis, urencriteriumGehaald: false, urencriteriumVorigJaar: false }).verplichteAfname).toBe(5000)
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basis, urencriteriumGehaald: false, urencriteriumVorigJaar: true }).verplichteAfname).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Lijfrente
// ---------------------------------------------------------------------------

describe('lijfrente (2026)', () => {
  const p = getJaar(2026)
  const ctx = { params: p, jaar: 2026, geboortedatum: '1985-05-05', historieParams: lijfrenteParamsVoorJaar }
  const iv = (extra: Partial<Parameters<typeof berekenInkomensvoorziening>[0]> = {}) => ({ lijfrentePremies: 0, aovPremies: 0, ...extra })

  it('jaarruimte: maximum, factor A en Wtp-premie', () => {
    // 200.000 → (137.800 − 19.172) × 30% = 35.588,4 → 35.589 = maximum
    expect(berekenInkomensvoorziening(iv({ premiegrondslagInkomenVorigJaar: 200000 }), ctx).jaarruimte).toBe(35589)
    // 60.000 → 30% × 40.828 = 12.248,4 → 12.249; factor A 1.000 × 6,27 = 6.270 → 5.979
    expect(berekenInkomensvoorziening(iv({ premiegrondslagInkomenVorigJaar: 60000, pensioencorrectieVorigJaar: { type: 'factorA', bedrag: 1000 } }), ctx).jaarruimte).toBe(5979)
    // Wtp-premie 3.000 → 12.249 − 3.000 = 9.249
    expect(berekenInkomensvoorziening(iv({ premiegrondslagInkomenVorigJaar: 60000, pensioencorrectieVorigJaar: { type: 'wtpPremie', bedrag: 3000 } }), ctx).jaarruimte).toBe(9249)
  })

  it('reserveringsruimte: maximum, tien jaar terug, eerst de oudste ruimte, rest niet aftrekbaar', () => {
    const historie = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((jaar) => ({ jaar, premiegrondslagInkomen: 0, alGebruikt: 0, jaarruimteOverride: 10000 }))
    // 2015 vervalt (terugkijken 2016 t/m 2025): niet benut 10 × 10.000 = 100.000 → maximum 42.753
    const r = berekenInkomensvoorziening(iv({ premiegrondslagInkomenVorigJaar: 60000, historie, lijfrentePremies: 60000 }), ctx)
    expect(r.reserveringsruimte).toBe(42753)
    // aftrek = 42.753 + jaarruimte 12.249 = 55.002; niet aftrekbaar 4.998
    expect(r.lijfrenteAftrek).toBe(55002)
    expect(r.nietAftrekbaar).toBe(4998)
    expect(r.tabel.find((x) => x.jaar === 2016)!.ditJaarBenut).toBe(10000)
    expect(r.tabel.find((x) => x.jaar === 2015)).toBeUndefined()
    expect(r.waarschuwingen.some((w) => w.id === 'lijfrente.vervallen')).toBe(true)
  })

  it('FOR-omzetting buiten de ruimte; leeftijdsgrens AOW + 5 jaar op 1 januari', () => {
    const r = berekenInkomensvoorziening(iv({ premiegrondslagInkomenVorigJaar: 60000, lijfrentePremies: 1000, forOmzetting: 20000 }), ctx)
    expect(r.lijfrenteAftrek).toBe(1000)
    expect(r.forOmzettingAftrek).toBe(20000)
    // geboren 31-12-1953: 72 op 31-12-2025, dus op 1-1-2026 voorbij AOW (67) + 5
    const oud = berekenInkomensvoorziening(iv({ premiegrondslagInkomenVorigJaar: 60000, lijfrentePremies: 1000 }), { ...ctx, geboortedatum: '1953-12-31' })
    expect(oud.lijfrenteAftrek).toBe(0)
    expect(oud.nietAftrekbaar).toBe(1000)
    // geboren 2-1-1954: 72 op 2-1-2026, dus op 1 januari nog niet: aftrek mag
    const net = berekenInkomensvoorziening(iv({ premiegrondslagInkomenVorigJaar: 60000, lijfrentePremies: 1000 }), { ...ctx, geboortedatum: '1954-01-02' })
    expect(net.lijfrenteAftrek).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// Eigen woning
// ---------------------------------------------------------------------------

describe('eigen woning (2026)', () => {
  const p = getJaar(2026)
  const ctx = { params: p, jaar: 2026 }

  it('forfait uit de band van de WOZ (niet progressief) en boven 1,35 miljoen', () => {
    expect(forfaitVoorWoz(50001, p).bedrag).toBeCloseTo(0.0025 * 50001, 6) // 0,25% over de hele WOZ
    expect(forfaitVoorWoz(75000, p).bedrag).toBeCloseTo(187.5, 6)
    expect(forfaitVoorWoz(75001, p).bedrag).toBeCloseTo(0.0035 * 75001, 6)
    expect(forfaitVoorWoz(1350000, p).bedrag).toBeCloseTo(4725, 6)
    // 1.500.000: 4.725 + 2,35% × 150.000 = 8.250
    expect(forfaitVoorWoz(1500000, p).bedrag).toBeCloseTo(8250, 6)
  })

  it('Hillen-aftrek bij een positief saldo', () => {
    // forfait 0,35% × 400.000 = 1.400 − rente 500 = 900; Hillen round(71,867% × 900 = 646,8) = 647 → saldo 253
    const r = berekenEigenWoning({ woz: 400000, rente: 500 }, ctx)
    expect(r.hillenAftrek).toBe(647)
    expect(r.saldo).toBe(253)
  })

  it('aflossingsvrije lening na 2013 kwalificeert niet; schuld van vóór 2001 loopt tot 2031', () => {
    const r = berekenEigenWoning(
      {
        woz: 400000,
        leningdelen: [
          { omschrijving: 'Aflossingsvrij 2015', hoofdsom: 50000, startdatum: '2015-06-01', aflossingsvorm: 'aflossingsvrij', rente: 1500 },
          { omschrijving: 'Oud 1995', hoofdsom: 100000, startdatum: '1995-05-01', aflossingsvorm: 'aflossingsvrij', overgangsrecht: true, rente: 4000 },
        ],
      },
      ctx,
    )
    expect(r.aftrekbareKosten).toBe(4000)
    expect(r.nietKwalificerendeSchuld).toBe(50000)
  })
})

// ---------------------------------------------------------------------------
// Box 3
// ---------------------------------------------------------------------------

describe('box 3', () => {
  const ctx = (jaar: number, variant?: string, partner = false) => ({
    params: getJaar(jaar, variant),
    jaar,
    fiscaalPartner: partner,
    aandeelA: 1,
    personen: partner ? (['A', 'B'] as const).slice() : (['A'] as const).slice(),
  })

  it('partners: tweemaal heffingsvrij vermogen, kindvermogen telt mee', () => {
    // 2026 bank 180.000 (A) + 20.000 (kind) = 200.000; rendement floor(1,28% × 200.000) = 2.560
    // grondslag 200.000 − 2 × 59.357 = 81.286; effectief 1,28% → voordeel round(1.040,46) = 1.040; belasting floor(374,4) = 374
    const r = berekenBox3({ posities: [positie('bank', 'bankNL', 180000), positie('kind', 'bankNL', 20000, 'kind:k1')], schulden: [] }, ctx(2026, undefined, true))
    expect(r.grondslag).toBe(81286)
    expect(r.voordeel.A).toBe(1040)
    expect(r.belasting.A).toBe(374)
    expect(r.vermogenToeslagen).toBe(200000)
  })

  it('groene vrijstelling (partners tweemaal) en schuldendrempel', () => {
    // groen 60.000 − 2 × 26.715 = 6.570 belast tegen 6%: floor(394,2) = 394
    const g = berekenBox3({ posities: [positie('groen', 'groen', 60000)], schulden: [] }, ctx(2026, undefined, true))
    expect(g.forfaitairRendement).toBe(394)
    // schulden 10.000 alleenstaand: −ceil(2,7% × 10.000) + floor(2,7% × 3.800 = 102,6) = −270 + 102 = −168
    const s = berekenBox3({ posities: [positie('fonds', 'beleggingen', 100000)], schulden: [{ id: 's', omschrijving: 's', eigenaar: 'A', waardeBegin: 10000 }] }, ctx(2026))
    expect(s.aftrekbareSchulden).toBe(6200)
    expect(s.forfaitairRendement).toBe(6000 - 168)
  })

  it('tegenbewijs alleen als het werkelijk rendement lager is', () => {
    const fonds = (eind: number) => ({ posities: [positie('fonds', 'beleggingen', 200000, 'A', { waardeEind: eind })], schulden: [], tegenbewijs: true })
    // forfait: 6% × 200.000 = 12.000; grondslag 140.643; voordeel round(140.643 × 6%) = 8.439
    const hoog = berekenBox3(fonds(230000), ctx(2026))
    expect(hoog.gekozen).toBe('forfaitair')
    expect(hoog.voordeel.A).toBe(8439)
    const laag = berekenBox3(fonds(203000), ctx(2026))
    expect(laag.gekozen).toBe('werkelijk')
    expect(laag.voordeel.A).toBe(3000)
    const negatief = berekenBox3(fonds(150000), ctx(2026))
    expect(negatief.voordeel.A).toBe(0)
  })

  it('bronbelasting: maximaal 15% van het bruto dividend en maximaal de box 3-belasting', () => {
    // 2026: overig 100.000 → voordeel round(40.643 × 6%) = 2.439, belasting floor(878,04) = 878
    // bronbelasting 300 op 1.000 bruto → verrekenbaar 150
    const r = berekenBox3({ posities: [positie('fonds', 'beleggingen', 100000, 'A', { bronbelasting: { land: 'US', bedrag: 300, brutoInkomsten: 1000 } })], schulden: [] }, ctx(2026))
    expect(r.bronbelasting.A).toBe(150)
    expect(r.belasting.A).toBe(878 - 150)
    // net boven het heffingsvrij vermogen: belasting floor(36% × round(1.643 × 6%) = 99) = 35 → verrekening maximaal 35
    const klein = berekenBox3({ posities: [positie('fonds', 'beleggingen', 61000, 'A', { bronbelasting: { land: 'US', bedrag: 300, brutoInkomsten: 1000 } })], schulden: [] }, ctx(2026))
    expect(klein.bronbelasting.A).toBe(35)
    expect(klein.belasting.A).toBe(0)
  })

  it('2027 sleuteltabel tegenover de brief van 29 september 2026', () => {
    const inv = { posities: [positie('fonds', 'beleggingen', 100000)], schulden: [] }
    // sleuteltabel: 100.000 − 60.098 = 39.902 × 6,37% = 2.541,76 → 2.542; belasting floor(915,12) = 915
    const s = berekenBox3(inv, ctx(2027))
    expect(s.voordeel.A).toBe(2542)
    expect(s.belasting.A).toBe(915)
    // brief: 100.000 − 30.846 = 69.154 × 7,87% = 5.442,42 → 5.442; belasting floor(1.959,12) = 1.959
    const b = berekenBox3(inv, ctx(2027, 'brief-29-09'))
    expect(b.voordeel.A).toBe(5442)
    expect(b.belasting.A).toBe(1959)
  })

  it('2021 schijvenstelsel en 2028 concept rekenen', () => {
    // 2021: 150.000 − 50.000 = 100.000: 1,898% × 50.000 + 4,501% × 50.000 = 949 + 2.250,5 = 3.199,5 → 3.200;
    // belasting floor(31% × 3.200) = 992
    const r = berekenBox3({ posities: [positie('bank', 'bankNL', 150000)], schulden: [] }, ctx(2021))
    expect(r.voordeel.A).toBe(3200)
    expect(r.belasting.A).toBe(992)
    // 2022: 150.000 − 50.650 = 99.350: 1,818% × 50.650 + 4,366% × 48.700 = 920,82 + 2.126,24 = 3.047,06 → 3.047;
    // belasting floor(31% × 3.047 = 944,57) = 944
    const r22 = berekenBox3({ posities: [positie('bank', 'bankNL', 150000)], schulden: [] }, ctx(2022))
    expect(r22.voordeel.A).toBe(3047)
    expect(r22.belasting.A).toBe(944)
    const r28 = berekenBox3({ posities: [positie('bank', 'bankNL', 150000, 'A', { waardeEind: 150000, directeOpbrengsten: 3000 })], schulden: [] }, ctx(2028))
    expect(Number.isFinite(r28.belasting.A)).toBe(true)
    // 3.000 rente − 1.000 heffingsvrij resultaat = 2.000 → floor(36% × 2.000) = 720
    expect(r28.belasting.A).toBe(720)
  })
})

// ---------------------------------------------------------------------------
// Toeslagen
// ---------------------------------------------------------------------------

describe('toeslagen', () => {
  it('KOT: tabelrij op de exacte grens, rangorde naar uren, maximum uren en uurprijs', () => {
    const p = getJaar(2026)
    expect(kotPercentage(p.toeslagen.waarde.kot.tabel, 56412).rij!.pctKind1).toBe(0.96)
    expect(kotPercentage(p.toeslagen.waarde.kot.tabel, 56413).rij!.pctKind1).toBeLessThan(0.96)
    const kinderen: KindInvoer[] = [
      { id: 'bso', geboortedatum: '2018-01-01', opvang: [{ soort: 'bso', urenPerMaand: 40, uurtarief: 9, maanden: 12 }] },
      { id: 'dag', geboortedatum: '2024-01-01', opvang: [{ soort: 'dagopvang', urenPerMaand: 250, uurtarief: 12.5, maanden: 12 }] },
    ]
    const r = berekenKot(kinderen, 50000, { params: p, jaar: 2026 })
    const dag = r.perKind.find((k) => k.kindId === 'dag')!
    expect(dag.rang).toBe(1)
    // 230 uur × 11,23 × 96% × 12 = 29.755,01 → 29.755
    expect(dag.toeslagPerJaar).toBe(29755)
    // tweede kind: 40 × 9 × 96% × 12 = 4.147,2 → 4.147
    expect(r.perKind.find((k) => k.kindId === 'bso')!.toeslagPerJaar).toBe(4147)
  })

  it('KGB 2027: twee afbouwpunten (8,05% en boven 61.917 9,95%)', () => {
    const p = getJaar(2027)
    // paar, één kind < 12: afbouw 8,05% × (61.917 − 40.560) + 9,95% × (65.000 − 61.917) = 1.719,24 + 306,76 = 2.026,00
    // 2.653 − 2.026,00 = 627,00 → 627
    const r = berekenKgb([{ id: 'k', geboortedatum: '2020-01-01' }], 65000, 0, { params: p, jaar: 2027, partner: true })
    expect(r.bedrag).toBe(627)
  })

  it('KGB: verhoging vanaf de maand na de 12e verjaardag en stop na de 18e (leeftijd op de eerste dag van de maand)', () => {
    const p = getJaar(2026)
    // alleenstaand, inkomen onder het afbouwpunt. Kind geboren 10-3-2014 wordt 12 op 10-3-2026: verhoging april t/m december.
    // 2.580 + 724 × 9/12 = 543 + alo-kop 3.416 = 6.539
    expect(berekenKgb([{ id: 'k', geboortedatum: '2014-03-10' }], 20000, 0, { params: p, jaar: 2026, partner: false }).bedrag).toBe(6539)
    // Kind geboren 15-4-2008 wordt 18 op 15-4-2026: recht januari t/m april.
    // (2.580 + 964 + 3.416) × 4/12 = 6.960 / 3 = 2.320
    expect(berekenKgb([{ id: 'k', geboortedatum: '2008-04-15' }], 20000, 0, { params: p, jaar: 2026, partner: false }).bedrag).toBe(2320)
  })

  it('zorgtoeslag nul boven de inkomensgrens en boven de vermogensgrens', () => {
    const p = getJaar(2026)
    expect(berekenZorgtoeslag(40858, 0, { params: p, partner: false }).bedrag).toBe(0)
    expect(berekenZorgtoeslag(20000, 146012, { params: p, partner: false }).bedrag).toBe(0)
    expect(berekenZorgtoeslag(20000, 146011, { params: p, partner: false }).bedrag).toBe(1550)
  })

  it('kinderbijslag vanaf het kwartaal na de geboorte (of hetzelfde kwartaal bij geboorte op de eerste dag)', () => {
    const p = getJaar(2026)
    // geboren 10-2-2026: K2 295,07 (tarief januari), K3 en K4 298,40 → 891,87
    expect(berekenKinderbijslag([{ id: 'k', geboortedatum: '2026-02-10' }], { params: p, jaar: 2026 }).totaal).toBeCloseTo(891.87, 2)
    expect(berekenKinderbijslag([{ id: 'k', geboortedatum: '2026-04-01' }], { params: p, jaar: 2026 }).totaal).toBeCloseTo(891.87, 2)
    expect(berekenKinderbijslag([{ id: 'k', geboortedatum: '2026-04-02' }], { params: p, jaar: 2026 }).totaal).toBeCloseTo(596.8, 2)
  })
})

// ---------------------------------------------------------------------------
// Persoonsgebonden aftrek in de engine
// ---------------------------------------------------------------------------

describe('persoonsgebonden aftrek in de engine', () => {
  it('drempelinkomen giften is het verzamelinkomen vóór PGA, dus inclusief box 3 (art. 6.2)', () => {
    // loon 40.000; box 3 2026: 300.000 × 6% = 18.000, grondslag 240.643 × 6% = 14.438,58 → 14.439
    // drempelinkomen 54.439 → drempel 1% = 544,39 → aftrek round(1.000 − 544,39 = 455,61) = 456
    const a = run(hh(2026, [pers('A', { loon: loon(40000) })], { box3: { posities: [positie('fonds', 'beleggingen', 300000)], schulden: [] }, pga: { giftenGewoon: 1000 } })).personen[0]
    expect(a.box3Inkomen).toBe(14439)
    expect(a.pga).toBe(456)
  })

  it('zorgkostendrempel voor fiscale partners: dubbele vaste drempel', () => {
    // gezamenlijk drempelinkomen 15.200 ≤ 2 × 9.680: drempel 2 × 166 = 332
    // zorgkosten 1.000 × 1,4 (verhoging, inkomen ≤ 41.123) = 1.400 − 332 = 1.068
    const r = run(hh(2026, [pers('A', { loon: loon(7600) }), pers('B', { loon: loon(7600) })], { pga: { specifiekeZorgkosten: 1000 } }))
    expect(r.personen.reduce((s, p) => s + p.pga, 0)).toBe(1068)
  })

  it('verrekenvolgorde box 1 > box 3 > box 2; box 2 opnieuw over de schijven', () => {
    // loon 1.000; box 2 dividend 100.000; periodieke gift 11.000: 1.000 in box 1, box 3 leeg, 10.000 in box 2
    // box 2 over 90.000: 24,5% × 68.843 + 31% × 21.157 = 16.866,54 + 6.558,67 = 23.425,2 → 23.425
    const a = run(hh(2026, [pers('A', { loon: loon(1000) })], { box2: [{ eigenaar: 'A', dividend: 100000, ingehoudenDividendbelasting: 0 }], pga: { giftenPeriodiek: 11000 } })).personen[0]
    expect(a.box1.inkomen).toBe(0)
    expect(a.box2Inkomen).toBe(90000)
    expect(a.box2Belasting).toBe(23425)
    // met box 3: 1.000 in box 1, dan box 3 (voordeel 2.439 bij 100.000 overig), rest 7.561 in box 2
    const b = run(
      hh(2026, [pers('A', { loon: loon(1000) })], {
        box2: [{ eigenaar: 'A', dividend: 100000, ingehoudenDividendbelasting: 0 }],
        box3: { posities: [positie('fonds', 'beleggingen', 100000)], schulden: [] },
        pga: { giftenPeriodiek: 11000 },
      }),
    ).personen[0]
    expect(b.box3Inkomen).toBe(0)
    expect(b.box2Inkomen).toBe(100000 - (11000 - 1000 - 2439))
  })
})

// ---------------------------------------------------------------------------
// Engine: eigenschappen
// ---------------------------------------------------------------------------

describe('persoonsgebonden aftrek: restant uit eerdere jaren (art. 6.1 lid 1 onder b)', () => {
  it('niet eerder verrekende PGA telt mee en wat niet past schuift door', () => {
    // loon 50.000, restant 5.000 → box 1 45.000
    const a = run(hh(2026, [pers('A', { loon: loon(50000), restantPgaVorigJaar: 5000 })])).personen[0]
    expect(a.box1.inkomen).toBe(45000)
    expect(a.pga).toBe(5000)
    // loon 3.000, restant 5.000 → 3.000 verrekend, 2.000 naar volgend jaar
    const b = run(hh(2026, [pers('A', { loon: loon(3000), restantPgaVorigJaar: 5000 })])).personen[0]
    expect(b.pga).toBe(3000)
    expect(b.waarschuwingen.some((w) => w.id === 'pga-restant')).toBe(true)
  })
})

describe('engine: eigenschappen', () => {
  it('waarschuwt als de AOW-leeftijd in de loop van het jaar wordt bereikt', () => {
    const a = run(hh(2026, [pers('A', { geboortedatum: '1959-07-15', ondernemingen: [ond(40000)] })])).personen[0]
    expect(a.waarschuwingen.some((w) => w.id === 'aow-in-jaar')).toBe(true)
    const b = run(hh(2026, [pers('A', { geboortedatum: '1958-07-15', ondernemingen: [ond(40000)] })])).personen[0]
    expect(b.waarschuwingen.some((w) => w.id === 'aow-in-jaar')).toBe(false)
  })

  it('toetsingsinkomen = som van de verzamelinkomens van de partners', () => {
    const r = run(hh(2026, [pers('A', { ondernemingen: [ond(60000)] }), pers('B', { loon: loon(30000) })], { box3: { posities: [positie('fonds', 'beleggingen', 200000)], schulden: [] }, verdeling: { ...ALLES_A, box3: 0.3 } }))
    expect(r.toeslagen.toetsingsinkomen).toBe(r.personen[0].verzamelinkomen + r.personen[1].verzamelinkomen)
  })

  it('geen NaN, Infinity of −0 bij randinvoer', () => {
    const randgevallen: HuishoudenInvoer[] = [
      hh(2026, [pers('A')]),
      hh(2026, [pers('A'), pers('B')], { verdeling: 'optimaal' }),
      hh(2026, [pers('A', { ondernemingen: [ond(-50000)], verliezen: [{ jaar: 2020, bedrag: 10000 }] })], { eigenWoning: { woz: 0, rente: 0 } }),
      hh(2027, [pers('A', { ondernemingen: [ond(5e7, { investeringen: [{ omschrijving: 'x', datum: '2027-01-01', bedrag: 1e7 }] })] }), pers('B', { loon: loon(1e6) })], {
        verdeling: 'optimaal',
        box3: { posities: [positie('fonds', 'beleggingen', 1e9)], schulden: [{ id: 's', omschrijving: 's', eigenaar: 'B', waardeBegin: 1e8 }] },
        eigenWoning: { woz: 5e6, rente: 1e5 },
        pga: { giftenGewoon: 1e6, giftenPeriodiek: 2e6, specifiekeZorgkosten: 1e5 },
        box2: [{ eigenaar: 'B', dividend: 1e7, ingehoudenDividendbelasting: 1.5e6 }],
        kinderen: [{ id: 'k', geboortedatum: '2026-05-05', opvang: [{ soort: 'dagopvang', urenPerMaand: 400, uurtarief: 20, maanden: 12 }] }],
      }),
      hh(2021, [pers('A', { geboortedatum: '1940-01-01', ondernemingen: [ond(0)] })]),
      hh(2028, [pers('A', { ondernemingen: [ond(80000)] })], { box3: { posities: [positie('bank', 'bankNL', 50000, 'A', { waardeEind: 52000, directeOpbrengsten: 1000 })], schulden: [] } }),
    ]
    for (const invoer of randgevallen) {
      const r = berekenHuishouden(invoer)
      for (const { pad, waarde } of getallen(r)) {
        expect(Number.isFinite(waarde), `${invoer.jaar} ${pad} = ${waarde}`).toBe(true)
        expect(Object.is(waarde, -0), `${invoer.jaar} ${pad} is −0`).toBe(false)
      }
    }
  })

  it('totale heffing stijgt niet minder dan € 1 terug bij meer winst (2021 t/m 2027)', () => {
    for (const jaar of [2021, 2024, 2026, 2027]) {
      let vorige = -Infinity
      for (let w = -20000; w <= 260000; w += 1000) {
        const r = run(hh(jaar, [pers('A', { ondernemingen: [ond(w)] })], { eigenWoning: { woz: 450000, rente: 9000 } }))
        const k = r.personen[0].verschuldigdIB + r.personen[0].zvw.bijdrage
        expect(k, `${jaar} winst ${w}`).toBeGreaterThanOrEqual(vorige - 1)
        vorige = k
      }
    }
  })

  it('marginale druk is plausibel en volgt de formule', () => {
    // 2026, winst 90.000: box 1 = 90.000 − 1.200 − 11.278 = 77.522, net onder de toptariefgrens 78.426.
    // Per euro extra winst: box 1 +0,873 (na MKB 12,7%).
    //   schijf 2  37,56% × 0,873 = 0,3279
    //   AHK-afbouw 6,398% × 0,873 = 0,0559 (verzamelinkomen boven 29.736)
    //   AK-afbouw  6,51% × 1      = 0,0651 (arbeidsinkomen boven 45.592)
    //   tariefmaatregel 11,94% × 1 = 0,1194 (inkomen + aftrekposten ligt al boven 78.426; elke euro winst telt mee)
    //   Zvw 4,85% × 0,873          = 0,0423
    //   samen ≈ 0,611
    const r = berekenHuishouden(hh(2026, [pers('A', { ondernemingen: [ond(90000)] })]))
    const m = r.personen[0].marginaleDruk!
    expect(m).toBeCloseTo(0.611, 2)
    // winst 120.000, ruim boven de toptariefgrens: 49,5% × 0,873 = 0,4321 plus tariefmaatregel over de extra MKB
    // 11,94% × 0,127 = 0,0152, plus AK-afbouw 6,51% = 0,0651; AHK is al nul en de Zvw zit boven het maximum
    // bijdrage-inkomen 79.409: samen 0,4321 + 0,0152 + 0,0651 = 0,512
    const hoog = berekenHuishouden(hh(2026, [pers('A', { ondernemingen: [ond(120000)] })])).personen[0].marginaleDruk!
    expect(hoog).toBeCloseTo(0.512, 2)
  })

  it('optimale verdeling is nooit slechter dan een vaste verdeling (eigenschapstest, seed 2026)', () => {
    const rnd = prng(2026)
    const kies = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    const vast = [0, 0.5, 1]
    for (let i = 0; i < 100; i++) {
      const jaar = kies([2024, 2025, 2026, 2027])
      const inkomen = () => (rnd() < 0.7 ? { ondernemingen: [ond(Math.round(rnd() * 160000) - 5000)] } : { loon: loon(Math.round(rnd() * 90000)) })
      const invoer = hh(jaar, [pers('A', { geboortedatum: '1980-01-01', ...inkomen() }), pers('B', { geboortedatum: '1983-01-01', ...inkomen() })], {
        eigenWoning: rnd() < 0.7 ? { woz: 200000 + Math.round(rnd() * 700000), rente: Math.round(rnd() * 25000) } : undefined,
        box3: { posities: rnd() < 0.7 ? [positie('fonds', 'beleggingen', Math.round(rnd() * 400000)), positie('bank', 'bankNL', Math.round(rnd() * 100000), 'B')] : [], schulden: [] },
        pga: rnd() < 0.4 ? { giftenPeriodiek: Math.round(rnd() * 8000) } : undefined,
        kinderen: rnd() < 0.4 ? [{ id: 'k', geboortedatum: `${jaar - 4}-06-06` }] : [],
        verdeling: 'optimaal',
      })
      const opt = run(invoer)
      const besteVast = Math.min(
        ...vast.flatMap((ew) => vast.flatMap((b3) => vast.map((pga) => kosten(run({ ...invoer, verdeling: { eigenWoning: ew, box3: b3, pga, box2: 1, dividendbelasting: b3 } }))))),
      )
      expect(kosten(opt), `huishouden ${i} (${jaar})`).toBeLessThanOrEqual(besteVast + 1)
    }
  }, 120000)
})
