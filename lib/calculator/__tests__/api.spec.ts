import { describe, expect, it } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { clientSleutel, controleerVariant, maakRateLimiter, valideerInvoer } from '../api'
import { naarInvoer, standaardState } from '../formulier'
import { parameterRijen, parameterRijenMetVarianten } from '../parameters'
import { getJaar } from '@/lib/tax/years'

describe('valideerInvoer', () => {
  it('accepteert de voorbeeldinvoer van 2024 en de calculatorinvoer', () => {
    expect(valideerInvoer(voorbeeldInvoer(2024)).ok).toBe(true)
    expect(valideerInvoer(naarInvoer(standaardState(2027, 'brief-29-09'))).ok).toBe(true)
  })

  it('geeft begrijpelijke meldingen bij een verkeerde vorm', () => {
    const r = valideerInvoer({ jaar: 1999, personen: [{ id: 'C', ondernemingen: [{ winstberekening: { soort: 'x' } }] }], verdeling: 'half' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const tekst = r.fouten.join('\n')
    expect(tekst).toContain('jaar 1999 is niet beschikbaar')
    expect(tekst).toContain("personen[0].id moet 'A' of 'B' zijn")
    expect(tekst).toContain("winstberekening.soort moet 'saldo' of 'uitgesplitst' zijn")
    expect(tekst).toContain('fiscaalPartner ontbreekt')
    expect(tekst).toContain('box3 ontbreekt')
    expect(tekst).toContain("verdeling moet 'optimaal' zijn")
    expect(valideerInvoer('tekst').ok).toBe(false)
    expect(valideerInvoer([]).ok).toBe(false)
  })

  it('controleert varianten per jaar', () => {
    expect(controleerVariant(2027, 'brief-29-09')).toBeNull()
    expect(controleerVariant(2027, undefined)).toBeNull()
    expect(controleerVariant(2026, 'brief-29-09')).toContain('Onbekende variant')
  })
})

describe('rate limiter', () => {
  it('staat 60 verzoeken per minuut toe en reset daarna', () => {
    const rl = maakRateLimiter({ max: 60, vensterMs: 60_000 })
    for (let i = 0; i < 60; i++) expect(rl('1.2.3.4', 1000).toegestaan).toBe(true)
    const te = rl('1.2.3.4', 1000)
    expect(te.toegestaan).toBe(false)
    expect(te.resetOver).toBe(60_000)
    expect(rl('5.6.7.8', 1000).toegestaan).toBe(true)
    expect(rl('1.2.3.4', 61_001).toegestaan).toBe(true)
  })

  it('leest het IP uit de proxyheaders', () => {
    expect(clientSleutel(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9')
    expect(clientSleutel(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8')
    expect(clientSleutel(new Headers())).toBe('onbekend')
  })
})

describe('parametertabel', () => {
  it('leest de cijfers uit de jaarparameters met status', () => {
    const rijen = parameterRijen(getJaar(2026))
    const za = rijen.find((r) => r.id === 'zelfstandigenaftrek')!
    expect(za.waarde).toBe(`€ ${getJaar(2026).ondernemer.waarde.zelfstandigenaftrek.toLocaleString('nl-NL')}`)
    expect(rijen.find((r) => r.id === 'box3-bank')!.status).toBe('voorlopig')
    expect(rijen.filter((r) => r.id.startsWith('schijf-')).length).toBe(getJaar(2026).box1.waarde.schijven.length)
  })

  it('zet 2027 naast de variant en markeert afwijkingen', () => {
    const { varianten, rijen } = parameterRijenMetVarianten(2027)
    expect(varianten.map((v) => v.id)).toEqual(['brief-29-09'])
    const hvv = rijen.find((r) => r.id === 'box3-hvv')!
    expect(hvv.varianten[0].waarde).not.toBe(hvv.waarde)
    expect(hvv.varianten[0].status).toBe('voorstel')
  })

  it('2028 toont het nieuwe box 3-stelsel', () => {
    const rijen = parameterRijen(getJaar(2028))
    expect(rijen.some((r) => r.id === 'box3-regime')).toBe(true)
  })
})
