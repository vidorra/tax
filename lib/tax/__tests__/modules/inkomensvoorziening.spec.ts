import { describe, expect, it } from 'vitest'
import type { InkomensvoorzieningInvoer, LijfrenteParams, TaxYearParams } from '../../types'
import { getJaar, kloon } from '../../years'
import { berekenInkomensvoorziening, berekenJaarruimte } from '../../modules/inkomensvoorziening'

/**
 * Lijfrenteregels van eerdere jaren (alleen voor de tests; de jaarbestanden 2021 t/m 2023 worden parallel
 * geschreven). 2022 en eerder: oude regeling met 13,3%. De historie hieronder is verzonnen; de toets tegen de echte
 * aangiftes staat in prive/inkomensvoorziening.spec.ts (alleen lokaal).
 */
const p2024 = getJaar(2024)
const historie: Record<number, LijfrenteParams> = {
  2023: { ...p2024.inkomensvoorziening.waarde.lijfrente, franchise: 13646, inkomensgrens: 128810, maxJaarruimte: 34550, maxReserveringsruimte: 38000 },
  2022: {
    ...p2024.inkomensvoorziening.waarde.lijfrente,
    regime: 'pre-wtp',
    pct: 0.133,
    franchise: 12837,
    inkomensgrens: 114866,
    maxJaarruimte: 13570,
    maxReserveringsruimte: 7651,
    reserveringsruimtePctGrondslag: 0.17,
    terugkijkJaren: 7,
  },
}
const historieParams = (j: number) => historie[j]

const invoer2024 = (overschrijf: Partial<InkomensvoorzieningInvoer> = {}): InkomensvoorzieningInvoer => ({
  lijfrentePremies: 14500,
  aovPremies: 2250,
  premiegrondslagInkomenVorigJaar: 92300,
  historie: [
    { jaar: 2019, premiegrondslagInkomen: 64200, alGebruikt: 6050, jaarruimteOverride: 6050 },
    { jaar: 2020, premiegrondslagInkomen: 71500, alGebruikt: 7120, jaarruimteOverride: 7120 },
    { jaar: 2021, premiegrondslagInkomen: 84300, alGebruikt: 9450, jaarruimteOverride: 9450 },
    { jaar: 2022, premiegrondslagInkomen: 97600, alGebruikt: 5840, jaarruimteOverride: 11274 },
    { jaar: 2023, premiegrondslagInkomen: 88500, forToenameVorigJaar: 2740, alGebruikt: 0, jaarruimteOverride: 20539 },
  ],
  ...overschrijf,
})

const ctx2024 = { params: p2024, jaar: 2024, geboortedatum: '1983-09-21', historieParams }

describe('voorbeeldhistorie 2024', () => {
  const r = berekenInkomensvoorziening(invoer2024(), ctx2024)

  it('jaarruimte 2024 = 30% × (92.300 − 17.545) = 22.427 (naar boven)', () => {
    expect(r.jaarruimte).toBe(22427)
    expect(r.uitleg.find((u) => u.id === 'lijfrente.verrekenbaar')?.formule).toBe('30% × 74.755')
  })

  it('boekt de inleg eerst op de oudste reserveringsruimte: 5.434 op 2022 en 9.066 op 2023', () => {
    const rij = (j: number) => r.tabel.find((x) => x.jaar === j)!
    expect(rij(2022)).toMatchObject({ jaarruimte: 11274, nietBenutBegin: 5434, ditJaarBenut: 5434, resterend: 0, vervaltNa: 2032 })
    expect(rij(2023)).toMatchObject({ jaarruimte: 20539, nietBenutBegin: 20539, ditJaarBenut: 9066, resterend: 11473, vervaltNa: 2033 })
    expect(rij(2024)).toMatchObject({ jaarruimte: 22427, nietBenutBegin: 22427, ditJaarBenut: 0, resterend: 22427, vervaltNa: 2034 })
    expect(r.reserveringsruimte).toBe(5434 + 20539)
  })

  it('aftrek 14.500 + AOV 2.250 = 16.750', () => {
    expect(r.lijfrenteAftrek).toBe(14500)
    expect(r.aovAftrek).toBe(2250)
    expect(r.forOmzettingAftrek).toBe(0)
    expect(r.nietAftrekbaar).toBe(0)
    expect(r.totaal).toBe(16750)
  })

  it('tabel in de volgorde van het rapport en totaal niet-gebruikt 48.400', () => {
    expect(r.tabel.map((x) => x.jaar)).toEqual([2024, 2023, 2022, 2021, 2020, 2019])
    expect(r.tabel.reduce((s, x) => s + x.nietBenutBegin, 0)).toBe(48400)
  })

  it('meldt wat er na dit jaar nog openstaat, zonder em-dashes', () => {
    const w = r.waarschuwingen.find((x) => x.id === 'lijfrente.openstaand')
    expect(w?.tekst).toContain('33.900')
    const tekst = [...r.uitleg.flatMap((u) => [u.label, u.formule ?? '']), ...r.waarschuwingen.map((x) => x.tekst)].join('\n')
    expect(tekst).not.toMatch(/[—→]/)
  })
})

describe('jaarruimte uit de regels van eerdere jaren', () => {
  it('2023: 30% × 77.594 = 23.279 (naar boven), min toename FOR 2.740 = 20.539', () => {
    const j = berekenJaarruimte(historie[2023], { inkomen: 88500, forToename: 2740 })
    expect(j.premiegrondslag).toBe(77594)
    expect(j.verrekenbaar).toBe(23279)
    expect(j.jaarruimte).toBe(20539)
  })

  it('2022: 13,3% × 84.763 = 11.274', () => {
    expect(berekenJaarruimte(historie[2022], { inkomen: 97600 }).jaarruimte).toBe(11274)
  })

  it('zonder overrides komt dezelfde toerekening uit', () => {
    const iv = invoer2024()
    iv.historie = iv.historie!.map((h) => (h.jaar >= 2022 ? { ...h, jaarruimteOverride: undefined } : h))
    const r = berekenInkomensvoorziening(iv, ctx2024)
    expect(r.tabel.find((x) => x.jaar === 2022)?.ditJaarBenut).toBe(5434)
    expect(r.tabel.find((x) => x.jaar === 2023)?.resterend).toBe(11473)
    expect(r.lijfrenteAftrek).toBe(14500)
  })

  it('valt terug op de regels van het jaar zelf met een waarschuwing als historieParams ontbreekt', () => {
    const iv = invoer2024({ historie: [{ jaar: 2023, premiegrondslagInkomen: 88500, forToenameVorigJaar: 2740, alGebruikt: 0 }] })
    const r = berekenInkomensvoorziening(iv, { ...ctx2024, historieParams: undefined })
    expect(r.waarschuwingen.some((w) => w.id === 'lijfrente.historieParams')).toBe(true)
  })

  it('trekt de pensioencorrectie af (factor A × 6,27 of Wtp-premie) en begrenst op het maximum', () => {
    expect(berekenJaarruimte(p2024.inkomensvoorziening.waarde.lijfrente, { inkomen: 60000, pensioencorrectie: { type: 'factorA', bedrag: 1000 } }).jaarruimte).toBe(
      Math.ceil(0.3 * (60000 - 17545) - 1e-9) - 6270,
    )
    expect(berekenJaarruimte(p2024.inkomensvoorziening.waarde.lijfrente, { inkomen: 60000, pensioencorrectie: { type: 'wtpPremie', bedrag: 2500 } }).jaarruimte).toBe(12737 - 2500)
    expect(berekenJaarruimte(p2024.inkomensvoorziening.waarde.lijfrente, { inkomen: 500000 }).jaarruimte).toBe(36077)
  })
})

describe('2021-achtig, oude regeling (pre-Wtp)', () => {
  function params2021(): TaxYearParams {
    const p = kloon(p2024)
    p.jaar = 2021
    p.inkomensvoorziening.waarde.lijfrente = {
      ...p.inkomensvoorziening.waarde.lijfrente,
      regime: 'pre-wtp',
      pct: 0.133,
      franchise: 12672,
      inkomensgrens: 112189,
      maxJaarruimte: 13284,
      maxReserveringsruimte: 7489,
      reserveringsruimtePctGrondslag: 0.17,
      terugkijkJaren: 7,
    }
    return p
  }

  it('reserveringsruimte begrensd op 7.489 (2019: 4.050, 2020: 3.439) en 1.511 uit jaarruimte 2021', () => {
    const r = berekenInkomensvoorziening(
      {
        lijfrentePremies: 9000,
        aovPremies: 0,
        premiegrondslagInkomenVorigJaar: 84300,
        forToenameVorigJaar: 2900,
        historie: [
          { jaar: 2017, premiegrondslagInkomen: 38500, alGebruikt: 2600, jaarruimteOverride: 2600 },
          { jaar: 2018, premiegrondslagInkomen: 52700, alGebruikt: 4100, jaarruimteOverride: 4100 },
          { jaar: 2019, premiegrondslagInkomen: 64200, alGebruikt: 2000, jaarruimteOverride: 6050 },
          { jaar: 2020, premiegrondslagInkomen: 71500, alGebruikt: 0, jaarruimteOverride: 7120 },
        ],
      },
      { params: params2021(), jaar: 2021, geboortedatum: '1983-09-21' },
    )
    expect(r.jaarruimte).toBe(7013)
    expect(r.reserveringsruimte).toBe(7489)
    const rij = (j: number) => r.tabel.find((x) => x.jaar === j)!
    expect(rij(2019)).toMatchObject({ nietBenutBegin: 4050, ditJaarBenut: 4050, resterend: 0 })
    expect(rij(2020)).toMatchObject({ nietBenutBegin: 7120, ditJaarBenut: 3439, resterend: 3681 })
    expect(rij(2021)).toMatchObject({ jaarruimte: 7013, ditJaarBenut: 1511, resterend: 5502 })
    expect(r.lijfrenteAftrek).toBe(9000)
    expect(r.totaal).toBe(9000)
    expect(r.tabel.reduce((s, x) => s + x.nietBenutBegin, 0)).toBe(18183)
  })
})

describe('grenzen en waarschuwingen', () => {
  it('meer dan de ruimte: niet aftrekbaar, met de saldomethode in de waarschuwing', () => {
    const r = berekenInkomensvoorziening(invoer2024({ lijfrentePremies: 60000 }), ctx2024)
    expect(r.lijfrenteAftrek).toBe(25973 + 22427)
    expect(r.nietAftrekbaar).toBe(60000 - 48400)
    const w = r.waarschuwingen.find((x) => x.id === 'lijfrente.teVeel')
    expect(w?.ernst).toBe('actie')
    expect(w?.tekst).toContain('2.269')
  })

  it('reserveringsruimte begrensd op het maximum van het jaar', () => {
    const iv = invoer2024({
      lijfrentePremies: 80000,
      historie: [
        { jaar: 2022, premiegrondslagInkomen: 0, alGebruikt: 0, jaarruimteOverride: 30000 },
        { jaar: 2023, premiegrondslagInkomen: 0, alGebruikt: 0, jaarruimteOverride: 30000 },
      ],
    })
    const r = berekenInkomensvoorziening(iv, ctx2024)
    expect(r.reserveringsruimte).toBe(41608)
    expect(r.tabel.find((x) => x.jaar === 2022)?.ditJaarBenut).toBe(30000)
    expect(r.tabel.find((x) => x.jaar === 2023)?.ditJaarBenut).toBe(11608)
  })

  it('vervallen jaren tellen niet mee; ruimte die na dit jaar vervalt geeft een waarschuwing', () => {
    const iv = invoer2024({
      lijfrentePremies: 0,
      historie: [
        { jaar: 2013, premiegrondslagInkomen: 0, alGebruikt: 0, jaarruimteOverride: 1000 },
        { jaar: 2014, premiegrondslagInkomen: 0, alGebruikt: 0, jaarruimteOverride: 2000 },
      ],
    })
    const r = berekenInkomensvoorziening(iv, ctx2024)
    expect(r.reserveringsruimte).toBe(2000)
    expect(r.waarschuwingen.map((w) => w.id)).toEqual(expect.arrayContaining(['lijfrente.vervallen', 'lijfrente.vervaltDitJaar']))
  })

  it('na AOW-leeftijd plus vijf jaar geen lijfrenteaftrek, AOV wel', () => {
    const r = berekenInkomensvoorziening(invoer2024(), { ...ctx2024, geboortedatum: '1950-03-01' })
    expect(r.lijfrenteAftrek).toBe(0)
    expect(r.aovAftrek).toBe(2250)
    expect(r.nietAftrekbaar).toBe(14500)
    expect(r.waarschuwingen.some((w) => w.id === 'lijfrente.leeftijd')).toBe(true)
    // in het jaar waarin iemand 72 wordt (op 1 januari nog 71) mag het nog
    expect(berekenInkomensvoorziening(invoer2024(), { ...ctx2024, geboortedatum: '1952-03-01' }).lijfrenteAftrek).toBe(14500)
  })

  it('FOR-omzetting komt bovenop de ruimte', () => {
    const r = berekenInkomensvoorziening(invoer2024({ forOmzetting: 9640 }), ctx2024)
    expect(r.forOmzettingAftrek).toBe(9640)
    expect(r.totaal).toBe(16750 + 9640)
  })

  it('inkomen uit de context als de invoer het niet heeft', () => {
    const r = berekenInkomensvoorziening(invoer2024({ premiegrondslagInkomenVorigJaar: undefined }), { ...ctx2024, premiegrondslagInkomenVorigJaar: 92300 })
    expect(r.jaarruimte).toBe(22427)
  })
})
