/**
 * Ronde 2 (A4), test 2: eigenschapstests voor getallen en datums (heen en terug, minteken, valutatekens, spaties).
 */
import { describe, expect, it } from 'vitest'
import { amsterdamDatum, centen, datumUitNaam, leesDatum, leesGetal, schrijfGetal, verdeelNaarRato } from '../getallen'

/** Kleine deterministische generator, zodat een fout altijd terug te halen is. */
function generator(zaad: number) {
  let s = zaad >>> 0
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0
    return s / 2 ** 32
  }
}

describe('leesGetal: voorbeelden uit echte exports', () => {
  it.each([
    ['1.250,00', 1250],
    ['1,250.00', 1250],
    ['-€597.49846', -597.49846],
    ['84,2637 ', 84.2637],
    ['-2,50', -2.5],
    ['"-1147,50"'.replace(/"/g, ''), -1147.5],
    ['€1.00', 1],
    ['-€86.00', -86],
    ['€ 1.234,56', 1234.56],
    ['EUR 3,91', 3.91],
    ['3,91 EUR', 3.91],
    ['(12,50)', -12.5],
    ['1 250,00', 1250],
    ['1 250,00', 1250],
    ['+42', 42],
    ['−7,5', -7.5],
    ['0,00 ', 0],
    ['0.92139706', 0.92139706],
    ['1.250.000', 1250000],
    ['.5', 0.5],
  ])('%s geeft %s', (tekst, getal) => {
    expect(leesGetal(tekst)).toBe(getal)
  })

  it('niet-getallen geven null', () => {
    for (const t of ['', ' ', '-', 'abc', '1,2,3.4.5', '12a', 'Not available', '€', null, undefined]) expect(leesGetal(t as string)).toBeNull()
  })

  it('één scheidingsteken met drie cijfers volgt de decimaal van het bestand', () => {
    expect(leesGetal('1,250', '.')).toBe(1250)
    expect(leesGetal('1,250', ',')).toBe(1.25)
    expect(leesGetal('1.250', ',')).toBe(1250)
    expect(leesGetal('1.250', '.')).toBe(1.25)
    expect(leesGetal('0,445', '.')).toBe(0.445)
  })
})

describe('leesGetal: eigenschappen', () => {
  it('heen en terug in Nederlandse en Engelse notatie, met en zonder duizendtallen en valutateken', () => {
    const r = generator(20251005)
    for (let i = 0; i < 2000; i++) {
      const grootte = 10 ** Math.floor(r() * 9)
      const x = Math.round((r() - 0.5) * grootte * 2 * 100) / 100
      for (const stijl of ['nl', 'en'] as const) {
        for (const groep of [true, false]) {
          const tekst = schrijfGetal(x, stijl, 2, groep)
          const dec = stijl === 'nl' ? ',' : '.'
          expect(leesGetal(tekst, dec), tekst).toBe(x === 0 ? 0 : x)
          expect(leesGetal(` ${tekst} `, dec), `spaties ${tekst}`).toBe(x === 0 ? 0 : x)
          const metTeken = x < 0 ? `-€${tekst.slice(1)}` : `€${tekst}`
          expect(leesGetal(metTeken, dec), metTeken).toBe(x === 0 ? 0 : x)
        }
      }
    }
  })

  it('het minteken keert alleen het teken om', () => {
    const r = generator(7)
    for (let i = 0; i < 500; i++) {
      const x = Math.round(r() * 1e6) / 100
      const t = schrijfGetal(x, 'nl')
      expect(leesGetal(`-${t}`, ',')).toBe(x === 0 ? 0 : -x)
      expect(leesGetal(`(${t})`, ',')).toBe(x === 0 ? 0 : -x)
    }
  })
})

describe('centen en verdelen', () => {
  it('centen rondt half naar boven af', () => {
    expect(centen(1.005)).toBe(1.01)
    expect(centen(-1.005)).toBe(-1.01)
    expect(centen(0.1 + 0.2)).toBe(0.3)
  })

  it('naar rato verdeeld is samen precies het totaal', () => {
    const r = generator(42)
    for (let i = 0; i < 300; i++) {
      const gewichten = Array.from({ length: 1 + Math.floor(r() * 8) }, () => Math.round(r() * 10000) / 100 - (r() < 0.2 ? 50 : 0))
      const totaal = Math.round((r() - 0.3) * 100000) / 100
      const delen = verdeelNaarRato(totaal, gewichten)
      expect(Math.round(delen.reduce((s, d) => s + d, 0) * 100)).toBe(Math.round(totaal * 100))
    }
    expect(verdeelNaarRato(-29.41, [-2.25, -0.31, -2.79, -20.46, -2.25, -2.25, -2.63]).reduce((s, d) => s + d, 0)).toBeCloseTo(-29.41, 10)
  })
})

describe('datums', () => {
  it.each([
    ['31-12-2025', '2025-12-31'],
    ['2025-01-08 09:12:44.512', '2025-01-08'],
    ['02-Apr-2025', '2025-04-02'],
    ['18-mrt-2025', '2025-03-18'],
    ['15-Oct-2025', '2025-10-15'],
    ['3 februari 2025', '2025-02-03'],
    ['20250314', '2025-03-14'],
    ['January 1, 2025', '2025-01-01'],
    ['2025-06-30 02:00:00', '2025-06-30'],
  ])('%s', (tekst, iso) => {
    expect(leesDatum(tekst)).toBe(iso)
  })

  it('UTC naar Europe/Amsterdam: 31 december 23:30 UTC is 1 januari', () => {
    expect(leesDatum('2025-12-31 23:30:00 UTC')).toBe('2026-01-01')
    expect(leesDatum('2025-12-31 22:30:00 UTC')).toBe('2025-12-31')
    expect(leesDatum('2025-11-20 10:01:12.004+00:00')).toBe('2025-11-20')
    expect(leesDatum('2025-03-31 22:06:41.36', { utc: true })).toBe('2025-04-01')
    expect(leesDatum('2025-01-31 22:06:41', { utc: true })).toBe('2025-01-31')
    expect(leesDatum('2025-01-31 23:06:41', { utc: true })).toBe('2025-02-01')
  })

  it('zomertijd van de laatste zondag van maart tot de laatste zondag van oktober', () => {
    // 2025: 30 maart en 26 oktober, om 01:00 UTC.
    expect(amsterdamDatum(Date.UTC(2025, 2, 30, 0, 59))).toBe('2025-03-30')
    expect(amsterdamDatum(Date.UTC(2025, 9, 25, 22, 30))).toBe('2025-10-26')
    expect(amsterdamDatum(Date.UTC(2025, 9, 26, 22, 30))).toBe('2025-10-26')
  })

  it('ongeldige datums geven null; datum uit een bestandsnaam', () => {
    for (const t of ['31-02-2025', '2025-13-01', 'morgen', '']) expect(leesDatum(t)).toBeNull()
    expect(datumUitNaam('degiro-portefeuille-2024-12-31-nl.csv')).toBe('2024-12-31')
    expect(datumUitNaam('Portfolio_31-12-2024.csv')).toBe('2024-12-31')
    expect(datumUitNaam('Portfolio.csv')).toBeNull()
  })
})
