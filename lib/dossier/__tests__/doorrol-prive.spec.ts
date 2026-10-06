import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, PersoonInvoer } from '@/lib/tax/types'
import { berekenHuishouden } from '@/lib/tax/engine'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { berekenDoorrol, doorrolWijzigingen, pasDoorrolToe, saldiOpnieuwOvernemen } from '../doorrol'
import { valideerInvoer } from '../valideer'

const persoon = (id: 'A' | 'B', extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id,
  geboortedatum: id === 'A' ? '1985-03-01' : '1987-06-01',
  ondernemingen: [],
  loon: [{ id: `loon-${id}`, omschrijving: 'Acme BV', soort: 'loon', bruto: 60000, ingehoudenLoonheffing: 15000 }],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...extra,
})

/** EW1 en EW2 in 2026: verkoop 1-3, aankoop 1-6, lening 450.000 (stand eind 446.000), partners. */
const ew2026 = (): HuishoudenInvoer => ({
  jaar: 2026,
  personen: [persoon('A'), persoon('B')],
  fiscaalPartner: true,
  kinderen: [],
  eigenWoning: {
    woz: 485000,
    vorigeWoning: { leverdatum: '2026-03-01', verkoopprijs: 400000, verkoopkosten: 8000, eigenwoningschuld: 250000, aandeelA: 0.5 },
    aankoop: { leverdatum: '2026-06-01', koopsom: 485000, kostenKoper: 15000, aandeelA: 0.5 },
    leningdelen: [{ id: 'ld-1', omschrijving: 'Hypotheek', hoofdsom: 450000, startdatum: '2026-06-01', aflossingsvorm: 'annuitair', rente: 9000, standEind: 446000 }],
  },
  box3: { posities: [], schulden: [] },
  verdeling: 'optimaal',
})

describe('doorrol eigen woning (EW2b)', () => {
  const vorig = ew2026()
  const r2026 = berekenHuishouden(vorig)

  it('2026: deel eigen woning eind 354.818, ander deel 91.182', () => {
    expect(r2026.eigenWoning?.leningsplitsing?.[0]).toMatchObject({ id: 'ld-1', eigenwoningEind: 354818, anderEind: 91182, reden: 'bijleenregeling' })
    expect(r2026.eigenWoning?.eigenwoningreserve).toEqual([])
  })

  it('nieuw jaar 2027: splitsing per leningdeel, box 3-schuld met herkomst, stand begin 446.000; aankoop en verkoop weg', () => {
    const n = nieuwJaarUitVorig(vorig, 2027, r2026)
    const ld = n.eigenWoning!.leningdelen![0]
    expect(ld.standBegin).toBe(446000)
    expect(ld.standEind).toBeUndefined()
    expect(ld.eigenwoningschuld).toEqual({ begin: 354818, reden: 'bijleenregeling' })
    expect(n.eigenWoning!.aankoop).toBeUndefined()
    expect(n.eigenWoning!.vorigeWoning).toBeUndefined()
    expect(n.box3.schulden).toEqual([
      expect.objectContaining({ waardeBegin: 91182, herkomst: { bron: 'eigenwoningschuld', jaar: 2026, sleutel: 'ld-1' } }),
    ])
    expect(valideerInvoer(n)).toEqual([])

    // 2027: rente 20.000 geeft in box 1 15.911; het andere deel telt alleen in box 3, niet nog eens.
    n.eigenWoning!.leningdelen![0].rente = 20000
    const r2027 = berekenHuishouden(n)
    expect(r2027.eigenWoning?.rente).toBe(15911)
    expect(r2027.eigenWoning?.waarschuwingen.map((w) => w.id)).not.toContain('ew-box3-schuld')
    expect(r2027.box3.aftrekbareSchulden).toBeLessThanOrEqual(91182)
  })

  it('opnieuw overnemen werkt de box 3-schuld bij op de sleutel in plaats van er een tweede te maken', () => {
    const n = nieuwJaarUitVorig(vorig, 2027, r2026)
    const ander = ew2026()
    ander.eigenWoning!.leningdelen![0].standEind = 440000
    const { invoer, wijzigingen } = saldiOpnieuwOvernemen(n, ander, berekenHuishouden(ander))
    const herkomst = invoer.box3.schulden.filter((s) => s.herkomst?.bron === 'eigenwoningschuld')
    expect(herkomst).toHaveLength(1)
    expect(herkomst[0].waardeBegin).toBe(440000 - Math.round((440000 * 358000) / 450000))
    expect(wijzigingen.map((w) => w.label)).toContain('Hypotheek, deel box 3')
    // Twee keer toepassen geeft hetzelfde.
    const twee = pasDoorrolToe(invoer, berekenDoorrol(ander, berekenHuishouden(ander), 2027)).invoer
    expect(twee.box3.schulden).toEqual(invoer.box3.schulden)
  })

  it('reserve uit een verkoop zonder nieuwe woning rolt door en vervalt na drie jaar', () => {
    const v = ew2026()
    delete v.eigenWoning!.aankoop
    v.eigenWoning!.leningdelen = []
    const n = nieuwJaarUitVorig(v, 2027, berekenHuishouden(v))
    expect(n.eigenWoning!.eigenwoningreserve).toEqual([
      { eigenaar: 'A', datumToevoeging: '2026-03-01', bedrag: 71000 },
      { eigenaar: 'B', datumToevoeging: '2026-03-01', bedrag: 71000 },
    ])
    expect(doorrolWijzigingen(v, n).map((w) => w.label)).toContain('Eigenwoningreserve')
  })
})

describe('doorrol box 2-verlies (B2-1 naar 2027)', () => {
  const vorig: HuishoudenInvoer = {
    jaar: 2026,
    personen: [persoon('A', { box2InkomenVorigJaar: 4000 })],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    box2: [{ id: 'ab-1', eigenaar: 'A', dividend: 0, ingehoudenDividendbelasting: 0, vervreemdingsvoordeel: -10000 }],
    verdeling: 'optimaal',
  }

  it('verlies 6.000 uit 2026 rolt door, box 2-inkomen van vorig jaar is 0 en verdwijnt', () => {
    const n = nieuwJaarUitVorig(vorig, 2027, berekenHuishouden(vorig))
    const p = n.personen[0]
    expect(p.box2Verliezen).toEqual([{ jaar: 2026, bedrag: 6000 }])
    expect(p.box2InkomenVorigJaar).toBeUndefined()
    expect(valideerInvoer(n)).toEqual([])
    // B2-5: dividend 15.000 in 2027 verrekent het restant.
    n.box2 = [{ id: 'ab-1', eigenaar: 'A', dividend: 15000, ingehoudenDividendbelasting: 0 }]
    const r = berekenHuishouden(n)
    expect(r.personen[0].box2Verlies?.verrekend).toBe(6000)
    expect(r.personen[0].box2Verlies?.resterend).toEqual([])
  })

  it('een lopende korting rolt door met het restant; het verzoek blijft in het jaar waarin het is gedaan', () => {
    const v: HuishoudenInvoer = {
      ...vorig,
      personen: [persoon('A', { loon: [], box2Verliezen: [{ jaar: 2024, bedrag: 20000 }], box2Belastingkorting: { verzoek: true } })],
      box2: undefined,
    }
    const r = berekenHuishouden(v)
    expect(r.personen[0].box2Verlies?.belastingkorting.resterend[0]).toMatchObject({ restant: 4900, uiterlijkJaar: 2033, praktijkUiterlijkJaar: 2032 })
    const n = nieuwJaarUitVorig(v, 2027, r)
    expect(n.personen[0].box2Belastingkorting).toEqual({ lopend: [{ verliesjaar: 2024, eersteJaar: 2026, restant: 4900 }] })
    expect(n.personen[0].box2Verliezen).toBeUndefined()
    expect(doorrolWijzigingen(v, n).map((w) => w.label)).toEqual(expect.arrayContaining(['Verliezen box 2', 'Belastingkorting box 2']))
  })
})
