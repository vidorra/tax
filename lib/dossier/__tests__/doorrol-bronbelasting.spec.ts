/**
 * Ronde 2 (A5): doorrol van de voortgewentelde bronbelasting (BB6 van 2026 naar 2027) en van de boekwaarde per
 * terbeschikkingstelling; nieuw jaar zonder bronbelastingregels en zonder geëindigde terbeschikkingstellingen.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import type { HuishoudenInvoer, PersoonInvoer, TerbeschikkingstellingInvoer } from '@/lib/tax/types'
import { berekenDoorrol, doorrolWijzigingen, pasDoorrolToe, premiegrondslagInkomen } from '../doorrol'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

const pers = (id: 'A' | 'B', extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id,
  geboortedatum: '1985-05-05',
  ondernemingen: [],
  loon: [],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...extra,
})

/** BB6: box 3-belasting 200 (belegging 68.650), VS bruto 3.000, ingehouden 450. */
function jaar2026(): HuishoudenInvoer {
  return {
    jaar: 2026,
    personen: [pers('A')],
    fiscaalPartner: false,
    kinderen: [],
    box3: {
      posities: [
        {
          id: 'degiro',
          omschrijving: 'Beleggingsrekening',
          categorie: 'beleggingen',
          eigenaar: 'A',
          waardeBegin: 68650,
          waardeEind: 200000,
          bronbelastingen: [{ id: 'bb-us', land: 'US', soort: 'dividend', brutoInkomsten: 3000, bedrag: 450 }],
        },
      ],
      schulden: [],
    },
    verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
  }
}

const run = (i: HuishoudenInvoer) => berekenHuishouden(i, { zonderMarginaleDruk: true })

describe('doorrol bronbelasting (BB6 naar 2027)', () => {
  it('250 schuift door naar 2027; de regels van 2026 gaan niet mee', () => {
    const v = jaar2026()
    const r = run(v)
    expect(r.personen[0].bronbelasting?.naarVolgendJaar).toBe(250)
    expect(berekenDoorrol(v, r, 2027).personen[0].saldi?.voortgewenteldeBronbelasting).toBe(250)
    const n = nieuwJaarUitVorig(v, 2027, r)
    expect(n.personen[0].voortgewenteldeBronbelasting).toBe(250)
    expect(n.box3.posities[0].bronbelastingen).toBeUndefined()
    expect(n.box3.posities[0].waardeBegin).toBe(200000)
    expect(valideerInvoer(n)).toEqual([])
  })

  it('in 2027: nieuw 300 + 250, box 3-belasting ruim: verrekend 550, naar 2028 0; zonder box 3-belasting 550 door', () => {
    const v = jaar2026()
    const n = nieuwJaarUitVorig(v, 2027, run(v))
    n.box3.posities[0].bronbelastingen = [{ id: 'bb-us', land: 'US', soort: 'dividend', brutoInkomsten: 2000, bedrag: 300 }]
    const r27 = run(n)
    expect(r27.personen[0].box3BelastingVoorVerrekening).toBeGreaterThanOrEqual(1000)
    expect(r27.personen[0].bronbelasting).toMatchObject({ verrekenbaar: 300, voortgewenteldIn: 250, verrekend: 550, naarVolgendJaar: 0 })
    expect(berekenDoorrol(n, r27, 2028).personen[0].saldi?.voortgewenteldeBronbelasting).toBe(0)
    // Variant: box 3-belasting 0 in 2027.
    const leeg = { ...n, box3: { ...n.box3, posities: [{ ...n.box3.posities[0], waardeBegin: 1000 }] } }
    const r0 = run(leeg)
    expect(r0.personen[0].bronbelasting).toMatchObject({ verrekend: 0, naarVolgendJaar: 550 })
    const n28 = nieuwJaarUitVorig(leeg, 2028, r0)
    expect(n28.personen[0].voortgewenteldeBronbelasting).toBe(550)
  })

  it('opnieuw overnemen zet het saldo en toont de wijziging "Bronbelasting uit eerdere jaren"', () => {
    const v = jaar2026()
    const doel = nieuwJaarUitVorig(v, 2027)
    expect(doel.personen[0].voortgewenteldeBronbelasting).toBeUndefined()
    const { invoer } = pasDoorrolToe(doel, berekenDoorrol(v, run(v), 2027))
    expect(invoer.personen[0].voortgewenteldeBronbelasting).toBe(250)
    expect(doorrolWijzigingen(doel, invoer)).toContainEqual({ persoon: 'A', label: 'Bronbelasting uit eerdere jaren', oud: 'geen', nieuw: '€ 250' })
    // Niets meer door: het veld verdwijnt.
    const zonder = jaar2026()
    zonder.box3.posities[0].bronbelastingen = []
    const { invoer: weg } = pasDoorrolToe(invoer, berekenDoorrol(zonder, run(zonder), 2027))
    expect(weg.personen[0].voortgewenteldeBronbelasting).toBeUndefined()
  })
})

describe('doorrol terbeschikkingstelling', () => {
  const bus = (extra: Partial<TerbeschikkingstellingInvoer> = {}): TerbeschikkingstellingInvoer => ({
    id: 'tbs-bus',
    omschrijving: 'Bestelbus',
    aan: { persoon: 'A', ondernemingId: 'ond-1' },
    soort: 'zaak',
    vergoeding: 2400,
    kosten: 300,
    afschrijving: 1500,
    waardeBijAanvang: 30000,
    ...extra,
  })
  const huishouden = (t: TerbeschikkingstellingInvoer[]): HuishoudenInvoer => ({
    jaar: 2026,
    personen: [
      pers('A', { ondernemingen: [{ id: 'ond-1', naam: 'Ontwerpstudio', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 1500 }, startjaar: 2015, samenwerkingMetPartner: 'geen' }] }),
      pers('B', { terbeschikkingstellingen: t }),
    ],
    fiscaalPartner: true,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
  })

  it('boekwaarde eind (30.000 − 1.500) wordt boekwaarde begin; vergoeding blijft als sjabloon', () => {
    const v = huishouden([bus()])
    const n = nieuwJaarUitVorig(v, 2027, run(v))
    expect(n.personen[1].terbeschikkingstellingen?.[0]).toMatchObject({ id: 'tbs-bus', vergoeding: 2400, boekwaardeBegin: 28500 })
    expect(valideerInvoer(n)).toEqual([])
  })

  it('premiegrondslag van volgend jaar (art. 3.127 lid 3): beloning en belast tbs-resultaat tellen mee via het overig werk', () => {
    const v = huishouden([bus()])
    v.personen[0].ondernemingen[0].samenwerkingMetPartner = 'arbeidsbeloning'
    v.personen[0].ondernemingen[0].meewerkendePartner = { uren: 600, vergoeding: 6000 }
    const r = run(v)
    const b = r.personen.find((p) => p.id === 'B')!
    expect(b.overigWerk).toBe(6528)
    expect(premiegrondslagInkomen(b)).toBe(6528)
  })

  it('een terbeschikkingstelling die in het vorige jaar eindigde, gaat niet mee', () => {
    const v = huishouden([bus({ einde: { datum: '2026-06-30', opbrengst: 25000 } }), bus({ id: 'tbs-lening', omschrijving: 'Lening', soort: 'lening', vergoeding: 800, kosten: 0, afschrijving: 0 })])
    const n = nieuwJaarUitVorig(v, 2027, run(v))
    expect(n.personen[1].terbeschikkingstellingen?.map((t) => t.id)).toEqual(['tbs-lening'])
  })
})
