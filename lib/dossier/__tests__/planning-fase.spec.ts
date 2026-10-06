import { describe, expect, it } from 'vitest'
import { getJaar } from '@/lib/tax/years'
import { planningFase, toonGeenVaVraag } from '../planning-fase'

const vandaag = '2026-10-05'

describe('fase van het jaar voor Planning', () => {
  it('2026 lopend, 2025 concept na afloop, 2024 ingediend, 2027 toekomst', () => {
    expect(planningFase(2026, vandaag, 'concept')).toBe('lopend')
    expect(planningFase(2025, vandaag, 'concept')).toBe('na-afloop')
    expect(planningFase(2025, vandaag, 'gecontroleerd')).toBe('na-afloop')
    expect(planningFase(2024, vandaag, 'ingediend')).toBe('ingediend')
    expect(planningFase(2027, vandaag, 'concept')).toBe('toekomst')
  })
})

describe('info-regel geen voorlopige aanslag ingevuld', () => {
  const p2025 = getJaar(2025)
  it('2025 verstreken, te betalen 500, geen voorlopige aanslag: ja', () => {
    expect(toonGeenVaVraag({}, { teBetalenIB: 500 }, p2025, 2025, vandaag)).toBe(true)
    expect(toonGeenVaVraag({ voorlopigeAanslagIB: 0 }, { teBetalenIB: 500 }, p2025, 2025, vandaag)).toBe(true)
  })
  it('te betalen 40, onder de aanslaggrens van 2025: nee', () => {
    expect(p2025.overig.waarde.aanslaggrens).toBeGreaterThan(40)
    expect(toonGeenVaVraag({}, { teBetalenIB: 40 }, p2025, 2025, vandaag)).toBe(false)
  })
  it('voorlopige aanslag van 1.000 ingevuld: nee', () => {
    expect(toonGeenVaVraag({ voorlopigeAanslagIB: 1000 }, { teBetalenIB: 500 }, p2025, 2025, vandaag)).toBe(false)
  })
  it('lopend jaar 2026: nee; zonder uitkomst: nee', () => {
    expect(toonGeenVaVraag({}, { teBetalenIB: 500 }, getJaar(2026), 2026, vandaag)).toBe(false)
    expect(toonGeenVaVraag({}, null, p2025, 2025, vandaag)).toBe(false)
  })
})
