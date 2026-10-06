import { describe, expect, it } from 'vitest'
import type { PersoonInvoer } from '../../types'
import { getJaar } from '../../years'
import { berekenLoonEnOverig, berekenReisaftrek } from '../../modules/loon-en-overig'

const persoon = (p: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id: 'B',
  geboortedatum: '1994-06-15',
  ondernemingen: [],
  loon: [],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...p,
})

describe('loon en overige inkomsten', () => {
  const params = getJaar(2026)

  it('deelt loon, uitkeringen en arbeidsinkomen correct in (ZEZ telt als arbeidsinkomen)', () => {
    const r = berekenLoonEnOverig(
      persoon({
        loon: [
          { omschrijving: 'Werkgever', soort: 'loon', bruto: 30000, ingehoudenLoonheffing: 5000, zvwBijdrageloon: 30000 },
          { omschrijving: 'ZEZ-uitkering', soort: 'uwv-zez', bruto: 8000, ingehoudenLoonheffing: 1200, zvwBijdrageloon: 8000 },
          { omschrijving: 'WW', soort: 'uwv-overig', bruto: 2000, ingehoudenLoonheffing: 300 },
          { omschrijving: 'Pensioenfonds', soort: 'pensioen', bruto: 1000, ingehoudenLoonheffing: 100 },
        ],
        resultaatOverigWerk: 500,
        periodiekeUitkeringen: 300,
      }),
      { params },
    )
    expect(r.loon).toBe(31000)
    expect(r.uwv).toBe(10000)
    expect(r.overigWerk).toBe(500)
    expect(r.periodiek).toBe(300)
    expect(r.loonheffing).toBe(6600)
    expect(r.zvwBijdrageloon).toBe(38000)
    expect(r.arbeidsinkomenDeel).toBe(38500)
    expect(r.waarschuwingen.some((w) => w.id === 'loon.zez')).toBe(true)
  })

  it('zonder invoer alles nul', () => {
    const r = berekenLoonEnOverig(persoon(), { params })
    expect(r).toMatchObject({ loon: 0, uwv: 0, overigWerk: 0, periodiek: 0, reisaftrek: 0, loonheffing: 0, arbeidsinkomenDeel: 0 })
  })
})

describe('reisaftrek openbaar vervoer', () => {
  const params = getJaar(2026)
  it('tabelbedrag bij 4 of meer dagen per week, hele jaar', () => {
    expect(berekenReisaftrek({ enkeleReisKm: 25, dagenPerWeek: 4, maanden: 12, vergoedingWerkgever: 0 }, params).bedrag).toBe(1268)
    expect(berekenReisaftrek({ enkeleReisKm: 25, dagenPerWeek: 5, maanden: 12, vergoedingWerkgever: 0 }, params).bedrag).toBe(1268)
  })
  it('naar rato van dagen en maanden, min de vergoeding', () => {
    const r = berekenLoonEnOverig(persoon({ reisaftrekOV: { enkeleReisKm: 25, dagenPerWeek: 2, maanden: 6, vergoedingWerkgever: 100 } }), { params })
    expect(r.reisaftrek).toBe(217)
    const regel = r.uitleg.find((u) => u.id === 'loon.reisaftrek')
    expect(regel?.formule).toBe('1.268 (vanaf 20 km) × 2/4 dagen × 6/12 maanden − vergoeding werkgever 100')
  })
  it('geen aftrek onder de kortste afstand of als de vergoeding hoger is', () => {
    expect(berekenReisaftrek({ enkeleReisKm: 5, dagenPerWeek: 5, maanden: 12, vergoedingWerkgever: 0 }, params).bedrag).toBe(0)
    expect(berekenReisaftrek({ enkeleReisKm: 25, dagenPerWeek: 5, maanden: 12, vergoedingWerkgever: 2000 }, params).bedrag).toBe(0)
    expect(berekenReisaftrek({ enkeleReisKm: 150, dagenPerWeek: 5, maanden: 12, vergoedingWerkgever: 0 }, params).bedrag).toBe(2649)
  })
})
