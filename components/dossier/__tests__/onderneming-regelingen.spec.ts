/**
 * Ronde 2 (A6): pure hulpfuncties van de editor voor de regelingen van de onderneming
 * (components/dossier/regelingen/onderneming-regelingen.ts).
 */
import { describe, expect, it } from 'vitest'
import type { ActiefInvoer, OndernemingInvoer, StakingInvoer } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { berekenOnderneming } from '@/lib/tax/modules/onderneming'
import { isVeldId } from '@/lib/dossier/veld'
import {
  boekwaardeOpDatum,
  eigenHerkomstDitJaar,
  hirBeschikbaar,
  hirMaxVoorInvestering,
  hirUitActief,
  hirVoorActief,
  hirVoortgang,
  houdStakingswinstGelijk,
  nieuweEgalisatie,
  nieuweHerkomst,
  nieuweHir,
  postenUitRegister,
  regelingenMetWinstBron,
  stakingWat,
  stakingsSom,
  vrijeId,
  zetStakingWat,
} from '../regelingen/onderneming-regelingen'

const p2026 = getJaar(2026)

const onderneming = (o: Partial<OndernemingInvoer> = {}): OndernemingInvoer => ({
  id: 'ond-1',
  naam: 'Ontwerpstudio',
  winstberekening: { soort: 'saldo', saldo: 50000 },
  uren: { onderneming: 1400 },
  startjaar: 2015,
  ...o,
})

const bus: ActiefInvoer = {
  omschrijving: 'Bestelbus',
  aanschafdatum: '2022-01-01',
  aanschafwaarde: 28000,
  restwaarde: 4000,
  levensduurJaren: 5,
  methode: 'lineair',
  boekwaardeBegin: 8000,
  verkocht: { datum: '2026-12-31', verkoopprijs: 20000 },
}

describe('vraag winstBron', () => {
  it('alleen als een regeling die ervan afhangt speelt', () => {
    expect(regelingenMetWinstBron(onderneming())).toEqual([])
    expect(regelingenMetWinstBron(onderneming({ auto: { cataloguswaarde: 1, datumEersteToelating: '2020-01-01', nulEmissie: false, autokosten: 0 } }))).toEqual([])
    expect(regelingenMetWinstBron(onderneming({ auto: { cataloguswaarde: 1, datumEersteToelating: '2020-01-01', nulEmissie: false, autokosten: 0, btw: { aftrekBijAanschaf: true, methode: 'forfait' } } }))).toEqual(['autoBtw'])
    expect(regelingenMetWinstBron(onderneming({ staking: { stakingswinst: 0 } }), true)).toEqual(['staking', 'partner'])
    expect(regelingenMetWinstBron(onderneming({ herinvesteringsreserves: [nieuweHir(onderneming(), 2026)], egalisatiereserves: [nieuweEgalisatie(onderneming())] }))).toEqual(['hir', 'egalisatie'])
  })
})

describe('staking', () => {
  it('wat er gebeurde: chips en soort', () => {
    const s: StakingInvoer = { stakingswinst: 0, gedeeltelijk: true }
    expect(stakingWat(s)).toBe('deel')
    zetStakingWat(s, 'bv')
    expect(s).toMatchObject({ soort: 'geheel', gebeurtenis: 'bv' })
    expect(s.gedeeltelijk).toBeUndefined()
    s.soort = 'geruisloosBV'
    zetStakingWat(s, 'bv')
    expect(s.soort).toBe('geruisloosBV')
    zetStakingWat(s, 'verkocht')
    expect(s.soort).toBe('geheel')
    s.soort = 'doorschuiving'
    zetStakingWat(s, 'gestopt')
    expect(s.soort).toBe('geheel')
    zetStakingWat(s, 'deel')
    expect(s.soort).toBe('gedeeltelijk')
    expect(stakingWat({ stakingswinst: 0, soort: 'geruisloosBV' })).toBe('bv')
    expect(stakingWat({ stakingswinst: 0 })).toBe('gestopt')
  })

  it('S1: som van de posten met goodwill houdt de stakingswinst gelijk (25.000)', () => {
    const s: StakingInvoer = {
      stakingswinst: 0,
      goodwill: 20000,
      posten: [
        { soort: 'overigeActiva', omschrijving: 'Inventaris', waardeOfOpbrengst: 6000, fiscaleBoekwaarde: 4000 },
        { soort: 'overigeActiva', omschrijving: 'Auto naar privé', waardeOfOpbrengst: 12000, fiscaleBoekwaarde: 9000, naarPrive: true },
      ],
    }
    expect(stakingsSom(s)).toBe(25000)
    houdStakingswinstGelijk(s)
    expect(s.stakingswinst).toBe(25000)
    // Zonder posten blijft het ene bedrag staan.
    const een: StakingInvoer = { stakingswinst: 7000 }
    houdStakingswinstGelijk(een)
    expect(een.stakingswinst).toBe(7000)
  })

  it('posten uit het register met de boekwaarde op de stakingsdatum', () => {
    const o = onderneming({
      activaVolledig: true,
      winstberekening: { soort: 'saldo', saldo: 50000, afschrijvingenInSaldo: 0 },
      activa: [
        { omschrijving: 'Laptop', aanschafdatum: '2025-01-01', aanschafwaarde: 2400, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', boekwaardeBegin: 1920, herkomst: 'act:2025:0' },
        { omschrijving: 'Oud bureau', aanschafdatum: '2018-01-01', aanschafwaarde: 900, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', verkocht: { datum: '2024-05-01', verkoopprijs: 50 } },
        { ...bus, verkocht: { datum: '2026-07-01', verkoopprijs: 15000 } },
      ],
    })
    const r = berekenOnderneming(o, { params: p2026, jaar: 2026, aowBereikt: false, urenLoondienst: 0 })
    const posten = postenUitRegister(o, r.afschrijvingen, '2026-07-01', 2026)
    // Het bureau was al vóór dit jaar verkocht.
    expect(posten.map((p) => p.omschrijving)).toEqual(['Laptop', 'Bestelbus'])
    // Laptop: 1.920 min zeven twaalfde van 480 = 1.640; opbrengst nog in te vullen.
    expect(posten[0]).toEqual({ soort: 'overigeActiva', omschrijving: 'Laptop', actiefHerkomst: 'act:2025:0', waardeOfOpbrengst: 0, fiscaleBoekwaarde: 1640 })
    // Bus, in dit jaar verkocht: de boekwaarde vlak voor de verkoop, met de verkoopprijs.
    const busUit = r.afschrijvingen!.find((x) => x.invoerIndex === 2)!
    expect(posten[1].waardeOfOpbrengst).toBe(15000)
    expect(posten[1].fiscaleBoekwaarde).toBe(Math.round(busUit.boekwaardeBegin - busUit.afschrijving))
    expect(boekwaardeOpDatum({ ...busUit, verkochtDitJaar: false }, '2026-12-31', 2026)).toBe(Math.round(busUit.boekwaardeBegin - busUit.afschrijving))
  })
})

describe('herinvesteringsreserve', () => {
  it('H1: bus met boekwaarde 8.000 verkocht voor 20.000 geeft een reserve van 12.000, gekoppeld op de herkomst', () => {
    const o = onderneming({ activa: [bus] })
    const herkomst = nieuweHerkomst(o, 2026)
    expect(herkomst).toBe('act:2026:1000')
    expect(eigenHerkomstDitJaar(herkomst, 2026)).toBe(true)
    expect(eigenHerkomstDitJaar('act:2025:3', 2026)).toBe(false)
    const r = hirUitActief({ ...bus, herkomst }, { boekwinst: 12000 }, herkomst, 2026, p2026, vrijeId(o.herinvesteringsreserves, 'hir-2026'))
    expect(r).toEqual({
      id: 'hir-2026-1',
      ontstaanJaar: 2026,
      bedragOntstaan: 12000,
      standBegin: 0,
      herkomst: { omschrijving: 'Bestelbus', actiefHerkomst: herkomst, opbrengst: 20000, boekwaardeOud: 8000, langlopend: false },
      voornemen: true,
    })
    const met = onderneming({ activa: [{ ...bus, herkomst }], herinvesteringsreserves: [r] })
    expect(hirVoorActief(met, met.activa![0])?.id).toBe('hir-2026-1')
    expect(hirVoorActief(met, bus)).toBeUndefined()
    // De engine rekent dezelfde boekwinst: dotatie 12.000 en geen extra winst.
    const uit = berekenOnderneming(met, { params: p2026, jaar: 2026, aowBereikt: false, urenLoondienst: 0 })
    expect(uit.herinvesteringsreserves?.[0]).toMatchObject({ dotatie: 12000, standEind: 12000 })
  })

  it('H1b en H2: "tot € …" bij een investering volgt de stand en de boekwaarde-eis', () => {
    const r = { ...nieuweHir(onderneming(), 2026), standBegin: 12000, bedragOntstaan: 12000, herkomst: { omschrijving: 'Bus', opbrengst: 20000, boekwaardeOud: 8000, langlopend: false } }
    const inv = (bedrag: number, afboeking?: number) => ({ id: 'inv-1', omschrijving: 'Nieuwe bus', datum: '2027-03-01', bedrag, ...(afboeking ? { herinvesteringsreserve: { reserveId: r.id, afboeking } } : {}) })
    expect(hirMaxVoorInvestering(r, [inv(30000)], 0, 2027)).toBe(12000)
    expect(hirMaxVoorInvestering(r, [inv(15000)], 0, 2027)).toBe(7000)
    // Een tweede investering: wat de eerste al afboekt, gaat eraf.
    expect(hirMaxVoorInvestering(r, [inv(30000, 10000), { ...inv(5000), id: 'inv-2' }], 1, 2027)).toBe(2000)
    // Beschikbaar binnen de termijn met voornemen; niet meer na het laatste jaar.
    const o = onderneming({ herinvesteringsreserves: [r] })
    expect(hirBeschikbaar(o, 2027, p2026).map((x) => x.id)).toEqual([r.id])
    expect(hirBeschikbaar(o, 2030, p2026)).toEqual([])
    expect(hirBeschikbaar(onderneming({ herinvesteringsreserves: [{ ...r, voornemen: false }] }), 2027, p2026)).toEqual([])
  })

  it('balk in de tijd en vrije id', () => {
    expect(hirVoortgang(2026, 2029, 2026)).toBe(0)
    expect(hirVoortgang(2026, 2029, 2029)).toBe(1)
    expect(hirVoortgang(2026, 2029, 2027)).toBeCloseTo(1 / 3)
    expect(vrijeId([{ id: 'eg-1' }, { id: 'eg-3' }], 'eg')).toBe('eg-2')
    expect(isVeldId(`persoon:A/onderneming:ond-1/herinvesteringsreserve:${vrijeId(undefined, 'hir-2026')}/voornemen`)).toBe(true)
  })
})
