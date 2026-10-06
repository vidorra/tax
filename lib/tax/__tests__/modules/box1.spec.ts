import { describe, expect, it } from 'vitest'
import { berekenBox1 } from '../../modules/box1'
import { getJaar, kloon } from '../../years'
import type { TaxYearParams } from '../../types'

/** Parameters 2021 voor box 1 (alleen wat de test nodig heeft), afgeleid van 2024. */
function params2021(): TaxYearParams {
  const p = kloon(getJaar(2024))
  p.jaar = 2021
  p.box1.waarde.schijven = [
    { tot: 35129, tarief: 0.371, belastingDeel: 0.0945 },
    { tot: 68507, tarief: 0.371, belastingDeel: 0.371 },
    { tot: null, tarief: 0.495, belastingDeel: 0.495 },
  ]
  p.box1.waarde.aftrekTariefMax = 0.43
  return p
}

const basisCtx = (params: TaxYearParams) => ({ params, aowBereikt: false, geborenVoor1946: false })

describe('box 1', () => {
  it('rekent een inkomen in de derde schijf met de tariefmaatregel (2024)', () => {
    const r = berekenBox1(108257, 29811, basisCtx(getJaar(2024)))
    // Schijf 1 en 2 zijn vol: 9,32% over 38.098 en 36,97% over 37.420, elk naar beneden afgerond.
    expect(r.schijven.map((s) => s.over)).toEqual([38098, 37420, 32739])
    expect(r.schijven.map((s) => s.belasting)).toEqual([Math.floor(38098 * 0.0932), Math.floor(37420 * 0.3697), 16205])
    expect(r.tariefmaatregel).toBe(3735) // (49,5% − 36,97%) × 29.811 = 3.735,3
    expect(r.belasting).toBe(37324)
    expect(r.premie).toBe(Math.floor(38098 * 0.2765)) // premie over het maximum premie-inkomen
    expect(r.totaal).toBe(r.belasting + r.premie)
  })

  it('rekent een inkomen in de tweede schijf (parameters 2021)', () => {
    const r = berekenBox1(61489, 19593, basisCtx(params2021()))
    expect(r.schijven.map((s) => s.belasting)).toEqual([Math.floor(35129 * 0.0945), 9779, 0])
    expect(r.tariefmaatregel).toBe(817) // (61.489 + 19.593 − 68.507) × (49,5% − 43%) = 817,4
    expect(r.belasting).toBe(13915)
    expect(r.premie).toBe(Math.floor(35129 * 0.2765))
  })

  it('schrijft uitlegregels met echte getallen', () => {
    const r = berekenBox1(108257, 29811, basisCtx(getJaar(2024)))
    const tm = r.uitleg.find((u) => u.id === 'box1-tariefmaatregel')
    expect(tm?.formule).toContain('29.811')
    expect(tm?.parameter).toBe('box1.aftrekTariefMax')
  })

  it('heeft geen tariefmaatregel als inkomen plus aftrek onder het toptarief blijft', () => {
    const r = berekenBox1(60000, 10000, basisCtx(getJaar(2026)))
    expect(r.tariefmaatregel).toBe(0)
  })

  it('beperkt de tariefmaatregel tot het deel van de aftrek in het toptarief', () => {
    // 75.000 + 10.000 − 78.426 = 6.574 × (49,5% − 37,56%) = 784,9
    const r = berekenBox1(75000, 10000, basisCtx(getJaar(2026)))
    expect(r.tariefmaatregel).toBe(784)
  })

  it('rekent bij AOW-leeftijd geen AOW-premie, wel het belastingdeel van schijf 1', () => {
    const r = berekenBox1(50000, 0, { params: getJaar(2026), aowBereikt: true, geborenVoor1946: false })
    expect(r.schijven[0].belasting).toBe(3149) // 8,10% × 38.883 = 3.149,5
    expect(r.premie).toBe(3791) // (0,10% + 9,65%) × 38.883 = 3.791,1
  })

  it('gebruikt de afwijkende grens schijf 1 voor AOW-gerechtigden geboren vóór 1946', () => {
    const r = berekenBox1(50000, 0, { params: getJaar(2026), aowBereikt: true, geborenVoor1946: true })
    expect(r.schijven[0].tot).toBe(41123)
    expect(r.premie).toBe(4009) // 9,75% × 41.123 = 4.009,49
  })

  it('geeft nul belasting en een waarschuwing bij een negatief inkomen', () => {
    const r = berekenBox1(-5000, 0, basisCtx(getJaar(2026)))
    expect(r.belasting).toBe(0)
    expect(r.premie).toBe(0)
    expect(r.waarschuwingen.map((w) => w.id)).toContain('box1-negatief')
  })
})
