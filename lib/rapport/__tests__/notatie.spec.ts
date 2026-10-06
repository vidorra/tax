import { describe, expect, it } from 'vitest'
import { bedrag, datumKort, datumLang, periode, percentage, telwoord } from '../notatie'

describe('notatie van het fiscaal rapport', () => {
  it("bedragen: hele euro's, punt als duizendtalscheiding, minteken, nooit -0", () => {
    expect(bedrag(127935)).toBe('127.935')
    expect(bedrag(-13260)).toBe('-13.260')
    expect(bedrag(0)).toBe('0')
    expect(bedrag(-0)).toBe('0')
    expect(bedrag(-0.4)).toBe('0')
    expect(bedrag(1234567)).toBe('1.234.567')
    expect(bedrag(612.7)).toBe('613')
    expect(bedrag(999)).toBe('999')
  })

  it('percentages: komma, twee decimalen, varianten uit de spec', () => {
    expect(percentage(0.0932)).toBe('9,32%')
    expect(percentage(0.1253000000002)).toBe('12,53%')
    expect(percentage(0.2)).toBe('20,00%')
    expect(percentage(1)).toBe('100,00%')
    expect(percentage(0.0144, 'tabel')).toBe('1,44 %')
    expect(percentage(1, 'geheel')).toBe('100%')
    expect(percentage(0.36)).toBe('36,00%')
  })

  it('datums kort en lang, periode', () => {
    expect(datumKort('2024-03-14')).toBe('14-03-2024')
    expect(datumLang('2023-06-21')).toBe('21 juni 2023')
    expect(datumLang('2026-03-03')).toBe('3 maart 2026')
    expect(datumLang('2026-10-04T12:00:00Z')).toBe('4 oktober 2026')
    expect(periode('2024-01-01', '2024-12-31')).toBe('01-01 t/m 31-12')
    expect(datumKort('geen datum')).toBe('geen datum')
  })

  it('telwoorden', () => {
    expect(telwoord(3)).toBe('drie')
    expect(telwoord(13)).toBe('13')
  })
})
