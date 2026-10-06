import { describe, expect, it } from 'vitest'
import { getJaar } from '../../years'
import { BELASTINGRENTE_IB } from '../../years/data/belastingrente'
import { adviesVoorlopigeAanslag, termijnen } from '../../modules/planning/voorlopige-aanslag'

const pctOp = (datum: string) => BELASTINGRENTE_IB.find((p) => p.vanaf <= datum && (p.tot === null || p.tot >= datum))!.pct

describe('termijnen (Invorderingswet art. 9)', () => {
  it('T1: dagtekening 20-2-2026: 10 termijnen van 550, de eerste op 20-3-2026', () => {
    const t = termijnen(5500, '2026-02-20', 2026, getJaar(2026))
    expect(t.regel).toBe('in-jaar')
    expect(t.termijnen).toHaveLength(10)
    expect(t.termijnen.every((x) => x.bedrag === 550)).toBe(true)
    expect(t.termijnen[0].vervaldatum).toBe('2026-03-20')
    expect(t.termijnen[9].vervaldatum).toBe('2026-12-20')
  })

  it('T2: dagtekening vóór het jaar: 12 termijnen van 500, de eerste eind januari', () => {
    const t = termijnen(6000, '2025-12-15', 2026, getJaar(2026))
    expect(t.regel).toBe('voor-jaar')
    expect(t.termijnen).toHaveLength(12)
    expect(t.termijnen[0]).toEqual({ vervaldatum: '2026-01-31', bedrag: 500 })
    expect(t.termijnen[1].vervaldatum).toBe('2026-02-28')
  })

  it('T3: dagtekening 10-11-2026: in één keer, invorderbaar 22-12-2026', () => {
    const t = termijnen(1200, '2026-11-10', 2026, getJaar(2026))
    expect(t).toEqual({ regel: 'een-keer', termijnen: [{ vervaldatum: '2026-12-22', bedrag: 1200 }] })
  })

  it('T4: voorlopige teruggaaf 2.400, dagtekening 20-2-2026: 11 termijnen van 218,18, de eerste eind februari', () => {
    const t = termijnen(-2400, '2026-02-20', 2026, getJaar(2026))
    expect(t.regel).toBe('teruggaaf-in-jaar')
    expect(t.termijnen).toHaveLength(11)
    expect(t.termijnen[0]).toEqual({ vervaldatum: '2026-02-28', bedrag: -218.18 })
  })

  it('T5: een verhoging is een nieuwe voorlopige aanslag: 6 termijnen van 400 vanaf 1-7-2027, naast 9 van 444,44', () => {
    const p = getJaar(2027)
    const oorspronkelijk = termijnen(4000, '2027-03-15', 2027, p)
    expect(oorspronkelijk.termijnen).toHaveLength(9)
    expect(oorspronkelijk.termijnen[0]).toEqual({ vervaldatum: '2027-04-15', bedrag: 444.44 })
    const verhoging = termijnen(2400, '2027-06-01', 2027, p)
    expect(verhoging.termijnen).toHaveLength(6)
    expect(verhoging.termijnen[0]).toEqual({ vervaldatum: '2027-07-01', bedrag: 400 })
  })

  it('na afloop van het jaar in één keer', () => {
    expect(termijnen(1000, '2027-02-01', 2026, getJaar(2026)).regel).toBe('na-jaar')
  })
})

describe('advies per persoon (VA1)', () => {
  const ctx = { params: getJaar(2026), tabel: BELASTINGRENTE_IB }
  const scenario = { verwachteDagtekening: '2027-09-01', indieningsdatum: '2027-06-15', verwachtConform: true }

  it('A: nog 3.400 IB en 200 Zvw bij te betalen; rente bij aangifte 15-6-2027 en aanslag 1-9-2027: 52 en 3', () => {
    const a = adviesVoorlopigeAanslag(
      { persoon: 'A', belastingjaar: 2026, ib: { verwacht: 18400, voorheffingen: 0, opgelegd: 15000 }, zvw: { verwacht: 3100, voorheffingen: 0, opgelegd: 2900 }, vandaag: '2026-10-05', scenario },
      ctx,
    )
    expect(a.status).toBe('te-laag')
    expect(a.ib.verschil).toBe(3400)
    expect(a.zvw.verschil).toBe(200)
    expect(a.ib.advies).toBe(18400)
    const p = pctOp('2027-07-01')
    expect(a.rente?.ib?.bedrag).toBe(Math.floor((3400 * p * 102) / 360))
    expect(a.rente?.ib?.bedrag).toBe(52)
    expect(a.rente?.zvw?.bedrag).toBe(3)
    expect(a.waarschuwingen[0].tekst).toContain('Vraag vóór 1 mei 2027 een hogere voorlopige aanslag aan, of dien de aangifte vóór 1 mei in')
    // Lopend jaar: termijnen als het verzoek nu wordt ingediend.
    expect(a.ib.termijnenBijVerzoek?.regel).toBeDefined()
  })

  it('B: 800 te veel betaald: te hoog', () => {
    const b = adviesVoorlopigeAanslag(
      { persoon: 'B', belastingjaar: 2026, ib: { verwacht: 6200, voorheffingen: 0, opgelegd: 7000 }, zvw: { verwacht: 1400, voorheffingen: 0, opgelegd: 1400 }, vandaag: '2026-10-05', scenario },
      ctx,
    )
    expect(b.status).toBe('te-hoog')
    expect(b.ib.verschil).toBe(-800)
    expect(b.rente).toBeNull()
  })

  it('verschil onder de aanslaggrens: past; zonder voorlopige aanslag en niets te betalen: niet nodig', () => {
    const past = adviesVoorlopigeAanslag({ persoon: 'A', belastingjaar: 2026, ib: { verwacht: 6220, voorheffingen: 0, opgelegd: 6200 }, zvw: { verwacht: 0, voorheffingen: 0, opgelegd: 0 }, vandaag: '2026-10-05' }, ctx)
    expect(past.status).toBe('past')
    expect(past.ib.binnenGrens).toBe(true)
    const niet = adviesVoorlopigeAanslag({ persoon: 'A', belastingjaar: 2026, ib: { verwacht: 3000, voorheffingen: 3010, opgelegd: 0 }, zvw: { verwacht: 0, voorheffingen: 0, opgelegd: 0 }, vandaag: '2026-10-05' }, ctx)
    expect(niet.status).toBe('niet-nodig')
  })

  it('zonder verwachte dagtekening geen rente-scenario', () => {
    const a = adviesVoorlopigeAanslag({ persoon: 'A', belastingjaar: 2026, ib: { verwacht: 18400, voorheffingen: 0, opgelegd: 15000 }, zvw: { verwacht: 0, voorheffingen: 0, opgelegd: 0 }, vandaag: '2026-10-05' }, ctx)
    expect(a.rente).toBeNull()
  })
})
