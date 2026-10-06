/**
 * Ronde 2 (A6): youngtimer 2026 (grens 16 jaar) met het overgangsrecht uit het besluit van 12-2-2026 (nr. 2026-2493).
 * Testgevallen Y1 tot en met Y3c en Y7 uit taak-A6.md (hoofdstuk 7).
 */
import { describe, expect, it } from 'vitest'
import type { AutoInvoer } from '../../types'
import { getJaar } from '../../years'
import { berekenBijtellingAuto, youngtimerOvergang, youngtimerVanafInJaar, zonderBijtellingDoorRitten } from '../../modules/onderneming/auto'
import { berekenOnderneming } from '../../modules/onderneming'

const p26 = getJaar(2026)
const auto = (a: Partial<AutoInvoer> = {}): AutoInvoer => ({ cataloguswaarde: 45000, datumEersteToelating: '2009-03-01', nulEmissie: false, dagwaarde: 9000, autokosten: 5500, ...a })
const reken = (a: AutoInvoer, jaar = 2026) => berekenBijtellingAuto(a, { params: getJaar(jaar), jaar })

describe('youngtimer 2026', () => {
  it('parameters 2026: grens 16 jaar en overgangsrecht voor auto’s die eind 2025 al youngtimer waren', () => {
    expect(p26.ondernemer.waarde.auto.youngtimerLeeftijd).toBe(16)
    expect(p26.ondernemer.waarde.auto.youngtimerOvergang).toEqual({ terBeschikkingUiterlijk: '2025-12-31', youngtimerOp: '2025-12-31', oudeLeeftijd: 15 })
    expect(p26.ondernemer.veldStatus?.auto).toBe('definitief')
    expect(p26.changelog.some((c) => c.wat.includes('youngtimerLeeftijd 15 wordt 16') && c.bron?.titel.includes('2026-2493'))).toBe(true)
  })

  it('Y1: eerste toelating 1-3-2009: het hele jaar 35% van de dagwaarde = 3.150', () => {
    const r = reken(auto())
    expect(r.bijtelling).toBe(3150)
    expect(r.soort).toBe('youngtimer')
    expect(r.uitkomst.overgangsrecht).toBe(false)
  })

  it('Y2: autokosten 2.800: plafond 2.800', () => {
    expect(reken(auto({ autokosten: 2800 })).bijtelling).toBe(2800)
  })

  it('Y3: 15-4-2010, ter beschikking sinds 1-1-2026: jan-apr catalogus, mei-dec dagwaarde = 4.800', () => {
    const a = auto({ datumEersteToelating: '2010-04-15', dagwaarde: 8000, cataloguswaarde: 40000, autokosten: 9000, terBeschikkingSinds: '2026-01-01' })
    const r = reken(a)
    expect(r.bijtelling).toBe(4800)
    expect(r.soort).toBe('gemengd')
    expect(r.uitkomst.overgangsrecht).toBe(false)
    expect(r.uitkomst.overgang).toEqual({ terBeschikking: 'nee' })
    expect(r.uitkomst.youngtimerVanaf).toBe('2026-05-01')
    expect(youngtimerVanafInJaar('2010-04-15', p26, 2026)).toBe('2026-05-01')
  })

  it('Y3b: als Y3, ter beschikking sinds 2025: overgangsrecht, de laagste: 2.800 (zonder: 4.800)', () => {
    const r = reken(auto({ datumEersteToelating: '2010-04-15', dagwaarde: 8000, cataloguswaarde: 40000, autokosten: 9000, terBeschikkingSinds: '2025-03-01' }))
    expect(r.bijtelling).toBe(2800)
    expect(r.uitkomst.overgangsrecht).toBe(true)
    expect(r.uitkomst.zonderOvergangsrecht).toBe(4800)
  })

  it('Y3b zonder datum: in 2026 (het eerste jaar na 31-12-2025) aangenomen dat de auto er al was', () => {
    const r = reken(auto({ datumEersteToelating: '2010-04-15', dagwaarde: 8000, cataloguswaarde: 40000, autokosten: 9000 }))
    expect(r.uitkomst.overgang).toEqual({ terBeschikking: 'aangenomen' })
    expect(r.bijtelling).toBe(2800)
  })

  it('Y3c: eerste toelating 15-4-2011, ter beschikking sinds 2024: geen overgangsrecht en in 2026 geen youngtimer: 8.800', () => {
    const a = auto({ datumEersteToelating: '2011-04-15', dagwaarde: 8000, cataloguswaarde: 40000, autokosten: 9000, terBeschikkingSinds: '2024-01-01' })
    expect(youngtimerOvergang(a, p26, 2026)).toBeNull()
    const r = reken(a)
    expect(r.bijtelling).toBe(8800)
    expect(r.soort).toBe('algemeen')
    expect(r.uitkomst.overgangsrecht).toBe(false)
    expect(r.uitkomst.zonderOvergangsrecht).toBeUndefined()
  })

  it('Y7 (2027, voorstel): 1-6-2010 en ter beschikking sinds 2024: overgangsrecht, het hele jaar youngtimer', () => {
    const a = auto({ datumEersteToelating: '2010-06-01', dagwaarde: 8000, cataloguswaarde: 30000, autokosten: 20000, terBeschikkingSinds: '2024-01-01' })
    const r = reken(a, 2027)
    expect(r.bijtelling).toBe(2800)
    expect(r.uitkomst.overgangsrecht).toBe(true)
    // Zonder overgangsrecht: grens 17, youngtimer vanaf juli 2027 (6 × 22% × 30.000 + 6 × 2.800) / 12 = 4.700.
    expect(r.uitkomst.zonderOvergangsrecht).toBe(4700)
    // Zonder datum in 2027 (niet het eerste jaar na de grens): onbekend, geen overgangsrecht, met een melding.
    const zonderDatum = reken({ ...a, terBeschikkingSinds: undefined }, 2027)
    expect(zonderDatum.uitkomst.overgang).toEqual({ terBeschikking: 'onbekend' })
    expect(zonderDatum.bijtelling).toBe(4700)
    expect(zonderDatum.waarschuwingen.some((w) => w.id.endsWith('.auto.overgang'))).toBe(true)
  })

  it('eigen bijdrage gaat van de bijtelling af (art. 3.20 lid 4)', () => {
    const r = reken(auto({ eigenBijdrage: 1000 }))
    expect(r.bijtelling).toBe(2150)
    expect(r.uitkomst.eigenBijdrage).toBe(1000)
  })

  it('tijdsevenredig: ter beschikking vanaf september', () => {
    const r = reken(auto({ datumEersteToelating: '2022-01-10', dagwaarde: undefined, cataloguswaarde: 30000, autokosten: 9000, terBeschikkingSinds: '2026-09-01' }))
    expect(r.bijtelling).toBe(Math.round((0.22 * 30000 * 4) / 12))
  })

  it('bij een saldo zit de bijtelling in het saldo: de uitkomst is informatie', () => {
    const o = berekenOnderneming(
      { naam: 'Studio', winstberekening: { soort: 'saldo', saldo: 50000 }, uren: { onderneming: 1600 }, startjaar: 2015, auto: auto() },
      { params: p26, jaar: 2026, aowBereikt: false, urenLoondienst: 0 },
    )
    expect(o.bijtellingAuto).toBe(0)
    expect(o.auto?.bijtelling).toBe(3150)
    expect(o.auto?.bijtellingInSaldo).toBe(true)
    expect(o.winst).toBe(50000)
  })
})

describe('youngtimer zonder bijtelling (review, bevinding 7)', () => {
  it('rittenregistratie met 0 privékilometers: soort geen, bijtelling 0, geen vraag om de dagwaarde', () => {
    const a = auto({ datumEersteToelating: '2005-05-01', dagwaarde: undefined, rittenregistratie: true, priveKm: 0 })
    expect(zonderBijtellingDoorRitten(a, p26)).toBe(true)
    const r = reken(a)
    expect(r).toMatchObject({ bijtelling: 0, soort: 'geen' })
    expect(r.waarschuwingen.some((w) => w.id.endsWith('.auto.dagwaarde'))).toBe(false)
    // Boven de grens of zonder rittenregistratie telt de dagwaarde wel.
    expect(zonderBijtellingDoorRitten({ rittenregistratie: true, priveKm: p26.ondernemer.waarde.auto.priveKmGrens + 1 }, p26)).toBe(false)
    expect(zonderBijtellingDoorRitten({ rittenregistratie: false, priveKm: 0 }, p26)).toBe(false)
    expect(zonderBijtellingDoorRitten({ rittenregistratie: true }, p26)).toBe(false)
  })
})
