import { describe, expect, it } from 'vitest'
import { getJaar } from '../../years'
import { verrekenVerliezen } from '../../modules/verlies'

const ctx = { params: getJaar(2024), jaar: 2024 }

describe('verliesverrekening box 1', () => {
  it('verrekent vooruit, oudste eerst, tot het box 1-inkomen', () => {
    const r = verrekenVerliezen(
      50000,
      [
        { jaar: 2020, bedrag: 45000 },
        { jaar: 2016, bedrag: 10000 },
      ],
      ctx,
    )
    expect(r.verrekend).toBe(50000)
    expect(r.resterend).toEqual([{ jaar: 2020, bedrag: 5000, vervaltNa: 2029 }])
    expect(r.nieuwVerlies).toBe(0)
    expect(r.uitleg.filter((u) => u.id === 'verlies.verrekend').map((u) => u.label)).toEqual(['Verlies uit 2016', 'Verlies uit 2020'])
  })

  it('laat vervallen verliezen liggen en waarschuwt voor verlies dat na dit jaar vervalt', () => {
    const r = verrekenVerliezen(
      5000,
      [
        { jaar: 2014, bedrag: 1000 },
        { jaar: 2015, bedrag: 20000 },
      ],
      ctx,
    )
    expect(r.verrekend).toBe(5000)
    expect(r.resterend).toEqual([{ jaar: 2015, bedrag: 15000, vervaltNa: 2024 }])
    expect(r.waarschuwingen.map((w) => w.id)).toEqual(['verlies.vervallen', 'verlies.vervaltDitJaar'])
  })

  it('een nieuw verlies gaat eerst drie jaar terug (waarschuwing met teruggaaf)', () => {
    const r = verrekenVerliezen(-12000, [{ jaar: 2022, bedrag: 3000 }], ctx)
    expect(r.verrekend).toBe(0)
    expect(r.nieuwVerlies).toBe(12000)
    expect(r.resterend).toEqual([{ jaar: 2022, bedrag: 3000, vervaltNa: 2031 }])
    const w = r.waarschuwingen.find((x) => x.id === 'verlies.terug')
    expect(w?.ernst).toBe('actie')
    expect(w?.tekst).toContain('2021 tot en met 2023')
    expect(w?.tekst).toContain('terug')
    expect(w?.tekst).not.toMatch(/[—→]/)
  })

  it('negeert verliezen van dit of een later jaar', () => {
    expect(verrekenVerliezen(10000, [{ jaar: 2024, bedrag: 5000 }], ctx).verrekend).toBe(0)
  })
})
