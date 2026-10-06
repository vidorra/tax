/**
 * Ronde 2 (A6): doorrol van de herinvesteringsreserve, de kostenegalisatiereserve en de genoten stakingsaftrek
 * (doorrol-reserves.ts, via doorrol.ts en nieuw-jaar.ts). H2 naar 2027 en S2 met `genotenStakingsaftrek`.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HerinvesteringsreserveInvoer, HuishoudenInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { berekenReserves } from '@/lib/tax/modules/onderneming/reserves'
import { berekenDoorrol, doorrolWijzigingen, pasDoorrolToe, saldiOpnieuwOvernemen } from '../doorrol'
import { doorrolReserves, pasReservesToe } from '../doorrol-reserves'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

const reken = (i: HuishoudenInvoer) => berekenHuishouden(i, { zonderMarginaleDruk: true })

function huishouden(jaar: number, o: Partial<OndernemingInvoer>, persoon: Partial<HuishoudenInvoer['personen'][number]> = {}): HuishoudenInvoer {
  return {
    jaar,
    personen: [
      {
        id: 'A',
        geboortedatum: '1981-01-01',
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
        ondernemingen: [{ id: 'ond-1', naam: 'Ontwerpstudio', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 1400, urencriteriumGehaald: true }, startjaar: 2015, ...o }],
        ...persoon,
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

const hir = (r: Partial<HerinvesteringsreserveInvoer> = {}): HerinvesteringsreserveInvoer => ({
  id: 'hir-2026-1',
  ontstaanJaar: 2026,
  bedragOntstaan: 12000,
  standBegin: 0,
  herkomst: { omschrijving: 'Bus', opbrengst: 20000, boekwaardeOud: 8000, langlopend: false },
  voornemen: true,
  ...r,
})

describe('doorrol herinvesteringsreserve', () => {
  it('H1 naar 2027: de stand eind 12.000 wordt de stand op 1 januari', () => {
    const v = huishouden(2026, { herinvesteringsreserves: [hir()] })
    const n = nieuwJaarUitVorig(v, 2027, reken(v))
    const r = n.personen[0].ondernemingen[0].herinvesteringsreserves!
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'hir-2026-1', ontstaanJaar: 2026, standBegin: 12000, voornemen: true })
    expect(valideerInvoer(n)).toEqual([])
  })

  it('H2 naar 2027 en 2028: rest 5.000 rolt door; de afboeking gaat mee naar het nieuwe middel in het register', () => {
    const v26 = huishouden(2026, { herinvesteringsreserves: [hir()] })
    const v27 = nieuwJaarUitVorig(v26, 2027, reken(v26))
    v27.personen[0].ondernemingen[0].investeringen = [{ id: 'inv-1', omschrijving: 'Nieuwe bus', datum: '2027-02-01', bedrag: 15000, regeling: 'kia', herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 12000 } }]
    const r27 = reken(v27)
    expect(r27.personen[0].ondernemingen[0].herinvesteringsreserves![0]).toMatchObject({ afboeking: 7000, standEind: 5000, uiterlijkJaar: 2029 })
    const v28 = nieuwJaarUitVorig(v27, 2028, r27)
    const o28 = v28.personen[0].ondernemingen[0]
    expect(o28.herinvesteringsreserves![0].standBegin).toBe(5000)
    const bus = o28.activa!.find((a) => a.omschrijving === 'Nieuwe bus')!
    expect(bus.herinvesteringsreserveAfboeking).toBe(7000)
    expect(bus.investeringsaftrekGrondslag).toBe(8000)
    expect(valideerInvoer(v28)).toEqual([])
  })

  it('boekwaarde-eis over twee jaren (art. 3.54 lid 2): het gedekte deel rolt door naar volgend jaar', () => {
    // 2027: aanhanger van 5.000 zonder afboeking (de eis van 8.000 is nog niet gehaald), wel gekoppeld aan de reserve.
    const v26 = huishouden(2026, { herinvesteringsreserves: [hir()] })
    const v27 = nieuwJaarUitVorig(v26, 2027, reken(v26))
    v27.personen[0].ondernemingen[0].investeringen = [{ id: 'inv-1', omschrijving: 'Aanhanger', datum: '2027-02-01', bedrag: 5000, regeling: 'geen', herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 0 } }]
    const r27 = reken(v27)
    expect(r27.personen[0].ondernemingen[0].herinvesteringsreserves![0].boekwaardeEis?.gedektEind).toBe(5000)
    const v28 = nieuwJaarUitVorig(v27, 2028, r27)
    const h28 = v28.personen[0].ondernemingen[0].herinvesteringsreserves![0]
    expect(h28).toMatchObject({ standBegin: 12000, boekwaardeEisGedekt: 5000 })
    expect(valideerInvoer(v28)).toEqual([])
    // 2028: machine van 10.000. Nog 3.000 van de eis open, dus 5.000 afboeken kan (zonder doorrol zou het maximum 2.000 zijn).
    v28.personen[0].ondernemingen[0].investeringen = [{ id: 'inv-1', omschrijving: 'Machine', datum: '2028-03-01', bedrag: 10000, regeling: 'geen', herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 5000 } }]
    const u28 = reken(v28).personen[0].ondernemingen[0].herinvesteringsreserves![0]
    expect(u28).toMatchObject({ maxAfboeking: 7000, afboeking: 5000, standEind: 7000 })
    // Opnieuw overnemen zet het gedekte deel uit vorig jaar terug.
    v28.personen[0].ondernemingen[0].herinvesteringsreserves![0].boekwaardeEisGedekt = 0
    const { invoer } = saldiOpnieuwOvernemen(v28, v27, r27)
    expect(invoer.personen[0].ondernemingen[0].herinvesteringsreserves![0].boekwaardeEisGedekt).toBe(5000)
  })

  it('een investering die al in het register stond, krijgt de afboeking op dat middel', () => {
    const v27 = huishouden(2027, {
      winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 20000 },
      activaVolledig: true,
      activa: [{ omschrijving: 'Nieuwe bus', aanschafdatum: '2027-01-01', aanschafwaarde: 30000, restwaarde: 5000, levensduurJaren: 5, methode: 'lineair' }],
      investeringen: [{ id: 'inv-1', omschrijving: 'Nieuwe bus', datum: '2027-01-01', bedrag: 30000, regeling: 'kia', herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 12000 } }],
      herinvesteringsreserves: [hir({ standBegin: 12000 })],
    })
    const r27 = reken(v27)
    expect(r27.personen[0].ondernemingen[0].afschrijvingen![0].afschrijving).toBe(2600)
    const v28 = nieuwJaarUitVorig(v27, 2028, r27)
    const o28 = v28.personen[0].ondernemingen[0]
    // Opgebruikt: de reserve rolt niet door.
    expect(o28.herinvesteringsreserves).toBeUndefined()
    const bus = o28.activa![0]
    expect(bus.herinvesteringsreserveAfboeking).toBe(12000)
    expect(bus.investeringsaftrekGrondslag).toBe(18000)
    // In 2028 schrijft het register verder af over 18.000 − 5.000 = 13.000 in vijf jaar: 2.600, vanaf boekwaarde 15.400.
    const r28 = reken(v28)
    expect(r28.personen[0].ondernemingen[0].afschrijvingen![0].afschrijving).toBe(2600)
    expect(r28.personen[0].ondernemingen[0].afschrijvingen![0].boekwaardeBegin).toBe(15400)
  })

  it('H3: na het laatste jaar (2029) rolt de reserve niet meer door', () => {
    const o: OndernemingInvoer = { id: 'ond-1', naam: 'x', winstberekening: { soort: 'saldo', saldo: 0 }, uren: { onderneming: 0 }, startjaar: 2010, herinvesteringsreserves: [hir({ standBegin: 12000 })] }
    const p = getJaar(2028)
    const uit2029 = berekenReserves(o, { params: p, jaar: 2029 })
    expect(uit2029.herinvesteringsreserves[0].vrijval).toBe(12000)
    const ro = { herinvesteringsreserves: uit2029.herinvesteringsreserves } as unknown as Parameters<typeof doorrolReserves>[1]
    expect(doorrolReserves(o, ro, p, 2029, 2030, new Map()).herinvesteringsreserves).toEqual([])
    // Zonder uitkomst rekent de doorrol de reserves zelf uit.
    expect(doorrolReserves(o, undefined, getJaar(2027), 2027, 2028, new Map()).herinvesteringsreserves![0].standBegin).toBe(12000)
  })

  it('opnieuw overnemen houdt de keuzes van dit jaar en werkt de stand bij; een eigen nieuwe reserve blijft', () => {
    const v26 = huishouden(2026, { herinvesteringsreserves: [hir()] })
    const huidig = nieuwJaarUitVorig(v26, 2027, reken(v26))
    const o = huidig.personen[0].ondernemingen[0]
    o.herinvesteringsreserves![0].voornemen = false
    o.herinvesteringsreserves!.push(hir({ id: 'hir-2027-1', ontstaanJaar: 2027, bedragOntstaan: 3000, herkomst: { omschrijving: 'Machine', boekwaardeOud: 1000, langlopend: false } }))
    // Vorig jaar gewijzigd: de reserve was 10.000.
    const vorig = huishouden(2026, { herinvesteringsreserves: [hir({ bedragOntstaan: 10000 })] })
    const { invoer, wijzigingen } = saldiOpnieuwOvernemen(huidig, vorig, reken(vorig))
    const lijst = invoer.personen[0].ondernemingen[0].herinvesteringsreserves!
    expect(lijst).toHaveLength(2)
    expect(lijst[0]).toMatchObject({ id: 'hir-2026-1', standBegin: 10000, voornemen: false, bedragOntstaan: 10000 })
    expect(lijst[1].id).toBe('hir-2027-1')
    expect(wijzigingen.some((w) => w.label === 'Herinvesteringsreserve uit Bus: stand 1 januari' && w.oud === '€ 12.000' && w.nieuw === '€ 10.000')).toBe(true)
  })
})

describe('doorrol kostenegalisatiereserve', () => {
  it('stand eind wordt stand begin; dotatie en onttrekking beginnen leeg; vervallen valt weg', () => {
    const v = huishouden(2026, {
      egalisatiereserves: [
        { id: 'eg-1', omschrijving: 'Groot onderhoud', standBegin: 8000, dotatie: 2000 },
        { id: 'eg-2', omschrijving: 'Verkocht pand', standBegin: 5000, vervallen: true },
      ],
    })
    const n = nieuwJaarUitVorig(v, 2027, reken(v))
    expect(n.personen[0].ondernemingen[0].egalisatiereserves).toEqual([{ id: 'eg-1', omschrijving: 'Groot onderhoud', standBegin: 10000 }])
  })

  it('pasReservesToe: een nieuwe reserve van dit jaar zonder stand blijft staan', () => {
    const o: OndernemingInvoer = {
      naam: 'x',
      winstberekening: { soort: 'saldo', saldo: 0 },
      uren: { onderneming: 0 },
      startjaar: 2010,
      egalisatiereserves: [
        { id: 'eg-1', omschrijving: 'Groot onderhoud', standBegin: 9000, dotatie: 1000 },
        { id: 'eg-9', omschrijving: 'Nieuw', standBegin: 0, dotatie: 500 },
        { id: 'eg-3', omschrijving: 'Opgebruikt', standBegin: 4000 },
      ],
    }
    pasReservesToe(o, { egalisatiereserves: [{ id: 'eg-1', omschrijving: 'Groot onderhoud', standBegin: 10000 }] }, 2027)
    expect(o.egalisatiereserves).toEqual([
      { id: 'eg-1', omschrijving: 'Groot onderhoud', standBegin: 10000, dotatie: 1000 },
      { id: 'eg-9', omschrijving: 'Nieuw', standBegin: 0, dotatie: 500 },
    ])
  })
})

describe('doorrol genoten stakingsaftrek', () => {
  const staking = (persoon: Partial<HuishoudenInvoer['personen'][number]> = {}) =>
    huishouden(2026, { for: { stand: 17460 }, staking: { soort: 'geheel', datum: '2026-07-01', stakingswinst: 25000 } }, persoon)

  it('de stakingsaftrek van dit jaar telt op bij wat eerder genoten was', () => {
    const v = staking()
    const r = reken(v)
    expect(r.personen[0].ondernemersaftrek.stakingsaftrek).toBe(3630)
    const d = berekenDoorrol(v, r, 2027)
    expect(d.personen[0].saldi?.genotenStakingsaftrek).toBe(3630)
    const n = nieuwJaarUitVorig(v, 2027, r)
    expect(n.personen[0].genotenStakingsaftrek).toBe(3630)
    expect(n.personen[0].ondernemingen[0].staking).toBeUndefined()
  })

  it('S2: in 2026 al 2.000 genoten: stakingsaftrek 1.630; daarna 3.630 genoten', () => {
    const v = staking({ genotenStakingsaftrek: 2000 })
    const r = reken(v)
    expect(r.personen[0].ondernemersaftrek.stakingsaftrek).toBe(1630)
    const n = nieuwJaarUitVorig(v, 2027, r)
    expect(n.personen[0].genotenStakingsaftrek).toBe(3630)
  })

  it('zonder staking rolt een eerder genoten bedrag door; wijzigingen tonen het', () => {
    const v = huishouden(2026, {}, { genotenStakingsaftrek: 1000 })
    const r = reken(v)
    const huidig = huishouden(2027, {})
    const { invoer } = pasDoorrolToe(huidig, berekenDoorrol(v, r, 2027))
    expect(invoer.personen[0].genotenStakingsaftrek).toBe(1000)
    expect(doorrolWijzigingen(huidig, invoer).some((w) => w.label === 'Stakingsaftrek eerder genoten' && w.oud === 'geen' && w.nieuw === '€ 1.000')).toBe(true)
  })

  it('nieuw jaar: de stakingslijfrente en de jaarbedragen van de auto beginnen leeg', () => {
    const v = huishouden(
      2026,
      {
        auto: { cataloguswaarde: 40000, datumEersteToelating: '2020-01-01', nulEmissie: false, autokosten: 6000, eigenBijdrage: 500, btw: { aftrekBijAanschaf: true, methode: 'kilometers', btwOpKosten: 900, priveKmInclWoonWerk: 3000, totaalKm: 20000 } },
      },
      { inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, stakingslijfrente: { premie: 1000 } } },
    )
    const n = nieuwJaarUitVorig(v, 2027, reken(v))
    expect(n.personen[0].inkomensvoorziening.stakingslijfrente).toBeUndefined()
    expect(n.personen[0].ondernemingen[0].auto).toEqual({ cataloguswaarde: 40000, datumEersteToelating: '2020-01-01', nulEmissie: false, autokosten: 6000, btw: { aftrekBijAanschaf: true, methode: 'kilometers' } })
  })
})
