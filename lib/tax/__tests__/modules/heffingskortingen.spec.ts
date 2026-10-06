import { describe, expect, it } from 'vitest'
import { berekenHeffingskortingen, type HeffingskortingenContext } from '../../modules/heffingskortingen'
import { getJaar } from '../../years'
import type { KindInvoer } from '../../types'

const KIND: KindInvoer = { id: 'k1', geboortedatum: '2023-10-17' }

function ctx(over: Partial<HeffingskortingenContext> = {}): HeffingskortingenContext {
  return {
    params: getJaar(2026),
    jaar: 2026,
    arbeidsinkomen: 76000,
    box1Inkomen: 64000,
    verzamelinkomen: 64000,
    geboortedatum: '1988-06-15',
    aowBereikt: false,
    heeftFiscaalPartner: false,
    isMinstverdienende: false,
    kinderen: [],
    groenVrijstelling: 0,
    maxVerzilverbaar: 100000,
    ...over,
  }
}

describe('heffingskortingen', () => {
  it('bouwt AHK en arbeidskorting af boven de grens (2026: box 1-inkomen 64.000, arbeidsinkomen 76.000)', () => {
    const r = berekenHeffingskortingen(ctx())
    expect(r.algemeen).toBe(923)
    expect(r.arbeid).toBe(3705)
    expect(r.bruto).toBe(923 + 3705)
    expect(r.verzilverd).toBe(r.bruto)
  })

  it('geeft nul kortingen bij een hoog inkomen (voorbeeld 2024, persoon A)', () => {
    const r = berekenHeffingskortingen(ctx({ params: getJaar(2024), jaar: 2024, arbeidsinkomen: 151328, box1Inkomen: 108257, verzamelinkomen: 108553 }))
    expect(r.algemeen).toBe(0)
    expect(r.arbeid).toBe(0)
    expect(r.bruto).toBe(0)
  })

  it('bouwt de AHK in 2024 af op het box 1-inkomen, niet op het verzamelinkomen', () => {
    // 3.362 − 6,63% × (30.000 − 24.812) = 3.018,04
    const r = berekenHeffingskortingen(ctx({ params: getJaar(2024), jaar: 2024, arbeidsinkomen: 30000, box1Inkomen: 30000, verzamelinkomen: 60000 }))
    expect(r.algemeen).toBe(3018)
  })

  it('volgt de opbouwtrajecten van de arbeidskorting', () => {
    expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 5000 })).arbeid).toBe(416) // 8,324% × 5.000
    expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 20000 })).arbeid).toBe(3488) // 996 + 31,009% × 8.035
    expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 45592 })).arbeid).toBe(5685) // maximum
    expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 0 })).arbeid).toBe(0)
  })

  describe('IACK', () => {
    it('geeft geen recht in 2023 voor een kind geboren op 17 oktober 2023 (minder dan zes maanden)', () => {
      const r = berekenHeffingskortingen(ctx({ jaar: 2023, arbeidsinkomen: 40000, heeftFiscaalPartner: true, isMinstverdienende: true, kinderen: [KIND] }))
      expect(r.iack).toBe(0)
      expect(r.waarschuwingen.map((w) => w.id)).toContain('hk-iack-volgend-jaar')
    })

    it('geeft in 2026 het maximum van 3.032 bij een arbeidsinkomen vanaf 32.720 voor de minstverdienende partner', () => {
      expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 32720, heeftFiscaalPartner: true, isMinstverdienende: true, kinderen: [KIND] })).iack).toBe(3032)
      expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 60000, heeftFiscaalPartner: true, isMinstverdienende: true, kinderen: [KIND] })).iack).toBe(3032)
    })

    it('bouwt op met 11,45% boven de drempel', () => {
      // 11,45% × (20.000 − 6.239) = 1.575,6
      const r = berekenHeffingskortingen(ctx({ arbeidsinkomen: 20000, heeftFiscaalPartner: true, isMinstverdienende: true, kinderen: [KIND] }))
      expect(r.iack).toBe(1576)
    })

    it('geeft geen recht aan de meestverdienende partner', () => {
      const r = berekenHeffingskortingen(ctx({ arbeidsinkomen: 40000, heeftFiscaalPartner: true, isMinstverdienende: false, kinderen: [KIND] }))
      expect(r.iack).toBe(0)
    })

    it('geeft wel recht aan een alleenstaande ouder', () => {
      const r = berekenHeffingskortingen(ctx({ arbeidsinkomen: 40000, kinderen: [KIND] }))
      expect(r.iack).toBe(3032)
    })

    it('kent geen geboortedatumgrens: een kind geboren in 2026 vóór juli geeft recht', () => {
      const r = berekenHeffingskortingen(ctx({ arbeidsinkomen: 40000, kinderen: [{ id: 'k2', geboortedatum: '2026-03-10' }] }))
      expect(r.iack).toBe(3032)
    })

    it('geeft geen recht als het kind op 1 januari 12 jaar of ouder is', () => {
      const r = berekenHeffingskortingen(ctx({ arbeidsinkomen: 40000, kinderen: [{ id: 'k3', geboortedatum: '2013-12-31' }] }))
      expect(r.iack).toBe(0)
    })

    it('toetst co-ouderschap op het aantal dagen in het huishouden', () => {
      const kind = (dagen: number): KindInvoer => ({ id: 'k4', geboortedatum: '2020-01-01', coOuderschap: { dagenInHuishouden: dagen } })
      expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 40000, kinderen: [kind(150)] })).iack).toBe(0)
      expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 40000, kinderen: [kind(160)] })).iack).toBe(3032)
    })

    it('geeft niets als de regeling niet actief is', () => {
      const params = getJaar(2026)
      params.heffingskortingen.waarde.iack.actief = false
      expect(berekenHeffingskortingen(ctx({ params, arbeidsinkomen: 40000, kinderen: [KIND] })).iack).toBe(0)
    })

    it('geeft niets bij een arbeidsinkomen onder de drempel', () => {
      expect(berekenHeffingskortingen(ctx({ arbeidsinkomen: 6000, kinderen: [KIND] })).iack).toBe(0)
    })
  })

  it('rekent ouderenkorting en de AOW-bedragen als de AOW-leeftijd is bereikt', () => {
    const r = berekenHeffingskortingen(ctx({ aowBereikt: true, arbeidsinkomen: 0, box1Inkomen: 40000, verzamelinkomen: 40000, geboortedatum: '1955-01-01' }))
    expect(r.algemeen).toBe(1228) // 1.556 − 3,195% × (40.000 − 29.736)
    expect(r.ouderen).toBe(2067 + 540) // maximum + alleenstaand
    expect(r.arbeid).toBe(0)
  })

  it('bouwt de ouderenkorting af boven de grens en geeft partners geen alleenstaande ouderenkorting', () => {
    // 2.067 − 15% × (50.000 − 46.002) = 1.467,3
    const r = berekenHeffingskortingen(ctx({ aowBereikt: true, heeftFiscaalPartner: true, arbeidsinkomen: 0, verzamelinkomen: 50000, box1Inkomen: 50000 }))
    expect(r.ouderen).toBe(1467)
  })

  it('geeft nooit automatisch jonggehandicaptenkorting', () => {
    expect(berekenHeffingskortingen(ctx()).jonggehandicapt).toBe(0)
    expect(berekenHeffingskortingen(ctx({ jonggehandicapt: true })).jonggehandicapt).toBe(923)
  })

  it('rekent de korting groen beleggen over de vrijstelling', () => {
    expect(berekenHeffingskortingen(ctx({ groenVrijstelling: 26715 })).groenBeleggen).toBe(27) // 0,1% × 26.715
  })

  it('verzilvert niet meer dan belasting en premies', () => {
    const r = berekenHeffingskortingen(ctx({ maxVerzilverbaar: 1000 }))
    expect(r.verzilverd).toBe(1000)
    expect(r.nietVerzilverd).toBe(r.bruto - 1000)
  })
})
