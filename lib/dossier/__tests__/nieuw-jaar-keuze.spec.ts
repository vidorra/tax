/**
 * Review ronde 2, bevinding 23: in een leeg dossier staat bij "Nieuw jaar" het jaar waarover je nu aangifte doet
 * voorgekozen (in oktober 2026: 2025), niet het laatste conceptjaar met geschatte cijfers.
 */
import { describe, expect, it } from 'vitest'
import { standaardNieuwJaar, vandaagAmsterdam, type VrijJaar } from '../nieuw-jaar-keuze'

const jaren = (...lijst: Array<[number, boolean?]>): VrijJaar[] => lijst.map(([jaar, concept]) => ({ jaar, concept: Boolean(concept) }))
const ALLE = jaren([2021], [2022], [2023], [2024], [2025], [2026], [2027, true], [2028, true])

describe('voorgekozen nieuw jaar', () => {
  it('leeg dossier: het vorige kalenderjaar, niet het conceptjaar', () => {
    expect(standaardNieuwJaar(ALLE, new Set(), '2026-10-05')).toBe(2025)
    expect(standaardNieuwJaar(ALLE, new Set(), '2027-03-01')).toBe(2026)
  })

  it('met jaren in het dossier: het jaar na het laatste (kopie van vorig jaar kan dan)', () => {
    const inDossier = new Set([2024])
    expect(standaardNieuwJaar(ALLE.filter((b) => !inDossier.has(b.jaar)), inDossier, '2026-10-05')).toBe(2025)
  })

  it('is het vorige jaar al bezet en is er geen opvolger: het laatste vrije jaar daarvoor', () => {
    const inDossier = new Set([2025, 2026])
    expect(standaardNieuwJaar(ALLE.filter((b) => !inDossier.has(b.jaar)), inDossier, '2026-10-05')).toBe(2024)
  })

  it('alleen conceptjaren vrij: het eerste daarvan; niets vrij: null', () => {
    expect(standaardNieuwJaar(jaren([2027, true], [2028, true]), new Set([2026]), '2026-10-05')).toBe(2027)
    expect(standaardNieuwJaar([], new Set(), '2026-10-05')).toBeNull()
  })

  it('vandaag in Amsterdam', () => {
    expect(vandaagAmsterdam(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })
})
