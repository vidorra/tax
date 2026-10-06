import { describe, expect, it } from 'vitest'
import { cursorNaFormat, formatDatum, formatEuro, formatGetal, formatPct, formatTijdensTypen, formatVoorInvoer, parseInvoer } from '@/components/ui/format'

const NBSP = ' '

describe('formatEuro', () => {
  it('toont hele euros met duizendtallen', () => {
    expect(formatEuro(48215)).toBe(`€${NBSP}48.215`)
    expect(formatEuro(0)).toBe(`€${NBSP}0`)
  })
  it('gebruikt een echt minteken en optioneel een plus', () => {
    expect(formatEuro(-1200)).toBe(`−${NBSP}€${NBSP}1.200`)
    expect(formatEuro(1200, { teken: true })).toBe(`+${NBSP}€${NBSP}1.200`)
    expect(formatEuro(0, { teken: true })).toBe(`€${NBSP}0`)
  })
  it('ondersteunt decimalen', () => {
    expect(formatEuro(11.23, { decimalen: 2 })).toBe(`€${NBSP}11,23`)
  })
  it('rondt af voor het teken bepaald wordt', () => {
    expect(formatEuro(-0.4)).toBe(`€${NBSP}0`)
  })
})

describe('formatGetal en formatPct', () => {
  it('formatteert getallen nl-NL', () => {
    expect(formatGetal(1225)).toBe('1.225')
    expect(formatGetal(4.33, 2)).toBe('4,33')
    expect(formatGetal(-5)).toBe('−5')
  })
  it('formatteert percentages uit fracties', () => {
    expect(formatPct(0.3756)).toBe('37,56%')
    expect(formatPct(0.127)).toBe('12,7%')
    expect(formatPct(0.06398, 3)).toBe('6,398%')
  })
})

describe('formatDatum', () => {
  it('zet ISO om naar een Nederlandse datum', () => {
    expect(formatDatum('2026-10-04')).toBe('4 oktober 2026')
    expect(formatDatum('2026-12-15')).toBe('15 december 2026')
    expect(formatDatum('geen datum')).toBe('geen datum')
  })
})

describe('formatTijdensTypen', () => {
  it('voegt duizendtallen toe en geeft een getal terug', () => {
    expect(formatTijdensTypen('75000')).toEqual({ tekst: '75.000', getal: 75000 })
    expect(formatTijdensTypen('1.2345')).toEqual({ tekst: '12.345', getal: 12345 })
  })
  it('negeert tekens die geen cijfer zijn', () => {
    expect(formatTijdensTypen('€ 12a3')).toEqual({ tekst: '123', getal: 123 })
  })
  it('geeft null bij leeg', () => {
    expect(formatTijdensTypen('')).toEqual({ tekst: '', getal: null })
    expect(formatTijdensTypen('abc').getal).toBeNull()
  })
  it('verwijdert voorloopnullen', () => {
    expect(formatTijdensTypen('0075').tekst).toBe('75')
    expect(formatTijdensTypen('0').getal).toBe(0)
  })
  it('kent een komma alleen als decimalen zijn toegestaan', () => {
    expect(formatTijdensTypen('12,5')).toEqual({ tekst: '125', getal: 125 })
    expect(formatTijdensTypen('1234,567', { decimalen: 2 })).toEqual({ tekst: '1.234,56', getal: 1234.56 })
    expect(formatTijdensTypen(',5', { decimalen: 2 })).toEqual({ tekst: '0,5', getal: 0.5 })
    expect(formatTijdensTypen('12,', { decimalen: 2 })).toEqual({ tekst: '12,', getal: 12 })
  })
  it('staat een minteken alleen toe als negatief aan staat', () => {
    expect(formatTijdensTypen('-2500').getal).toBe(2500)
    expect(formatTijdensTypen('-2500', { negatief: true })).toEqual({ tekst: '-2.500', getal: -2500 })
    expect(formatTijdensTypen('-', { negatief: true })).toEqual({ tekst: '-', getal: null })
  })
  it('groepeert niet als dat uit staat', () => {
    expect(formatTijdensTypen('1225', { groeperen: false }).tekst).toBe('1225')
  })
})

describe('parseInvoer en formatVoorInvoer', () => {
  it('leest Nederlandse notatie', () => {
    expect(parseInvoer('12.345,67', { decimalen: 2 })).toBe(12345.67)
    expect(parseInvoer('12.345')).toBe(12345)
    expect(parseInvoer('')).toBeNull()
  })
  it('zet een getal om naar invoertekst', () => {
    expect(formatVoorInvoer(75000)).toBe('75.000')
    expect(formatVoorInvoer(null)).toBe('')
    expect(formatVoorInvoer(-2500)).toBe('-2.500')
    expect(formatVoorInvoer(11.23, { decimalen: 2 })).toBe('11,23')
    expect(formatVoorInvoer(1225, { groeperen: false })).toBe('1225')
  })
  it('is omkeerbaar', () => {
    for (const n of [0, 7, 999, 1000, 38883, 1350000]) expect(parseInvoer(formatVoorInvoer(n))).toBe(n)
  })
})

describe('cursorNaFormat', () => {
  it('houdt de cursor achter hetzelfde cijfer na het invoegen van een punt', () => {
    // "1234|" wordt "1.234|"
    expect(cursorNaFormat('1234', 4, '1.234')).toBe(5)
    // cursor na de 2 in "12|34" -> "1.2|34"
    expect(cursorNaFormat('1234', 2, '1.234')).toBe(3)
  })
  it('zet de cursor vooraan als er geen cijfers voor staan', () => {
    expect(cursorNaFormat('€12', 1, '12')).toBe(0)
  })
  it('gaat niet voorbij het einde', () => {
    expect(cursorNaFormat('12345', 99, '12.345')).toBe(6)
  })
})
