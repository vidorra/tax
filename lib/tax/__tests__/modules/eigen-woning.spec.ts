import { describe, expect, it } from 'vitest'
import { berekenEigenWoning } from '../../modules/eigen-woning'
import { getJaar, kloon } from '../../years'

describe('eigen woning', () => {
  it('rekent forfait en saldo van het voorbeeld 2024 (0,35%)', () => {
    const r = berekenEigenWoning({ woz: 412000, rente: 7860 }, { params: getJaar(2024), jaar: 2024 })
    expect(r.forfait).toBe(1442)
    expect(r.aftrekbareKosten).toBe(7860)
    expect(r.hillenAftrek).toBe(0)
    expect(r.saldo).toBe(-6418)
    expect(r.nietKwalificerendeSchuld).toBe(0)
  })

  it('rekent het voorbeeld 2021 (forfait 0,50%)', () => {
    const params = kloon(getJaar(2024))
    params.eigenWoning.waarde.forfait = [
      { tot: 12500, pct: 0 },
      { tot: 25000, pct: 0.002 },
      { tot: 50000, pct: 0.003 },
      { tot: 75000, pct: 0.004 },
      { tot: 1110000, pct: 0.005 },
      { tot: null, pct: 0.0235, vast: 5550 },
    ]
    const r = berekenEigenWoning({ woz: 338000, rente: 8940 }, { params, jaar: 2021 })
    expect(r.forfait).toBe(1690)
    expect(r.saldo).toBe(-7250)
  })

  it('is niet progressief: het percentage van de band geldt over de hele WOZ', () => {
    const r = berekenEigenWoning({ woz: 60000 }, { params: getJaar(2026), jaar: 2026 })
    expect(r.forfait).toBe(150) // 0,25% × 60.000
  })

  it('rekent in de hoogste band met het vaste bedrag plus 2,35% boven de grens', () => {
    const r = berekenEigenWoning({ woz: 1500000, rente: 20000 }, { params: getJaar(2026), jaar: 2026 })
    expect(r.forfait).toBe(8250) // 4.725 + 2,35% × 150.000
  })

  it('rekent het forfait naar rato van de dagen hoofdverblijf', () => {
    const r = berekenEigenWoning({ woz: 400000, periodeHoofdverblijf: { van: '2026-07-01', tot: '2026-12-31' } }, { params: getJaar(2026), jaar: 2026 })
    expect(r.forfait).toBe(706) // 1.400 × 184/365 = 705,75
  })

  it('past de Hillen-aftrek toe bij een positief saldo', () => {
    const r = berekenEigenWoning({ woz: 400000, rente: 0 }, { params: getJaar(2026), jaar: 2026 })
    expect(r.forfait).toBe(1400)
    expect(r.hillenAftrek).toBe(1006) // 71,867% × 1.400 = 1.006,1
    expect(r.saldo).toBe(394)
  })

  it('telt financieringskosten en erfpacht als aftrekbare kosten', () => {
    const r = berekenEigenWoning({ woz: 400000, rente: 1000, financieringskosten: 2500, erfpacht: 300 }, { params: getJaar(2026), jaar: 2026 })
    expect(r.aftrekbareKosten).toBe(3800)
    expect(r.saldo).toBe(-2400)
  })

  it('sluit aflossingsvrije leningdelen van na 2013 uit en meldt de schuld voor box 3', () => {
    const r = berekenEigenWoning(
      {
        woz: 400000,
        leningdelen: [
          { omschrijving: 'Annuïtair deel', hoofdsom: 200000, startdatum: '2015-05-01', aflossingsvorm: 'annuitair', rente: 3000 },
          { omschrijving: 'Aflossingsvrij deel', hoofdsom: 50000, startdatum: '2018-01-01', aflossingsvorm: 'aflossingsvrij', rente: 1000 },
          { omschrijving: 'Oud aflossingsvrij deel', hoofdsom: 40000, startdatum: '2010-01-01', aflossingsvorm: 'aflossingsvrij', rente: 800, overgangsrecht: true },
        ],
      },
      { params: getJaar(2026), jaar: 2026 },
    )
    expect(r.aftrekbareKosten).toBe(3800)
    expect(r.nietKwalificerendeSchuld).toBe(50000)
    expect(r.waarschuwingen.map((w) => w.id)).toContain('ew-box3-schuld')
  })

  it('schuld van vóór 2001: de 30 jaar lopen vanaf 1 januari 2001, dus in 2026 nog volledig aftrekbaar', () => {
    // Herzien in de fiscale review van 4-10-2026: deze test verwachtte eerder 1.810 (einde 1-7-2026) en 0 voor een
    // lening uit 1995. Voor een eigenwoningschuld die al vóór 2001 bestond, loopt de termijn van 30 jaar echter vanaf
    // 1 januari 2001 (overgangsrecht Wet IB 2001), dus tot 1 januari 2031.
    const r = berekenEigenWoning(
      { woz: 400000, leningdelen: [{ omschrijving: 'Lening 1996', hoofdsom: 100000, startdatum: '1996-07-01', aflossingsvorm: 'annuitair', rente: 3650 }] },
      { params: getJaar(2026), jaar: 2026 },
    )
    expect(r.aftrekbareKosten).toBe(3650)
    const oud = berekenEigenWoning(
      { woz: 400000, leningdelen: [{ omschrijving: 'Lening 1995', hoofdsom: 80000, startdatum: '1995-03-01', aflossingsvorm: 'annuitair', rente: 2000 }] },
      { params: getJaar(2026), jaar: 2026 },
    )
    expect(oud.aftrekbareKosten).toBe(2000)
    expect(oud.nietKwalificerendeSchuld).toBe(0)
  })

  it('stopt de renteaftrek na de termijn, tijdsevenredig in het laatste jaar', () => {
    // Met de echte parameters eindigt geen enkele termijn vóór 2031; daarom een kopie met een termijn van 25 jaar.
    const p = getJaar(2026)
    p.eigenWoning.waarde.maxAftrekJaren = 25
    const r = berekenEigenWoning(
      { woz: 400000, leningdelen: [{ omschrijving: 'Lening 2001', hoofdsom: 100000, startdatum: '2001-07-01', aflossingsvorm: 'annuitair', rente: 3650 }] },
      { params: p, jaar: 2026 },
    )
    expect(r.aftrekbareKosten).toBe(1810) // einde 1-7-2026: 3.650 × 181/365 = 1.810
    const verlopen = berekenEigenWoning(
      { woz: 400000, leningdelen: [{ omschrijving: 'Lening 1995', hoofdsom: 80000, startdatum: '1995-03-01', aflossingsvorm: 'annuitair', rente: 2000 }] },
      { params: p, jaar: 2026 },
    )
    // termijn vanaf 1-1-2001, 25 jaar: einde 1-1-2026, dus verlopen
    expect(verlopen.aftrekbareKosten).toBe(0)
    expect(verlopen.nietKwalificerendeSchuld).toBe(80000)
  })
})
