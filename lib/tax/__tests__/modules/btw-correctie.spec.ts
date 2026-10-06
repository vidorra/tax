/**
 * Ronde 2 (A6): btw-correctie privégebruik auto (goedkeuring van de Belastingdienst). Testgevallen Y4 tot en met Y11
 * uit taak-A6.md (hoofdstuk 7). Zonder `auto.btw` geen correctie: bestaande dossiers veranderen niet.
 */
import { describe, expect, it } from 'vitest'
import type { AutoInvoer, OndernemingInvoer } from '../../types'
import { getJaar } from '../../years'
import { berekenBijtellingAuto, berekenBtwCorrectie } from '../../modules/onderneming/auto'
import { berekenOnderneming } from '../../modules/onderneming'

const youngtimer = (a: Partial<AutoInvoer> = {}): AutoInvoer => ({ cataloguswaarde: 45000, datumEersteToelating: '2009-03-01', nulEmissie: false, dagwaarde: 9000, autokosten: 5500, ...a })
const nieuw = (a: Partial<AutoInvoer> = {}): AutoInvoer => ({ cataloguswaarde: 45000, datumEersteToelating: '2026-01-15', nulEmissie: false, autokosten: 12000, ...a })
const reken = (a: AutoInvoer, jaar = 2026, o?: Pick<OndernemingInvoer, 'winstBron' | 'activa'>) => berekenBijtellingAuto(a, { params: getJaar(jaar), jaar, ...(o ? { onderneming: o } : {}) })

describe('btw-correctie privégebruik', () => {
  it('Y4: youngtimer van een particulier, forfait, niet in de autokosten: 675; plafond 6.175; bijtelling 3.150', () => {
    const r = reken(youngtimer({ btw: { aftrekBijAanschaf: false, methode: 'forfait', inAutokosten: false } }))
    expect(r.uitkomst.btwCorrectie).toBe(675)
    expect(r.uitkomst.btwDetail?.reden).toBe('forfait-verlaagd')
    expect(r.uitkomst.btwCorrectieAfgetrokken).toBe(675)
    expect(r.uitkomst.plafond).toBe(6175)
    expect(r.bijtelling).toBe(3150)
  })

  it('Y5: nieuwe auto 2026, btw afgetrokken, forfait: 1.215 (2,7%); in 2031 675 (1,5%)', () => {
    const a = nieuw({ terBeschikkingSinds: '2026-01-15', btw: { aftrekBijAanschaf: true, methode: 'forfait' } })
    expect(reken(a).uitkomst.btwCorrectie).toBe(1215)
    expect(reken(a).uitkomst.btwDetail).toEqual({ pct: 0.027, maanden: 12, maximum: null, jaarIngebruikname: 2026, reden: 'forfait' })
    // 2030 is het vierde jaar na 2026: nog 2,7%; 2031 later dan vier jaar: 1,5% (module met de parameters van 2028).
    expect(berekenBtwCorrectie(a, { params: getJaar(2028), jaar: 2030 }).correctie).toBe(1215)
    expect(berekenBtwCorrectie(a, { params: getJaar(2028), jaar: 2031 }).correctie).toBe(675)
  })

  it('Y5b: eerste toelating 2020, in 2026 met btw gekocht (ex-lease): 2,7% tot en met 2030', () => {
    const a = nieuw({ datumEersteToelating: '2020-05-01', terBeschikkingSinds: '2026-01-01', btw: { aftrekBijAanschaf: true, methode: 'forfait' } })
    expect(reken(a).uitkomst.btwCorrectie).toBe(1215)
    expect(reken(a).uitkomst.btwDetail?.jaarIngebruikname).toBe(2026)
    expect(berekenBtwCorrectie(a, { params: getJaar(2028), jaar: 2030 }).detail?.pct).toBe(0.027)
  })

  it('Y6: als Y2 met een btw-correctie van 600 buiten de autokosten: plafond 3.400, bijtelling 3.150', () => {
    const r = reken(youngtimer({ autokosten: 2800, btw: { aftrekBijAanschaf: false, methode: 'kilometers', btwOpKosten: 1000, priveKmInclWoonWerk: 6000, totaalKm: 10000, inAutokosten: false } }))
    expect(r.uitkomst.btwCorrectie).toBe(600)
    expect(r.uitkomst.plafond).toBe(3400)
    expect(r.bijtelling).toBe(3150)
  })

  it('Y8: ter beschikking vanaf 1-9-2026: 2,7% × 45.000 × 4/12 = 405', () => {
    expect(reken(nieuw({ terBeschikkingSinds: '2026-09-01', btw: { aftrekBijAanschaf: true, methode: 'forfait' } })).uitkomst.btwCorrectie).toBe(405)
  })

  it('Y9: marge-youngtimer: forfait 675, maximum de btw op de kosten (300): 300', () => {
    const r = reken(youngtimer({ btw: { aftrekBijAanschaf: false, methode: 'forfait', btwOpKosten: 300 } }))
    expect(r.uitkomst.btwCorrectie).toBe(300)
    expect(r.uitkomst.btwDetail?.maximum).toBe(300)
  })

  it('maximum in de eerste vier jaar: btw op de kosten plus een vijfde van de btw bij aankoop', () => {
    const a = nieuw({ terBeschikkingSinds: '2026-01-01', btw: { aftrekBijAanschaf: true, methode: 'forfait', btwOpKosten: 500, btwBijAanschaf: 2500 } })
    // 500 + 2.500 / 5 = 1.000 < 1.215
    expect(reken(a).uitkomst.btwCorrectie).toBe(1000)
  })

  it('Y10: geen btw-aftrek op de kosten (KOR): 0, reden geen-aftrek', () => {
    const r = reken(nieuw({ btw: { aftrekOpKosten: false, aftrekBijAanschaf: false, methode: 'forfait' } }))
    expect(r.uitkomst.btwCorrectie).toBe(0)
    expect(r.uitkomst.btwDetail?.reden).toBe('geen-aftrek')
  })

  it('Y11: auto zonder btw-gegevens: 0 en btwDetail null', () => {
    const r = reken(youngtimer())
    expect(r.uitkomst.btwCorrectie).toBe(0)
    expect(r.uitkomst.btwDetail).toBeNull()
    expect(r.uitkomst.btwCorrectieAfgetrokken).toBe(0)
  })

  it('jaar van ingebruikname onbekend: rekenen met 2,7% en een melding', () => {
    const r = reken(nieuw({ btw: { aftrekBijAanschaf: true, methode: 'forfait' } }))
    expect(r.uitkomst.btwDetail?.reden).toBe('onbekend-jaar')
    expect(r.uitkomst.btwCorrectie).toBe(1215)
    expect(r.waarschuwingen.some((w) => w.id.endsWith('.auto.btwJaar'))).toBe(true)
  })

  it('in de winst: niet in de autokosten gaat van de winst af; uit een fiscaal rapport standaard al verwerkt', () => {
    const o = (x: Partial<OndernemingInvoer>): OndernemingInvoer => ({
      naam: 'Studio',
      winstberekening: { soort: 'uitgesplitst', omzet: 60000, kosten: 10000 },
      uren: { onderneming: 1600 },
      startjaar: 2015,
      auto: youngtimer({ btw: { aftrekBijAanschaf: false, methode: 'forfait', inAutokosten: false } }),
      ...x,
    })
    const ctx = { params: getJaar(2026), jaar: 2026, aowBereikt: false, urenLoondienst: 0 }
    const r = berekenOnderneming(o({}), ctx)
    // saldo 60.000 − 10.000 − 5.500 = 44.500; + bijtelling 3.150 − btw-correctie 675
    expect(r.winst).toBe(44500 + 3150 - 675)
    const standaard = berekenOnderneming(o({ auto: youngtimer({ btw: { aftrekBijAanschaf: false, methode: 'forfait' } }) }), ctx)
    expect(standaard.auto?.btwInAutokosten).toBe(true)
    expect(standaard.winst).toBe(44500 + 3150)
  })
})
