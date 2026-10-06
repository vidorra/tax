import { describe, expect, it } from 'vitest'
import type { BelastingrenteInvoer } from '../../types'
import { getJaar } from '../../years'
import { BELASTINGRENTE_IB } from '../../years/data/belastingrente'
import { berekenBelastingrente, dagen360, plus30, rentePerMaand } from '../../modules/planning/belastingrente'

const reken = (invoer: BelastingrenteInvoer) => berekenBelastingrente(invoer, { params: getJaar(invoer.belastingjaar), tabel: BELASTINGRENTE_IB })
const pctOp = (datum: string) => BELASTINGRENTE_IB.find((p) => p.vanaf <= datum && (p.tot === null || p.tot >= datum))!.pct

describe('dagtelling 30/360', () => {
  it('telt begin- en einddag mee; de laatste dag van de maand telt als 30', () => {
    expect(dagen360('2026-07-01', '2026-08-26')).toBe(56)
    expect(dagen360('2025-07-01', '2025-12-31')).toBe(180)
    expect(dagen360('2026-01-01', '2026-02-25')).toBe(55)
    expect(dagen360('2026-01-01', '2026-02-28')).toBe(60)
    expect(dagen360('2026-07-01', '2026-10-12')).toBe(102)
    expect(dagen360('2026-08-01', '2026-07-01')).toBe(0)
  })
  it('42 dagen na de dagtekening in maanden van 30 dagen', () => {
    expect(plus30('2024-06-27', 42)).toBe('2024-08-09')
    expect(plus30('2026-01-15', 42)).toBe('2026-02-27')
    expect(plus30('2026-09-01', 42)).toBe('2026-10-13')
    expect(plus30('2026-01-18', 42)).toBe('2026-02-28')
  })
})

describe('belastingrente volgens de wet, met de rekenwijze van de Belastingdienst als melding', () => {
  it('BR1: aangifte 15-6, conform, dagtekening 1-9: 102 dagen, 56 (praktijk 103 dagen, 57)', () => {
    const r = reken({ belastingjaar: 2025, soort: 'aanslag', bedrag: 4000, dagtekening: '2026-09-01', conform: true, ontvangstAangifte: '2026-06-15' })
    expect(r.perioden).toEqual([{ van: '2026-07-01', tot: '2026-10-12', dagen: 102, pct: 0.05, rente: 56.67 }])
    expect(r.bedrag).toBe(56)
    expect(r.reden).toBeNull()
    expect(r.praktijk?.bedrag).toBe(57)
    expect(r.praktijk?.perioden[0].dagen).toBe(103)
    expect(r.status).toBe('definitief')
  })

  it('BR2: over twee percentages, per periode: 325,00 + 76,39 = 401 (praktijk einde 27-2: 404)', () => {
    const r = reken({ belastingjaar: 2024, soort: 'aanslag', bedrag: 10000, dagtekening: '2026-01-15', conform: false })
    expect(r.perioden.map((p) => [p.van, p.tot, p.dagen, p.pct, p.rente])).toEqual([
      ['2025-07-01', '2025-12-31', 180, 0.065, 325],
      ['2026-01-01', '2026-02-25', 55, 0.05, 76.39],
    ])
    expect(r.bedrag).toBe(401)
    expect(r.praktijk?.bedrag).toBe(404)
    expect(r.praktijk?.perioden[1].tot).toBe('2026-02-27')
  })

  it('BR3: aangifte vóór 1 mei en conform: geen rente', () => {
    const r = reken({ belastingjaar: 2025, soort: 'aanslag', bedrag: 4000, dagtekening: '2026-09-01', conform: true, ontvangstAangifte: '2026-04-28' })
    expect(r.bedrag).toBe(0)
    expect(r.reden).toBe('geen-rente-voor-1-mei')
    expect(r.praktijk).toBeNull()
  })

  it('BR4: aangifte vóór 1 mei maar afwijkend: 71 dagen, 19 (praktijk 73 dagen, 20)', () => {
    const r = reken({ belastingjaar: 2025, soort: 'aanslag', bedrag: 2000, dagtekening: '2026-08-01', conform: false, ontvangstAangifte: '2026-04-28' })
    expect(r.perioden[0].dagen).toBe(71)
    expect(r.bedrag).toBe(19)
    expect(r.praktijk?.bedrag).toBe(20)
    expect(r.praktijk?.perioden[0].dagen).toBe(73)
  })

  it('BR5 en BD3: teruggaaf conform, 1-7 tot en met 26-8, 56 dagen: -8 (naar boven)', () => {
    const r = reken({ belastingjaar: 2025, soort: 'aanslag', bedrag: -1000, dagtekening: '2026-07-15', conform: true, ontvangstAangifte: '2026-03-10' })
    expect(r.perioden[0]).toMatchObject({ van: '2026-07-01', tot: '2026-08-26', dagen: 56 })
    expect(r.bedrag).toBe(-8)
    expect(r.praktijk).toBeNull()
  })

  it('BR5b: teruggaaf vastgesteld vóór 1 juli: 0', () => {
    const r = reken({ belastingjaar: 2025, soort: 'aanslag', bedrag: -1000, dagtekening: '2026-06-01', conform: true, ontvangstAangifte: '2026-03-10' })
    expect(r.bedrag).toBe(0)
    expect(r.reden).toBe('vastgesteld-voor-1-juli')
    expect(r.praktijk).toBeNull()
  })

  it('BR5c: teruggaaf met een verrekende voorlopige aanslag: herziening, niet berekend', () => {
    const r = reken({ belastingjaar: 2025, soort: 'aanslag', bedrag: -1000, dagtekening: '2026-07-15', conform: true, ontvangstAangifte: '2026-03-10', voorlopigeAanslagVerrekend: true })
    expect(r.bedrag).toBe(0)
    expect(r.reden).toBe('herziening-niet-berekend')
    expect(r.uitleg.some((u) => u.label === 'De rente volgt hier de regels voor herziening van de voorlopige aanslag; die rekent de tool niet.')).toBe(true)
  })

  it('teruggaaf binnen 13 weken na ontvangst: geen vergoeding', () => {
    const r = reken({ belastingjaar: 2025, soort: 'aanslag', bedrag: -1000, dagtekening: '2026-07-15', conform: true, ontvangstAangifte: '2026-05-01' })
    expect(r.bedrag).toBe(0)
    expect(r.reden).toBe('binnen-vergoedingstermijn')
  })

  it('BR6: voorlopige aanslag conform verzoek van 15-5: tot 21-8 (14 weken), 51 dagen tegen het percentage van 2027 uit de tabel: 23', () => {
    const r = reken({ belastingjaar: 2026, soort: 'voorlopig', bedrag: 3000, dagtekening: '2027-08-01', conform: true, ontvangstVerzoek: '2027-05-15' })
    expect(r.perioden).toHaveLength(1)
    expect(r.perioden[0]).toMatchObject({ van: '2027-07-01', tot: '2027-08-21', dagen: 51, pct: pctOp('2027-07-01') })
    expect(r.bedrag).toBe(Math.floor((3000 * pctOp('2027-07-01') * 51) / 360))
    expect(r.bedrag).toBe(23)
    expect(r.status).toBe('geschat')
    expect(r.praktijk).toBeNull()
  })

  it('BR6b: verzoek vóór 1 mei: geen rente', () => {
    const r = reken({ belastingjaar: 2026, soort: 'voorlopig', bedrag: 3000, dagtekening: '2027-08-01', conform: true, ontvangstVerzoek: '2027-04-25' })
    expect(r.bedrag).toBe(0)
    expect(r.reden).toBe('geen-rente-voor-1-mei')
  })

  it('BR7: IB 2023, afwijkend, dagtekening 1-8-2024: 71 dagen tegen het percentage van 2024: 14 (praktijk 15)', () => {
    const r = reken({ belastingjaar: 2023, soort: 'aanslag', bedrag: 1000, dagtekening: '2024-08-01', conform: false })
    expect(r.perioden[0].pct).toBe(pctOp('2024-07-01'))
    expect(r.bedrag).toBe(Math.floor((1000 * pctOp('2024-07-01') * 71) / 360))
    expect(r.bedrag).toBe(14)
    expect(r.praktijk?.bedrag).toBe(15)
  })

  it('BR8: navordering op verzoek: einde 12 weken na ontvangst (24-5), niet 30-9: 32,50 + 20,00 = 52', () => {
    const r = reken({ belastingjaar: 2024, soort: 'navordering', bedrag: 1000, dagtekening: '2026-09-01', conform: false, ontvangstVerzoek: '2026-03-01' })
    expect(r.perioden.map((p) => [p.van, p.tot, p.dagen, p.rente])).toEqual([
      ['2025-07-01', '2025-12-31', 180, 32.5],
      ['2026-01-01', '2026-05-24', 144, 20],
    ])
    expect(r.bedrag).toBe(52)
    expect(r.praktijk).toBeNull()
    expect(getJaar(2024).overig.waarde.belastingrenteRegels.navorderingVerzoekMaxWeken).toBe(12)
  })

  it('navordering zonder verzoek: tot de dag vóór invorderbaar (een maand na dagtekening)', () => {
    const r = reken({ belastingjaar: 2024, soort: 'navordering', bedrag: 1000, dagtekening: '2026-09-01', conform: false })
    expect(r.perioden[r.perioden.length - 1].tot).toBe('2026-09-30')
  })

  it('BD1: voorbeeld 1 van de Belastingdienst: tot 13-9-2024 (19 weken na ontvangst), 73 dagen: 15', () => {
    const r = reken({ belastingjaar: 2023, soort: 'aanslag', bedrag: 1000, dagtekening: '2024-12-04', conform: true, ontvangstAangifte: '2024-05-03' })
    expect(r.perioden[0]).toMatchObject({ van: '2024-07-01', tot: '2024-09-13', dagen: 73 })
    expect(r.bedrag).toBe(15)
    expect(r.praktijk).toBeNull()
  })

  it('BD2: voorbeeld 2: dagtekening 27-6: volgens de wet 0, volgens het voorbeeld 39 dagen, 8', () => {
    const r = reken({ belastingjaar: 2023, soort: 'aanslag', bedrag: 1000, dagtekening: '2024-06-27', conform: true, ontvangstAangifte: '2024-05-03' })
    expect(r.bedrag).toBe(0)
    expect(r.reden).toBe('vastgesteld-voor-1-juli')
    expect(r.praktijk?.bedrag).toBe(8)
    expect(r.praktijk?.perioden[0]).toMatchObject({ van: '2024-07-01', tot: '2024-08-09', dagen: 39 })
  })

  it('geen bedrag: geen rente', () => {
    expect(reken({ belastingjaar: 2025, soort: 'aanslag', bedrag: 0, dagtekening: '2026-09-01', conform: true }).reden).toBe('geen-bedrag')
  })

  it('rente per maand later tegen het percentage op de datum', () => {
    const ctx = { params: getJaar(2026), tabel: BELASTINGRENTE_IB }
    expect(rentePerMaand(4325, '2027-10-01', ctx).bedrag).toBe(Math.floor((4325 * pctOp('2027-10-01') * 30) / 360))
    expect(rentePerMaand(0, '2027-10-01', ctx).bedrag).toBe(0)
  })
})
