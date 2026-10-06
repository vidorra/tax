import { describe, expect, it } from 'vitest'
import { BESCHIKBARE_JAREN, CONCEPT_JAREN, JAREN, STANDAARD_JAAR, getJaar, laagsteStatus, veldStatus } from '../years/index'
import { KOT_BESTANDEN, WAARSCHUWING_PREFIX, alleenFouten, validateYear } from '../years/validate'
import { EERSTE_LIJFRENTEJAAR, lijfrenteParamsVoorJaar, lijfrenteStatusVoorJaar } from '../years/lijfrente-historie'
import type { TaxYearParams } from '../types'

const ALLE = BESCHIKBARE_JAREN()

/** Alle jaren plus alle varianten, met label. */
const gevallen: Array<[string, TaxYearParams]> = ALLE.flatMap((j) => {
  const p = getJaar(j)
  return [[String(j), p] as [string, TaxYearParams], ...p.varianten.map((v) => [`${j} (${v.id})`, getJaar(j, v.id)] as [string, TaxYearParams])]
})

/** KOT-tabellen die in hun databestand als onvolledig zijn gemarkeerd (gedocumenteerde waarschuwing). */
const onvolledigeKot = Object.entries(KOT_BESTANDEN)
  .filter(([, b]) => b._onvolledig)
  .map(([j]) => Number(j))

const nulpuntAk = (p: TaxYearParams) => {
  const ak = p.heffingskortingen.waarde.arbeid
  return ak.afbouwVanaf + ak.max / ak.afbouwPct
}
const nulpuntAhk = (p: TaxYearParams) => {
  const a = p.heffingskortingen.waarde.algemeen
  return a.afbouwVanaf + a.max / a.afbouwPct
}

describe('register', () => {
  it('bevat 2021 tot en met 2028', () => {
    expect(ALLE).toEqual([2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028])
    expect(CONCEPT_JAREN).toEqual([2028])
    expect(STANDAARD_JAAR).toBe(2026)
  })

  it('elk jaar draagt zijn eigen jaartal en een status gelijk aan de laagste blokstatus', () => {
    for (const j of ALLE) {
      expect(JAREN[j].jaar).toBe(j)
      expect(JAREN[j].status).toBe(laagsteStatus(JAREN[j]))
    }
  })

  it('getJaar geeft een kopie en gooit bij een onbekend jaar of onbekende variant', () => {
    const a = getJaar(2026)
    a.box1.waarde.schijven[0].tot = 1
    expect(getJaar(2026).box1.waarde.schijven[0].tot).toBe(38883)
    expect(() => getJaar(2019)).toThrow()
    expect(() => getJaar(2027, 'bestaat-niet')).toThrow()
  })
})

describe('validateYear', () => {
  it.each(gevallen)('%s is consistent', (_label, p) => {
    const problemen = validateYear(p)
    const waarschuwingen = problemen.filter((x) => x.startsWith(WAARSCHUWING_PREFIX))
    expect(alleenFouten(problemen)).toEqual([])
    if (!onvolledigeKot.includes(p.jaar)) expect(waarschuwingen).toEqual([])
  })

  it('geen enkele KOT-tabel is nog als onvolledig gemarkeerd', () => {
    expect(onvolledigeKot).toEqual([])
  })

  it('vindt een fout in een bewust beschadigd jaar', () => {
    const p = getJaar(2026)
    p.box1.waarde.schijven[2].tot = 100
    p.heffingskortingen.waarde.arbeid.max = 6000
    p.inkomensvoorziening.waarde.lijfrente.maxJaarruimte = 30000
    p.eigenWoning.waarde.forfait[5].vast = 1
    p.toeslagen.waarde.kot.tabel = [...p.toeslagen.waarde.kot.tabel.slice(0, -1)]
    p.toeslagen.waarde.kinderbijslag = [{ vanaf: '2025-01-01', tot5: 1, tot11: 1, tot17: 1 }]
    p.box3.waarde.forfaitOverig = 6
    p.bijgewerkt = '2020-01-01'
    p.status = 'definitief'
    const fouten = alleenFouten(validateYear(p))
    for (const fragment of ['box1.schijven', 'arbeid.max', 'maxJaarruimte', 'vast bedrag', 'kot.tabel', 'kinderbijslag', 'forfaitOverig', 'bijgewerkt', 'status']) {
      expect(fouten.some((f) => f.includes(fragment)), fragment).toBe(true)
    }
  })
})

describe('2021', () => {
  const p = getJaar(2021)
  it('box 1 en tariefmaatregel', () => {
    expect(p.box1.waarde.schijven).toEqual([
      { tot: 35129, tarief: 0.371, belastingDeel: 0.0945 },
      { tot: 68507, tarief: 0.371, belastingDeel: 0.371 },
      { tot: null, tarief: 0.495, belastingDeel: 0.495 },
    ])
    expect(p.box1.waarde.aftrekTariefMax).toBe(0.43)
    // voorbeeld 2021 (lib/voorbeeld), persoon A: schijf 2 en de tariefmaatregel
    expect(Math.floor(0.371 * (59099 - 35129))).toBe(8892)
    expect(Math.floor((0.495 - p.box1.waarde.aftrekTariefMax) * 19593)).toBe(1273)
  })
  it('ondernemer, Zvw en eigen woning', () => {
    expect(p.ondernemer.waarde.zelfstandigenaftrek).toBe(6670)
    expect(p.ondernemer.waarde.mkbWinstvrijstelling).toBe(0.14)
    expect(Math.round(0.14 * (97320 - 6670))).toBe(12691)
    expect(Math.round(0.28 * 3400)).toBe(952)
    expect(p.ondernemer.waarde.kia.pctTot).toBe(59170)
    expect(p.ondernemer.waarde.for).toMatchObject({ dotatie: true, dotatiePct: 0.0944, dotatieMax: 9395 })
    expect(p.zvw.waarde).toMatchObject({ pctOndernemer: 0.0575, maxBijdrageInkomen: 58311 })
    expect(p.eigenWoning.waarde.forfait[4]).toEqual({ tot: 1110000, pct: 0.005 })
    expect(0.005 * 338000).toBe(1690)
  })
  it('box 3 schijvenstelsel', () => {
    const b = p.box3.waarde
    expect(b.regime).toBe('schijven2017')
    expect(b.tarief).toBe(0.31)
    expect(b.heffingsvrijVermogen).toBe(50000)
    expect(b.schuldendrempel).toBe(3200)
    expect(b.schijven2017).toEqual([
      { tot: 50000, pct: 0.01898 },
      { tot: 950000, pct: 0.04501 },
      { tot: null, pct: 0.0569 },
    ])
  })
  it('lijfrente pre-wtp en scholingsaftrek', () => {
    const l = p.inkomensvoorziening.waarde.lijfrente
    expect(l).toMatchObject({ regime: 'pre-wtp', pct: 0.133, franchise: 12672, terugkijkJaren: 7, maxReserveringsruimte: 7489, reserveringsruimtePctGrondslag: 0.17 })
    // voorbeeld 2021: verrekenbare premiegrondslag 2021 = 13,3% × (84.300 − 12.672) naar boven
    expect(Math.ceil(0.133 * (84300 - l.franchise) - 1e-9)).toBe(9527)
    expect(p.pga.waarde.scholing).toEqual({ actief: true, drempel: 250, max: 15000 })
  })
  it('heffingskortingen zijn nul bij het inkomen van de aangifte', () => {
    expect(Math.round(nulpuntAhk(p))).toBe(68508)
    expect(Math.round(nulpuntAk(p))).toBe(105735)
    expect(p.heffingskortingen.waarde.iack).toMatchObject({ drempel: 5153, max: 2815 })
  })
})

describe('2022 en 2023', () => {
  it('2022: laatste jaar 13,3% met franchise en inkomensgrens', () => {
    const p = getJaar(2022)
    expect(p.inkomensvoorziening.waarde.lijfrente).toMatchObject({ regime: 'pre-wtp', pct: 0.133, franchise: 12837, inkomensgrens: 114866 })
    // 13,3% × (97.600 − 12.837) = 11.274 verrekenbare premiegrondslag 2022
    expect(Math.ceil(0.133 * (97600 - 12837) - 1e-9)).toBe(11274)
    expect(p.box1.waarde.aftrekTariefMax).toBe(0.4)
    expect(p.ondernemer.waarde.zelfstandigenaftrek).toBe(6310)
    expect(p.box3.waarde.regime).toBe('schijven2017')
    expect(p.pga.waarde.scholing.actief).toBe(false)
  })
  it('2023: eerste jaar overbruggingsstelsel en Wtp', () => {
    const p = getJaar(2023)
    expect(p.box3.waarde).toMatchObject({ regime: 'forfaitair', tarief: 0.32, heffingsvrijVermogen: 57000, forfaitOverig: 0.0617 })
    expect(p.box3.waarde.tegenbewijs.kanaal).toBe('owr-formulier')
    expect(p.inkomensvoorziening.waarde.lijfrente).toMatchObject({ regime: 'wtp', pct: 0.3, franchise: 13646, maxReserveringsruimte: 38000 })
    // verrekenbare premiegrondslag 2023 = 30% × (88.500 − 13.646) naar boven
    expect(Math.ceil(0.3 * (88500 - 13646) - 1e-9)).toBe(22457)
    expect(p.ondernemer.waarde.for.dotatie).toBe(false)
    expect(p.ondernemer.waarde.zelfstandigenaftrek).toBe(5030)
  })
})

describe('2024', () => {
  const p = getJaar(2024)
  it('box 1, premies en tariefmaatregel', () => {
    expect(p.box1.waarde.schijven.map((s) => s.tot)).toEqual([38098, 75518, null])
    // voorbeeld 2024 (lib/voorbeeld), persoon A: schijf 3 en de tariefmaatregel
    expect(Math.floor(0.495 * (108257 - 75518))).toBe(16205)
    expect(Math.floor((0.495 - p.box1.waarde.aftrekTariefMax) * 29811)).toBe(3735)
  })
  it('geverifieerde correcties', () => {
    expect(p.heffingskortingen.waarde.arbeidAow.max).toBe(2854)
    expect(p.heffingskortingen.waarde.algemeen.aowAfbouwPct).toBe(0.0342)
    expect(p.ondernemer.waarde.eia.pct).toBe(0.4)
    expect(p.inkomensvoorziening.waarde.stakingslijfrente.hoog).toBe(559483)
    expect(p.box3.waarde.vrijstellingen.uitvaart).toBe(8665)
    expect(p.pga.waarde.zorgkosten).toMatchObject({ drempelMinPP: 163, drempelMinTotInkomen: 9420, grensHoog: 50034 })
    expect(p.loon.waarde.reisaftrek.max).toBe(2578)
    expect(p.toeslagen.waarde.zorgtoeslag.drempelinkomen).toBe(26819)
    expect(Math.round(nulpuntAk(p))).toBe(124934)
  })
})

describe('2025', () => {
  const p = getJaar(2025)
  it('kernbedragen', () => {
    expect(p.box1.waarde.schijven.map((s) => s.tot)).toEqual([38441, 76817, null])
    expect(p.heffingskortingen.waarde.algemeen).toMatchObject({ max: 3068, afbouwVanaf: 28406, afbouwPct: 0.06337, grondslag: 'verzamelinkomen' })
    expect(p.ondernemer.waarde.zelfstandigenaftrek).toBe(2470)
    expect(p.box3.waarde).toMatchObject({ forfaitBank: 0.0137, forfaitOverig: 0.0588, forfaitSchulden: 0.027, heffingsvrijVermogen: 57684 })
    expect(p.box3.waarde.tegenbewijs.kanaal).toBe('aangifte')
    expect(p.toeslagen.waarde.kot.maxUurprijs.gastouder).toBe(8.1)
    expect(p.toeslagen.waarde.kgb.afbouw[0].pct).toBe(0.071)
    expect(p.toeslagen.waarde.kinderbijslag[0].tot5).toBe(286.45)
    expect(p.inkomensvoorziening.waarde.lijfrente.maxJaarruimte).toBe(35798)
  })
})

describe('2026', () => {
  const p = getJaar(2026)
  it('kernbedragen en volledige KOT-tabel', () => {
    expect(p.box1.waarde.schijven[0]).toEqual({ tot: 38883, tarief: 0.3575, belastingDeel: 0.081 })
    expect(p.toeslagen.waarde.kot.tabel).toHaveLength(69)
    expect(p.toeslagen.waarde.kot.tabel.find((r) => r.totInkomen === 165657)).toMatchObject({ pctKind1: 0.385 })
    expect(p.toeslagen.waarde.kot.tabel.at(-1)).toEqual({ totInkomen: null, pctKind1: 0.365, pctKind2: 0.682 })
    expect(veldStatus(p, 'box3', 'forfaitBank')).toBe('voorlopig')
  })
})

describe('2027 (sleuteltabel en brief 29 september)', () => {
  const p = getJaar(2027)
  it('statussen per veld', () => {
    expect(veldStatus(p, 'ondernemer', 'zelfstandigenaftrek')).toBe('definitief')
    expect(p.ondernemer.waarde.zelfstandigenaftrek).toBe(900)
    expect(veldStatus(p, 'box1', 'schijven')).toBe('voorstel')
    expect(veldStatus(p, 'ondernemer', 'kia')).toBe('geschat')
    expect(veldStatus(p, 'box3', 'forfaitBank')).toBe('voorlopig')
    expect(veldStatus(p, 'eigenWoning', 'hillenPct')).toBe('definitief')
    expect(veldStatus(p, 'zvw', 'pctOndernemer')).toBe('voorlopig')
    expect(p.status).toBe('geschat')
  })
  it('kernbedragen hoofdstuk 7', () => {
    expect(p.box1.waarde.schijven).toEqual([
      { tot: 39247, tarief: 0.3623, belastingDeel: 0.0858 },
      { tot: 78426, tarief: 0.3816, belastingDeel: 0.3816 },
      { tot: null, tarief: 0.495, belastingDeel: 0.495 },
    ])
    expect(p.heffingskortingen.waarde.iack).toMatchObject({ pct: 0.1145, drempel: 6316, max: 2918 })
    expect(p.heffingskortingen.waarde.ouderen).toMatchObject({ max: 1993, grens: 46577, alleenstaand: 547 })
    expect(p.heffingskortingen.waarde.jonggehandicapt).toBe(935)
    expect(p.ondernemer.waarde).toMatchObject({ startersaftrek: 10, stakingsaftrek: 908 })
    expect(p.ondernemer.waarde.meewerkaftrek.staffel.map((s) => s.pct)).toEqual([0.003125, 0.005, 0.0075, 0.01])
    expect(p.ondernemer.waarde.eia.pct).toBe(0.455)
    expect(p.ondernemer.waarde.kia).toMatchObject({ pctTot: 72578, vastTot: 134403, nulBoven: 403206 })
    expect(p.ondernemer.waarde.auto.youngtimerLeeftijd).toBe(17)
    expect(p.zvw.waarde).toMatchObject({ pctOndernemer: 0.0502, maxBijdrageInkomen: 82547 })
    expect(p.box3.waarde).toMatchObject({ forfaitBank: 0.0127, forfaitSchulden: 0.0285, forfaitOverig: 0.0637, heffingsvrijVermogen: 60098 })
    expect(p.toeslagen.waarde.kgb.afbouw).toEqual([
      { vanafAlleen: 30910, vanafPaar: 40560, pct: 0.0805 },
      { vanafAlleen: 61917, vanafPaar: 61917, pct: 0.0995 },
    ])
    expect(p.toeslagen.waarde.vermogensgrens).toEqual({ alleen: 119122, metPartner: 158748 })
    expect(p.toeslagen.waarde.kot.maxUurprijs).toEqual({ dagopvang: 11.6, bso: 10.31, gastouder: 8.77 })
    expect(p.toeslagen.waarde.kot.tabel.find((r) => r.totInkomen === 71903)).toMatchObject({ pctKind1: 0.96 })
    expect(p.toeslagen.waarde.kinderbijslag[0].tot5).toBe(321.89)
    expect(Math.round(nulpuntAk(p))).toBe(138909)
  })
  it('variant brief-29-09', () => {
    const v = getJaar(2027, 'brief-29-09')
    expect(v.box1.waarde.schijven[1].tot).toBe(80578)
    expect(v.heffingskortingen.waarde.arbeid.max).toBe(5889)
    expect(v.heffingskortingen.waarde.arbeid.opbouw[1].basis).toBe(1142)
    expect(Math.abs(nulpuntAhk(v) - 80578)).toBeLessThan(5)
    expect(v.box2.waarde.schijven[1].tarief).toBe(0.292)
    expect(v.box2.waarde.excessiefLenen.grens).toBe(420000)
    expect(v.box3.waarde.heffingsvrijVermogen).toBe(30846)
    expect(v.box3.waarde.forfaitOverig).toBe(0.0787)
    // de basis blijft ongewijzigd
    expect(getJaar(2027).box1.waarde.schijven[1].tot).toBe(78426)
  })
})

describe('2028 (concept)', () => {
  const p = getJaar(2028)
  it('bekende maatregelen', () => {
    expect(p.ondernemer.waarde.zelfstandigenaftrek).toBe(900)
    expect(veldStatus(p, 'ondernemer', 'zelfstandigenaftrek')).toBe('definitief')
    expect(p.ondernemer.waarde.startersaftrek).toBe(0)
    expect(p.ondernemer.waarde.startersaftrekAO.actief).toBe(true)
    expect(p.ondernemer.waarde.afschrijving.willekeurigStarters).toBe(false)
    expect(p.ondernemer.waarde.auto.youngtimerLeeftijd).toBe(20)
    expect(p.ondernemer.waarde.auto.bijtellingNulEmissiePerToelatingsjaar['2028'].pct).toBe(0.22)
    expect(p.pga.waarde.zorgkosten.actief).toBe(false)
    expect(p.box3.waarde.vrijstellingen.groen).toBe(0)
    expect(p.heffingskortingen.waarde.groenBeleggen.pct).toBe(0)
    expect(p.indexatie.toegepastDeel).toBe(0.122)
    expect(p.overig.waarde.aowLeeftijd).toEqual({ jaren: 67, maanden: 3 })
    expect(p.toeslagen.waarde.kot.regime).toBe('toeslag')
    expect(p.heffingskortingen.waarde.iack.max).toBeLessThan(getJaar(2027).heffingskortingen.waarde.iack.max)
  })
  it('nieuw box 3-stelsel', () => {
    expect(p.box3.waarde.regime).toBe('werkelijkRendement')
    expect(p.box3.waarde.regime2028).toEqual({
      perCategorie: { bank: 'werkelijkRendement', financieelInstrument: 'vermogenswinst', crypto: 'vermogensaanwas', onroerend: 'vermogenswinst' },
      heffingsvrijResultaat: 1000,
      verliesdrempel: 500,
    })
  })
})

describe('lijfrente-historie', () => {
  it('dekt 2014 tot en met 2027', () => {
    expect(EERSTE_LIJFRENTEJAAR).toBe(2014)
    for (let j = 2014; j <= 2027; j++) expect(lijfrenteParamsVoorJaar(j), String(j)).toBeDefined()
    expect(lijfrenteParamsVoorJaar(2013)).toBeUndefined()
  })
  it('percentages en franchises per jaar', () => {
    expect(lijfrenteParamsVoorJaar(2017)?.pct).toBe(0.138)
    for (const j of [2018, 2019, 2020, 2021, 2022]) expect(lijfrenteParamsVoorJaar(j)?.pct).toBe(0.133)
    for (const j of [2023, 2024, 2025, 2026, 2027]) expect(lijfrenteParamsVoorJaar(j)?.pct).toBe(0.3)
    const franchises: Record<number, number> = { 2017: 12032, 2018: 12129, 2019: 12275, 2020: 12472, 2021: 12672, 2022: 12837, 2023: 13646, 2024: 17545 }
    for (const [j, f] of Object.entries(franchises)) expect(lijfrenteParamsVoorJaar(Number(j))?.franchise).toBe(f)
    expect(lijfrenteParamsVoorJaar(2019)?.inkomensgrens).toBe(107593)
    expect(lijfrenteParamsVoorJaar(2020)?.terugkijkJaren).toBe(7)
    expect(lijfrenteParamsVoorJaar(2024)?.terugkijkJaren).toBe(10)
  })
  it('verrekenbare premiegrondslag met de historische parameters', () => {
    const verrekenbaar = (j: number, inkomen: number) => {
      const l = lijfrenteParamsVoorJaar(j)!
      return Math.ceil(l.pct * (Math.min(inkomen, l.inkomensgrens) - l.franchise) - 1e-9)
    }
    expect(verrekenbaar(2017, 38500)).toBe(3653) // 13,8% × (38.500 − 12.032)
    expect(verrekenbaar(2018, 52700)).toBe(5396)
    expect(verrekenbaar(2019, 64200)).toBe(6907)
    expect(verrekenbaar(2020, 71500)).toBe(7851)
    // Boven de inkomensgrens telt de grens: 13,3% × (105.075 − 12.129).
    expect(verrekenbaar(2018, 130000)).toBe(12362)
  })
  it('status: oude afgeleide jaren geschat, jaarmodules volgen hun blok', () => {
    expect(lijfrenteStatusVoorJaar(2014)).toBe('geschat')
    expect(lijfrenteStatusVoorJaar(2019)).toBe('definitief')
    expect(lijfrenteStatusVoorJaar(2027)).toBe('geschat')
  })
  it('geeft een kopie terug', () => {
    const l = lijfrenteParamsVoorJaar(2024)!
    l.factorA.factor = 0
    expect(lijfrenteParamsVoorJaar(2024)!.factorA.factor).toBe(6.27)
  })
})
