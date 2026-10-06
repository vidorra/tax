import { describe, expect, it } from 'vitest'
import { berekenBox2 } from '../../modules/box2'
import { getJaar } from '../../years'

const params = () => getJaar(2026)

describe('box 2', () => {
  it('rekent twee schijven voor een alleenstaande', () => {
    // 24,5% × 68.843 + 31% × 31.157 = 16.866,5 + 9.658,7 = 26.525,2
    const r = berekenBox2([{ eigenaar: 'A', dividend: 100000, ingehoudenDividendbelasting: 15000 }], { params: params(), personen: ['A'], aandeelA: 1, fiscaalPartner: false })
    expect(r.inkomen.A).toBe(100000)
    expect(r.belasting.A).toBe(26525)
    expect(r.dividendbelasting.A).toBe(15000)
  })

  it('verdeelt de pot van partners en benut tweemaal de eerste schijf', () => {
    const r = berekenBox2([{ eigenaar: 'A', dividend: 100000, ingehoudenDividendbelasting: 14000 }], { params: params(), personen: ['A', 'B'], aandeelA: 0.5, fiscaalPartner: true })
    expect(r.inkomen).toEqual({ A: 50000, B: 50000 })
    expect(r.belasting).toEqual({ A: 12250, B: 12250 })
    expect(r.dividendbelasting).toEqual({ A: 7000, B: 7000 })
  })

  it('kan bij partners alles aan één persoon toerekenen', () => {
    const r = berekenBox2(
      [
        { eigenaar: 'A', dividend: 60000, ingehoudenDividendbelasting: 9000 },
        { eigenaar: 'B', dividend: 40000, ingehoudenDividendbelasting: 6000 },
      ],
      { params: params(), personen: ['A', 'B'], aandeelA: 1, fiscaalPartner: true },
    )
    expect(r.inkomen).toEqual({ A: 100000, B: 0 })
    expect(r.belasting.A).toBe(26525)
    expect(r.dividendbelasting).toEqual({ A: 15000, B: 0 })
  })

  it('houdt zonder fiscaal partner ieders eigen inkomen aan', () => {
    const r = berekenBox2(
      [
        { eigenaar: 'A', dividend: 10000, ingehoudenDividendbelasting: 1500 },
        { eigenaar: 'B', dividend: 20000, ingehoudenDividendbelasting: 3000 },
      ],
      { params: params(), personen: ['A', 'B'], aandeelA: 1, fiscaalPartner: false },
    )
    expect(r.inkomen).toEqual({ A: 10000, B: 20000 })
    expect(r.belasting).toEqual({ A: 2450, B: 4900 })
  })

  it('telt vervreemdingsvoordeel mee', () => {
    const r = berekenBox2([{ eigenaar: 'A', dividend: 0, ingehoudenDividendbelasting: 0, vervreemdingsvoordeel: 50000 }], { params: params(), personen: ['A'], aandeelA: 1, fiscaalPartner: false })
    expect(r.belasting.A).toBe(12250)
  })

  it('waarschuwt bij een schuld aan de BV boven de grens voor excessief lenen', () => {
    const r = berekenBox2([{ eigenaar: 'A', dividend: 0, ingehoudenDividendbelasting: 0, schuldAanBV: 600000 }], { params: params(), personen: ['A'], aandeelA: 1, fiscaalPartner: false })
    expect(r.waarschuwingen.find((w) => w.id === 'box2-excessief-lenen')?.ernst).toBe('actie')
  })

  it('geeft nullen zonder invoer', () => {
    const r = berekenBox2(undefined, { params: params(), personen: ['A', 'B'], aandeelA: 1, fiscaalPartner: true })
    expect(r.belasting).toEqual({ A: 0, B: 0 })
  })
})
