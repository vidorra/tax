import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, PersoonInvoer } from '../../types'
import { getJaar } from '../../years'
import { berekenBox2Verlies, kortingTermijn, verrekenBox2Verliezen } from '../../modules/box2-verlies'
import { berekenHuishouden } from '../../engine'

const p2026 = getJaar(2026)
const ctx2026 = { params: p2026, jaar: 2026, paramsVorigJaar: getJaar(2025) }

describe('box 2-verlies: verrekening en terugwenteling', () => {
  it('B2-1: verlies 10.000, box 2 2025 was 4.000: terug 4.000 (teruggaaf 980), restant 6.000 tot en met 2032, belastbaar 0', () => {
    const v = verrekenBox2Verliezen(-10000, { box2InkomenVorigJaar: 4000 }, ctx2026)
    expect(v.verliesDitJaar).toBe(10000)
    expect(v.terugwenteling).toEqual({ bedrag: 4000, geschatteTeruggaaf: 980 })
    expect(v.resterend).toEqual([{ jaar: 2026, bedrag: 6000, vervaltNa: 2032 }])
    expect(v.belastbaar).toBe(0)
  })

  it('B2-1b: terugwenteling haalt eerst het bovenste deel weg: 20.392,74 − 14.700 = 5.693 (niet 4.900)', () => {
    const v = verrekenBox2Verliezen(-20000, { box2InkomenVorigJaar: 80000 }, ctx2026)
    expect(v.terugwenteling).toEqual({ bedrag: 20000, geschatteTeruggaaf: 5693 })
    expect(v.resterend).toEqual([])
  })

  it('zonder parameters van vorig jaar: schatting 0 met een uitlegregel', () => {
    const v = verrekenBox2Verliezen(-10000, { box2InkomenVorigJaar: 4000 }, { params: p2026, jaar: 2026 })
    expect(v.terugwenteling).toEqual({ bedrag: 4000, geschatteTeruggaaf: 0 })
    expect(v.uitleg.find((u) => u.id === 'box2-terugwenteling')?.label).toContain('geen parameters')
  })

  it('B2-2: verlies 2019 is in 2026 vervallen, wordt niet verrekend en rolt niet door', () => {
    const v = verrekenBox2Verliezen(5000, { box2Verliezen: [{ jaar: 2019, bedrag: 30000 }] }, ctx2026)
    expect(v.vervallen).toEqual([{ jaar: 2019, bedrag: 30000 }])
    expect(v.verrekend).toBe(0)
    expect(v.belastbaar).toBe(5000)
    expect(v.resterend).toEqual([])
  })

  it('B2-3: verlies 2017 (tot en met 2018 negen jaar) is in 2026 nog verrekenbaar', () => {
    const v = verrekenBox2Verliezen(5000, { box2Verliezen: [{ jaar: 2017, bedrag: 30000 }] }, ctx2026)
    expect(v.vervallen).toEqual([])
    expect(v.verrekend).toBe(5000)
    expect(v.resterend).toEqual([{ jaar: 2017, bedrag: 25000, vervaltNa: 2026 }])
  })

  it('B2-5: 2027 dividend 15.000, restant 6.000 uit 2026: belastbaar 9.000, restant 0', () => {
    const v = verrekenBox2Verliezen(15000, { box2Verliezen: [{ jaar: 2026, bedrag: 6000 }] }, { params: getJaar(2027), jaar: 2027 })
    expect(v.verrekend).toBe(6000)
    expect(v.belastbaar).toBe(9000)
    expect(v.resterend).toEqual([])
  })
})

describe('box 2-verlies: belastingkorting (art. 4.53)', () => {
  it('B2-4: verlies 2024 van 20.000, verzoek 2026: 24,5% × 20.000 = 4.900 vastgezet, door tot en met 2033; voorbeeld Belastingdienst 2032', () => {
    const r = berekenBox2Verlies(0, { box2Verliezen: [{ jaar: 2024, bedrag: 20000 }], box2Belastingkorting: { verzoek: true } }, { ...ctx2026, maxKorting: 1000 })
    expect(r.resterend).toEqual([])
    expect(r.belastingkorting.ditJaar).toBe(1000)
    expect(r.belastingkorting.resterend).toEqual([{ verliesjaar: 2024, eersteJaar: 2026, restant: 3900, uiterlijkJaar: 2033, praktijkUiterlijkJaar: 2032 }])
    // Zonder ruimte in box 1 staat de hele korting open.
    const leeg = berekenBox2Verlies(0, { box2Verliezen: [{ jaar: 2024, bedrag: 20000 }], box2Belastingkorting: { verzoek: true } }, { ...ctx2026, maxKorting: 0 })
    expect(leeg.belastingkorting.resterend[0].restant).toBe(4900)
  })

  it('B2-4b: verlies 2020, eerste korting 2026: uiterlijk 2029 (verliesjaar + 9), geen afwijkend jaar van de Belastingdienst', () => {
    expect(kortingTermijn(2020, 2026, p2026)).toEqual({ uiterlijkJaar: 2029 })
    expect(kortingTermijn(2024, 2026, p2026)).toEqual({ uiterlijkJaar: 2033, praktijkUiterlijkJaar: 2032 })
  })

  it('lopende korting: het bedrag blijft in euro\'s, ook als het tarief later verandert; vervallen kortingen tellen niet', () => {
    const r = berekenBox2Verlies(
      0,
      { box2Belastingkorting: { lopend: [{ verliesjaar: 2024, eersteJaar: 2026, restant: 3900 }, { verliesjaar: 2015, eersteJaar: 2016, restant: 500 }] } },
      { params: getJaar(2027), jaar: 2027, maxKorting: 10000 },
    )
    expect(r.belastingkorting.ditJaar).toBe(3900)
    expect(r.belastingkorting.resterend).toEqual([])
  })

  it('een verzoek met aanmerkelijk belang in dit jaar geeft een let op', () => {
    const r = berekenBox2Verlies(0, { box2Verliezen: [{ jaar: 2024, bedrag: 20000 }], box2Belastingkorting: { verzoek: true } }, { ...ctx2026, maxKorting: 0, abDitJaar: true })
    expect(r.waarschuwingen.map((w) => w.id)).toContain('box2-korting-ab')
  })
})

describe('engine: box 2-verlies per persoon', () => {
  const persoon = (extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
    id: 'A',
    geboortedatum: '1980-01-01',
    ondernemingen: [],
    loon: [{ omschrijving: 'Acme BV', soort: 'loon', bruto: 50000, ingehoudenLoonheffing: 0 }],
    inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
    ...extra,
  })
  const huishouden = (p: PersoonInvoer, box2: HuishoudenInvoer['box2'], jaar = 2026): HuishoudenInvoer => ({
    jaar,
    personen: [p],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    box2,
    verdeling: 'optimaal',
  })

  it('B2-1 in de engine: verzamelinkomen bevat het verlies, belastbaar box 2 is 0, restant 6.000', () => {
    const r = berekenHuishouden(huishouden(persoon({ box2InkomenVorigJaar: 4000 }), [{ eigenaar: 'A', dividend: 0, ingehoudenDividendbelasting: 0, vervreemdingsvoordeel: -10000 }]))
    const p = r.personen[0]
    expect(p.box2Belasting).toBe(0)
    expect(p.box2Verlies?.verliesDitJaar).toBe(10000)
    expect(p.box2Verlies?.terugwenteling?.geschatteTeruggaaf).toBe(980)
    expect(p.box2Verlies?.resterend).toEqual([{ jaar: 2026, bedrag: 6000, vervaltNa: 2032 }])
    expect(p.verzamelinkomen).toBe(p.box1.inkomen - 10000)
  })

  it('B2-5 in de engine: verrekening verlaagt de belasting, niet het verzamelinkomen', () => {
    const zonder = berekenHuishouden(huishouden(persoon(), [{ eigenaar: 'A', dividend: 15000, ingehoudenDividendbelasting: 0 }], 2027))
    const met = berekenHuishouden(huishouden(persoon({ box2Verliezen: [{ jaar: 2026, bedrag: 6000 }] }), [{ eigenaar: 'A', dividend: 15000, ingehoudenDividendbelasting: 0 }], 2027))
    const tarief = getJaar(2027).box2.waarde.schijven[0].tarief
    expect(met.personen[0].box2Belasting).toBe(Math.floor(9000 * tarief))
    expect(met.personen[0].verschuldigdIB).toBe(zonder.personen[0].verschuldigdIB - (zonder.personen[0].box2Belasting - met.personen[0].box2Belasting))
    expect(met.personen[0].verzamelinkomen).toBe(zonder.personen[0].verzamelinkomen)
    expect(met.personen[0].box2Verlies?.resterend).toEqual([])
  })

  it('belastingkorting gaat af van de belasting in box 1', () => {
    const zonder = berekenHuishouden(huishouden(persoon(), undefined))
    const met = berekenHuishouden(huishouden(persoon({ box2Verliezen: [{ jaar: 2024, bedrag: 20000 }], box2Belastingkorting: { verzoek: true } }), undefined))
    expect(met.personen[0].box2Verlies?.belastingkorting.ditJaar).toBe(4900)
    expect(met.personen[0].verschuldigdIB).toBe(zonder.personen[0].verschuldigdIB - 4900)
  })

  it('zonder box 2-verlies verandert er niets', () => {
    const r = berekenHuishouden(huishouden(persoon(), [{ eigenaar: 'A', dividend: 5000, ingehoudenDividendbelasting: 750 }]))
    expect(r.personen[0].box2Verlies).toBeUndefined()
  })
})
