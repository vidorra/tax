/**
 * Velden in de uitkomst die het nieuwe jaar nodig heeft (G04, G07): restant verliezen, niet-benutte
 * zelfstandigenaftrek, restant persoonsgebonden aftrek, FOR-stand en vrijwillige afname, fiscale boekwaarde per actief
 * en het urencriterium.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '../engine'
import type { HuishoudenInvoer, OndernemingInvoer, PersoonInvoer } from '../types'

function persoon(o: Partial<OndernemingInvoer>, extra: Partial<PersoonInvoer> = {}): PersoonInvoer {
  return {
    id: 'A',
    geboortedatum: '1988-03-01',
    loon: [],
    inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
    ondernemingen: [{ naam: 'zaak', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 0, urencriteriumGehaald: true }, startjaar: 2015, ...o }],
    ...extra,
  }
}

function huishouden(p: PersoonInvoer, jaar = 2025): HuishoudenInvoer {
  return { jaar, personen: [p], fiscaalPartner: false, kinderen: [], box3: { posities: [], schulden: [] }, verdeling: 'optimaal' }
}

const reken = (h: HuishoudenInvoer) => berekenHuishouden(h, { zonderMarginaleDruk: true })

describe('doorrol naar het nieuwe jaar: velden in de uitkomst', () => {
  it('verliezen: wat na verrekening overblijft, per verliesjaar, zonder vervallen verliezen', () => {
    const r = reken(huishouden(persoon({ winstberekening: { soort: 'saldo', saldo: 10000 } }, { verliezen: [{ jaar: 2014, bedrag: 4000 }, { jaar: 2023, bedrag: 50000 }] })))
    const a = r.personen[0]
    expect(a.verliesverrekening).toBeGreaterThan(0)
    expect(a.verliezenResterend).toEqual([{ jaar: 2023, bedrag: 50000 - a.verliesverrekening, vervaltNa: 2032 }])
    expect(a.verliesDitJaar).toBe(0)
  })

  it('verlies van dit jaar staat apart', () => {
    const r = reken(huishouden(persoon({ winstberekening: { soort: 'saldo', saldo: -8000 } })))
    // Het verlies na de MKB-winstvrijstelling (die verkleint ook een verlies).
    expect(r.personen[0].belastbareWinst).toBeLessThan(0)
    expect(r.personen[0].verliesDitJaar).toBe(-r.personen[0].belastbareWinst)
    expect(r.personen[0].verliezenResterend).toEqual([])
  })

  it('verlies volledig verrekend: niets meer over', () => {
    const r = reken(huishouden(persoon({}, { verliezen: [{ jaar: 2023, bedrag: 10000 }] })))
    expect(r.personen[0].verliesverrekening).toBe(10000)
    expect(r.personen[0].verliezenResterend).toEqual([])
  })

  it('niet-benutte zelfstandigenaftrek: rest per jaar en het nieuwe bedrag', () => {
    const r = reken(huishouden(persoon({ winstberekening: { soort: 'saldo', saldo: 60000 } }, { nietBenutteZelfstandigenaftrek: [{ jaar: 2022, bedrag: 1500 }] })))
    const oa = r.personen[0].ondernemersaftrek
    expect(oa.nietBenutOverzicht?.[0]).toMatchObject({ jaar: 2022, begin: 1500, verrekend: 1500, rest: 0 })
    const laag = reken(huishouden(persoon({ winstberekening: { soort: 'saldo', saldo: 500 } })))
    expect(laag.personen[0].ondernemersaftrek.nietBenutteZelfstandigenaftrekNieuw).toBeGreaterThan(0)
  })

  it('restant persoonsgebonden aftrek', () => {
    const h = huishouden(persoon({ winstberekening: { soort: 'saldo', saldo: 0 } }, { restantPgaVorigJaar: 2000 }))
    const r = reken(h)
    expect(r.personen[0].pgaToerekening?.restant).toBe(2000)
  })

  it('FOR: stand eind en vrijwillige afname per onderneming (G07)', () => {
    // De vrijwillige afname kan alleen tegenover een afgetrokken lijfrentepremie (hier de omzetting van de FOR).
    const r = reken(
      huishouden(persoon({ for: { stand: 20000, ondernemingsvermogenEinde: 15000, vrijwilligeAfname: 5000 } }, { inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, forOmzetting: 5000 } })),
    )
    const o = r.personen[0].ondernemingen[0]
    expect(o.verplichteForAfname).toBe(0)
    expect(o.forVrijwilligeAfname).toBe(5000)
    expect(o.forStandBegin).toBe(20000)
    expect(o.forStandEind).toBe(15000)
    expect(o.winst).toBe(65000)
  })

  it('activa: fiscale boekwaarde eind per actief met de positie in de invoer, en het urencriterium', () => {
    const r = reken(
      huishouden(
        persoon({
          activa: [
            { omschrijving: 'laptop', aanschafdatum: '2025-07-15', aanschafwaarde: 2000, restwaarde: 0, levensduurJaren: 4, methode: 'lineair' },
            { omschrijving: 'bus', aanschafdatum: '2023-01-10', aanschafwaarde: 5000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', verkocht: { datum: '2025-06-30', verkoopprijs: 3000 } },
          ],
        }),
      ),
    )
    const o = r.personen[0].ondernemingen[0]
    expect(o.afschrijvingen).toEqual([
      expect.objectContaining({ omschrijving: 'laptop', invoerIndex: 0, boekwaardeEind: 1800, verkochtDitJaar: false }),
      expect.objectContaining({ omschrijving: 'bus', invoerIndex: 1, boekwaardeEind: 0, verkochtDitJaar: true }),
    ])
    expect(o.urencriteriumGehaald).toBe(true)
  })
})
