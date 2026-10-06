import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ontsleutel, paramsHash, sha256, sleutelGeldig, versleutel } from '../crypto'
import { getJaar } from '../tax/years'

const sleutel1 = randomBytes(32).toString('base64')
const sleutel2 = randomBytes(32).toString('base64')
let oud: string | undefined

beforeEach(() => {
  oud = process.env.DOSSIER_KEY
  process.env.DOSSIER_KEY = sleutel1
})
afterEach(() => {
  if (oud === undefined) delete process.env.DOSSIER_KEY
  else process.env.DOSSIER_KEY = oud
})

describe('versleutel en ontsleutel', () => {
  it('roundtrip geeft hetzelfde object terug', () => {
    const obj = { jaar: 2024, personen: [{ id: 'A', bedrag: 152340, naam: 'Ä € ü' }], leeg: null }
    const s = versleutel(obj)
    expect(s.startsWith('v1.')).toBe(true)
    expect(s.split('.')).toHaveLength(4)
    expect(s).not.toContain('152340')
    expect(ontsleutel(s)).toEqual(obj)
  })

  it('gebruikt elke keer een nieuwe IV', () => {
    expect(versleutel({ a: 1 })).not.toBe(versleutel({ a: 1 }))
  })

  it('faalt met een andere sleutel', () => {
    const s = versleutel({ geheim: 1 })
    process.env.DOSSIER_KEY = sleutel2
    expect(() => ontsleutel(s)).toThrow(/gewijzigd of de DOSSIER_KEY klopt niet/)
  })

  it('detecteert gewijzigde gegevens', () => {
    const s = versleutel({ bedrag: 1000 })
    const [v, iv, tag, data] = s.split('.')
    const bytes = Buffer.from(data, 'base64url')
    bytes[0] ^= 0x01
    expect(() => ontsleutel([v, iv, tag, bytes.toString('base64url')].join('.'))).toThrow(/gewijzigd/)
    const tagBytes = Buffer.from(tag, 'base64url')
    tagBytes[3] ^= 0x10
    expect(() => ontsleutel([v, iv, tagBytes.toString('base64url'), data].join('.'))).toThrow(/gewijzigd/)
    expect(() => ontsleutel('v2.a.b.c')).toThrow(/onbekend formaat/)
  })

  it('geeft een duidelijke fout zonder of met een verkeerde sleutel', () => {
    delete process.env.DOSSIER_KEY
    expect(() => versleutel({})).toThrow(/DOSSIER_KEY ontbreekt/)
    process.env.DOSSIER_KEY = Buffer.from('te kort').toString('base64')
    expect(() => versleutel({})).toThrow(/32 bytes/)
    expect(sleutelGeldig()).toBe(false)
    expect(sleutelGeldig(sleutel1)).toBe(true)
  })
})

describe('context als AAD (v2)', () => {
  it('bindt de ciphertext aan de context', () => {
    const s = versleutel({ bedrag: 1 }, 'dossier_years:1:2024')
    expect(s.startsWith('v2.')).toBe(true)
    expect(ontsleutel(s, 'dossier_years:1:2024')).toEqual({ bedrag: 1 })
    expect(() => ontsleutel(s, 'dossier_years:2:2024')).toThrow(/gewijzigd/)
    expect(() => ontsleutel(s)).toThrow(/context/)
  })

  it('oude v1-gegevens blijven leesbaar, ook als er een context wordt meegegeven', () => {
    const oud = versleutel({ bedrag: 2 })
    expect(oud.startsWith('v1.')).toBe(true)
    expect(ontsleutel(oud, 'dossier_years:1:2024')).toEqual({ bedrag: 2 })
  })

  it('zet de sleutel nooit in een foutmelding', () => {
    const s = versleutel({ a: 1 }, 'x')
    process.env.DOSSIER_KEY = sleutel2
    try {
      ontsleutel(s, 'x')
    } catch (e) {
      expect((e as Error).message).not.toContain(sleutel2)
      expect((e as Error).message).not.toContain(sleutel1)
    }
  })
})

describe('hashes', () => {
  it('sha256 is hex en stabiel', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('paramsHash negeert functies en onderscheidt varianten', () => {
    const p = getJaar(2027)
    expect(paramsHash(p)).toBe(paramsHash(getJaar(2027)))
    expect(paramsHash(p)).not.toBe(paramsHash(getJaar(2027, 'brief-29-09')))
    expect(paramsHash({ a: 1, f: () => 1 })).toBe(paramsHash({ a: 1 }))
  })
})
