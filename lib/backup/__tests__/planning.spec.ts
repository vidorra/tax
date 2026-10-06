import { describe, expect, it, vi } from 'vitest'
import {
  actueelMoment,
  amsterdamDatum,
  amsterdamDelen,
  BACKUP_MOMENTEN,
  datumNLLang,
  INHAALDAGEN,
  TIJDZONE,
  volgendMoment,
  wachttijdUren,
} from '../planning'

const t = (iso: string) => new Date(iso)
const niets = () => false
const alles = () => true

describe('constanten', () => {
  it('twee momenten per jaar, oplopend, als MM-DD', () => {
    expect(BACKUP_MOMENTEN).toEqual(['02-01', '08-01'])
    expect([...BACKUP_MOMENTEN].sort()).toEqual([...BACKUP_MOMENTEN])
    for (const m of BACKUP_MOMENTEN) expect(m).toMatch(/^\d{2}-\d{2}$/)
    expect(INHAALDAGEN).toBe(30)
    expect(TIJDZONE).toBe('Europe/Amsterdam')
  })
})

describe('amsterdamDatum', () => {
  it('31 januari 23:30 UTC is in de winter al 1 februari', () => {
    expect(amsterdamDatum(t('2027-01-31T23:30:00Z'))).toBe('2027-02-01')
    expect(amsterdamDatum(t('2027-01-31T22:59:59Z'))).toBe('2027-01-31')
    expect(amsterdamDatum(t('2027-01-31T23:00:00Z'))).toBe('2027-02-01')
  })

  it('31 juli 22:30 UTC is in de zomer al 1 augustus', () => {
    expect(amsterdamDatum(t('2026-07-31T22:30:00Z'))).toBe('2026-08-01')
    expect(amsterdamDatum(t('2026-07-31T21:59:59Z'))).toBe('2026-07-31')
    expect(amsterdamDatum(t('2026-07-31T22:00:00Z'))).toBe('2026-08-01')
  })

  it('volgt de wisseling van zomer- naar wintertijd en terug', () => {
    expect(amsterdamDatum(t('2026-10-24T22:30:00Z'))).toBe('2026-10-25')
    expect(amsterdamDatum(t('2026-10-25T00:30:00Z'))).toBe('2026-10-25')
    expect(amsterdamDatum(t('2026-10-25T22:59:59Z'))).toBe('2026-10-25')
    expect(amsterdamDatum(t('2026-10-25T23:00:00Z'))).toBe('2026-10-26')
    expect(amsterdamDatum(t('2027-03-27T22:59:59Z'))).toBe('2027-03-27')
    expect(amsterdamDatum(t('2027-03-28T21:59:59Z'))).toBe('2027-03-28')
    expect(amsterdamDatum(t('2027-03-28T22:00:00Z'))).toBe('2027-03-29')
  })

  it('jaarwisseling', () => {
    expect(amsterdamDatum(t('2026-12-31T22:59:59Z'))).toBe('2026-12-31')
    expect(amsterdamDatum(t('2026-12-31T23:00:00Z'))).toBe('2027-01-01')
  })

  it('geeft uren als 00 tot en met 23', () => {
    expect(amsterdamDelen(t('2026-10-04T22:05:00Z'))).toEqual({ jaar: '2026', maand: '10', dag: '05', uur: '00', minuut: '05' })
    expect(amsterdamDelen(t('2026-10-04T21:59:00Z'))).toEqual({ jaar: '2026', maand: '10', dag: '04', uur: '23', minuut: '59' })
  })

  it('weigert een ongeldig tijdstip', () => {
    expect(() => amsterdamDatum(new Date(Number.NaN))).toThrow(RangeError)
  })
})

describe('actueelMoment', () => {
  it('op de dag zelf, net na middernacht in Amsterdam (winter)', () => {
    expect(actueelMoment(t('2027-01-31T23:30:00Z'))).toEqual({ periode: '2027-02', datum: '2027-02-01', dagenGeleden: 0, binnenInhaaltermijn: true })
  })

  it('net vóór middernacht in Amsterdam hoort nog bij het vorige moment', () => {
    expect(actueelMoment(t('2027-01-31T22:59:59Z'))).toEqual({ periode: '2026-08', datum: '2026-08-01', dagenGeleden: 183, binnenInhaaltermijn: false })
  })

  it('op de dag zelf, net na middernacht in Amsterdam (zomer)', () => {
    expect(actueelMoment(t('2026-07-31T22:30:00Z'))).toEqual({ periode: '2026-08', datum: '2026-08-01', dagenGeleden: 0, binnenInhaaltermijn: true })
    expect(actueelMoment(t('2026-07-31T21:59:59Z'))).toEqual({ periode: '2026-02', datum: '2026-02-01', dagenGeleden: 180, binnenInhaaltermijn: false })
  })

  it('op 15 januari is het 1 augustus van het jaar ervoor', () => {
    expect(actueelMoment(t('2027-01-15T12:00:00Z'))).toEqual({ periode: '2026-08', datum: '2026-08-01', dagenGeleden: 167, binnenInhaaltermijn: false })
  })

  it('over de jaarwisseling heen', () => {
    expect(actueelMoment(t('2026-12-31T22:59:59Z'))).toMatchObject({ datum: '2026-08-01', dagenGeleden: 152 })
    expect(actueelMoment(t('2026-12-31T23:00:00Z'))).toMatchObject({ datum: '2026-08-01', dagenGeleden: 153 })
    expect(actueelMoment(t('2027-01-01T00:00:00Z'))).toMatchObject({ periode: '2026-08', datum: '2026-08-01' })
  })

  it('tussen de momenten in', () => {
    expect(actueelMoment(t('2026-10-04T13:32:00Z'))).toEqual({ periode: '2026-08', datum: '2026-08-01', dagenGeleden: 64, binnenInhaaltermijn: false })
    expect(actueelMoment(t('2027-05-01T10:00:00Z'))).toMatchObject({ periode: '2027-02', datum: '2027-02-01', dagenGeleden: 89 })
  })

  it('inhaaltermijn: dag 29 telt nog mee, dag 30 niet (februari)', () => {
    expect(actueelMoment(t('2027-03-02T12:00:00Z'))).toMatchObject({ datum: '2027-02-01', dagenGeleden: 29, binnenInhaaltermijn: true })
    expect(actueelMoment(t('2027-03-03T12:00:00Z'))).toMatchObject({ datum: '2027-02-01', dagenGeleden: 30, binnenInhaaltermijn: false })
  })

  it('inhaaltermijn in een schrikkeljaar', () => {
    expect(actueelMoment(t('2028-03-01T12:00:00Z'))).toMatchObject({ datum: '2028-02-01', dagenGeleden: 29, binnenInhaaltermijn: true })
    expect(actueelMoment(t('2028-03-02T12:00:00Z'))).toMatchObject({ datum: '2028-02-01', dagenGeleden: 30, binnenInhaaltermijn: false })
  })

  it('inhaaltermijn: grens valt om middernacht Amsterdamse tijd (augustus)', () => {
    expect(actueelMoment(t('2026-08-30T21:59:59Z'))).toMatchObject({ datum: '2026-08-01', dagenGeleden: 29, binnenInhaaltermijn: true })
    expect(actueelMoment(t('2026-08-30T22:00:00Z'))).toMatchObject({ datum: '2026-08-01', dagenGeleden: 30, binnenInhaaltermijn: false })
  })

  it('dagen tellen in kalenderdagen, ook over de overgang naar zomertijd', () => {
    expect(actueelMoment(t('2027-03-28T12:00:00Z'))).toMatchObject({ datum: '2027-02-01', dagenGeleden: 55 })
    expect(actueelMoment(t('2027-03-28T22:30:00Z'))).toMatchObject({ datum: '2027-02-01', dagenGeleden: 56 })
  })
})

describe('volgendMoment', () => {
  it('op de dag zelf en nog niet gedaan: vandaag', () => {
    expect(volgendMoment(t('2027-01-31T23:30:00Z'), niets)).toBe('2027-02-01')
    expect(volgendMoment(t('2026-07-31T22:30:00Z'), niets)).toBe('2026-08-01')
  })

  it('op de dag zelf en al gedaan: het moment daarna', () => {
    expect(volgendMoment(t('2027-01-31T23:30:00Z'), alles)).toBe('2027-08-01')
    expect(volgendMoment(t('2026-07-31T22:30:00Z'), alles)).toBe('2027-02-01')
  })

  it('binnen de inhaaltermijn en niet gedaan: het gemiste moment staat klaar', () => {
    expect(volgendMoment(t('2027-02-10T12:00:00Z'), niets)).toBe('2027-02-01')
    expect(volgendMoment(t('2027-03-02T12:00:00Z'), niets)).toBe('2027-02-01')
    expect(volgendMoment(t('2026-08-30T21:59:59Z'), niets)).toBe('2026-08-01')
  })

  it('binnen de inhaaltermijn en gedaan: het volgende moment', () => {
    expect(volgendMoment(t('2027-02-10T12:00:00Z'), alles)).toBe('2027-08-01')
    expect(volgendMoment(t('2026-08-30T21:59:59Z'), alles)).toBe('2027-02-01')
  })

  it('buiten de inhaaltermijn: het volgende moment, ook als het vorige gemist is', () => {
    expect(volgendMoment(t('2027-03-03T12:00:00Z'), niets)).toBe('2027-08-01')
    expect(volgendMoment(t('2026-08-30T22:00:00Z'), niets)).toBe('2027-02-01')
    expect(volgendMoment(t('2026-10-04T13:32:00Z'), niets)).toBe('2027-02-01')
  })

  it('de dag ervoor: morgen', () => {
    expect(volgendMoment(t('2027-01-31T22:30:00Z'), niets)).toBe('2027-02-01')
    expect(volgendMoment(t('2026-07-31T21:30:00Z'), alles)).toBe('2026-08-01')
  })

  it('over de jaarwisseling', () => {
    expect(volgendMoment(t('2026-12-31T23:30:00Z'), niets)).toBe('2027-02-01')
    expect(volgendMoment(t('2027-01-15T12:00:00Z'), alles)).toBe('2027-02-01')
  })

  it('vraagt naar de periode van het actuele moment', () => {
    const gedaan = vi.fn((periode: string) => periode === '2027-02')
    expect(volgendMoment(t('2027-02-05T09:00:00Z'), gedaan)).toBe('2027-08-01')
    expect(gedaan).toHaveBeenCalledWith('2027-02')
    const anderePeriodeGedaan = (periode: string) => periode === '2026-08'
    expect(volgendMoment(t('2027-02-05T09:00:00Z'), anderePeriodeGedaan)).toBe('2027-02-01')
  })
})

describe('wachttijdUren', () => {
  it('verdubbelt tot een maximum van 24 uur', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(wachttijdUren)).toEqual([1, 2, 4, 8, 16, 24, 24, 24])
  })

  it('blijft 24 bij veel pogingen', () => {
    expect(wachttijdUren(100)).toBe(24)
    expect(wachttijdUren(5000)).toBe(24)
  })

  it('zonder pogingen geen wachttijd', () => {
    expect(wachttijdUren(0)).toBe(0)
    expect(wachttijdUren(-1)).toBe(0)
    expect(wachttijdUren(Number.NaN)).toBe(0)
  })
})

describe('datumNLLang', () => {
  it('schrijft de datum uit', () => {
    expect(datumNLLang('2027-02-01')).toBe('1 februari 2027')
    expect(datumNLLang('2026-08-01')).toBe('1 augustus 2026')
    expect(datumNLLang('2026-10-04')).toBe('4 oktober 2026')
  })

  it('past bij volgendMoment', () => {
    expect(datumNLLang(volgendMoment(t('2026-10-04T13:32:00Z'), niets))).toBe('1 februari 2027')
  })
})
