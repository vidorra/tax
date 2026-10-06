/**
 * Ronde 2 (A3): zoeken in het veldregister en de regelingen (lib/dossier/zoeken.ts). De meeste tests gebruiken
 * testregelingen met dezelfde vorm als die van A2, A5 en A6; de laatste test loopt over de echte registers.
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { vulIds } from '../ids'
import { REGELINGEN, VELDREGISTER } from '../veldregister'
import type { RegelingItem, VeldregisterItem } from '../veldregister/types'
import { catalogus, instanties, matchPatroon, normaliseer, vindVeld, waarVanVeld, zoek } from '../zoeken'

const voorbeeld = (): HuishoudenInvoer => vulIds(voorbeeldInvoer(2024))

/** Testregelingen zoals A2 en A6 ze registreren (synoniemen uit ux-ronde2.md 8.7). */
const regeling = (x: Partial<RegelingItem> & Pick<RegelingItem, 'id' | 'naam' | 'synoniemen' | 'plaats'>): RegelingItem => ({
  uitleg: '',
  actiefBij: () => [],
  kiezers: (i) => i.personen.flatMap((p) => p.ondernemingen.map((o) => ({ elementId: `situaties-${p.id}-${o.id}`, waar: `${o.naam}, Persoon ${p.id}` }))),
  ...x,
})
const TEST_REGELINGEN: RegelingItem[] = [
  regeling({ id: 'hir', naam: 'Herinvesteringsreserve', synoniemen: ['HIR', 'herinvestering', 'boekwinst'], plaats: 'onderneming', uitleg: 'Je betaalt nu geen belasting over de boekwinst als je opnieuw investeert.' }),
  regeling({ id: 'staking', naam: 'Gestopt, verkocht of omgezet', synoniemen: ['stoppen', 'staking', 'BV', 'verkopen'], plaats: 'onderneming' }),
  regeling({ id: 'youngtimer', naam: 'Youngtimer', synoniemen: ['oude auto', 'dagwaarde'], plaats: 'onderneming' }),
  regeling({
    id: 'verhuisd',
    naam: 'Verhuisd, gekocht of verkocht',
    synoniemen: ['verhuizen', 'eigenwoningreserve', 'overwaarde'],
    plaats: 'woning',
    kiezers: () => [{ elementId: 'situaties-woning', waar: 'Eigen woning' }],
  }),
]
const TEST_VELDEN: VeldregisterItem[] = [
  ...VELDREGISTER,
  { patroon: 'persoon:*/onderneming:*/herinvesteringsreserve:*/voornemen', label: 'Herinvesteringsreserve: voornemen', sectie: 'ondernemingen-{persoon}', sectieNaam: 'Ondernemingen', synoniemen: ['HIR'] },
]

describe('patronen', () => {
  it('matchPatroon: sterren op sleutels, de rest gelijk', () => {
    expect(matchPatroon('persoon:*/onderneming:*/winstberekening.saldo', 'persoon:A/onderneming:ond-1/winstberekening.saldo')).toEqual({ id: 'persoon:A/onderneming:ond-1/winstberekening.saldo', persoon: 'A', sleutels: ['A', 'ond-1'] })
    expect(matchPatroon('persoon:*/onderneming:*/naam', 'persoon:A/onderneming:ond-1/winstberekening.saldo')).toBeNull()
    expect(matchPatroon('pga/giftenGewoon', 'pga/giftenGewoon')).toMatchObject({ sleutels: [] })
    expect(matchPatroon('persoon:*/naam', 'persoon/naam')).toBeNull()
  })

  it('instanties: alleen wat in de invoer bestaat, met vaste id’s', () => {
    const i = voorbeeld()
    expect(instanties('persoon:*/onderneming:*/winstberekening.saldo', i).map((m) => m.id)).toEqual(['persoon:A/onderneming:ond-1/winstberekening.saldo', 'persoon:B/onderneming:ond-1/winstberekening.saldo'])
    expect(instanties('persoon:*/geboortedatum', i).map((m) => m.id)).toEqual(['persoon:A/geboortedatum', 'persoon:B/geboortedatum'])
    expect(instanties('verdeling/box3', i)).toHaveLength(1)
    expect(instanties('verdeling/box3', { ...i, fiscaalPartner: false })).toHaveLength(0)
    expect(instanties('eigenWoning/leningdeel:*/rente', { ...i, eigenWoning: undefined })).toEqual([])
    // Een lijst die het register niet kent, wordt op naam gezocht (meervoud): herinvesteringsreserves.
    const o = i.personen[0].ondernemingen[0]
    o.herinvesteringsreserves = [{ id: 'hir-2025-1' } as never]
    expect(instanties('persoon:*/onderneming:*/herinvesteringsreserve:*/voornemen', i).map((m) => m.id)).toEqual(['persoon:A/onderneming:ond-1/herinvesteringsreserve:hir-2025-1/voornemen'])
    expect(instanties('persoon:*/lijfrentehistorie:*/alGebruikt', i)[0].id).toMatch(/^persoon:A\/lijfrentehistorie:20\d\d\/alGebruikt$/)
  })

  it('vindVeld: label, plaats en sectie (met de persoon ingevuld)', () => {
    const i = voorbeeld()
    i.personen[0].ondernemingen[0].naam = 'Ontwerpstudio'
    expect(vindVeld('persoon:A/onderneming:ond-1/winstberekening.saldo', i, VELDREGISTER)).toEqual({
      label: 'Saldo fiscale winstberekening',
      waar: 'Ontwerpstudio, Persoon A',
      sectie: 'ondernemingen-A',
      sectieNaam: 'Ondernemingen',
    })
    expect(vindVeld('persoon:A/onbekend', i, VELDREGISTER)).toBeNull()
    expect(waarVanVeld('pga/giftenGewoon', i)).toBe('')
  })
})

describe('zoek', () => {
  it('normaliseert zonder accenten en met losse woorden', () => {
    expect(normaliseer('  Privé-onttrekking ')).toBe('prive onttrekking')
    const zonder = voorbeeld()
    delete zonder.personen[0].ondernemingen[0].jaarrekening
    expect(zoek('prive', TEST_VELDEN, [], zonder).some((r) => r.label === 'Privé-onttrekking')).toBe(false)
    const i = voorbeeld()
    i.personen[0].ondernemingen[0].jaarrekening = { onttrekkingen: [{ omschrijving: 'Opname', bedrag: 1000 }] }
    expect(zoek('prive', TEST_VELDEN, [], i).map((r) => r.label)).toContain('Privé-onttrekking')
  })

  it('synoniemen vinden de regelingen: HIR, stoppen, oude auto, verhuizen', () => {
    const i = voorbeeld()
    expect(zoek('HIR', TEST_VELDEN, TEST_REGELINGEN, i)[0]).toMatchObject({ soort: 'regeling', regeling: 'hir', actief: false, elementId: 'situaties-A-ond-1' })
    expect(zoek('stoppen', TEST_VELDEN, TEST_REGELINGEN, i)[0]).toMatchObject({ regeling: 'staking' })
    expect(zoek('oude auto', TEST_VELDEN, TEST_REGELINGEN, i)[0]).toMatchObject({ regeling: 'youngtimer' })
    expect(zoek('verhuizen', TEST_VELDEN, TEST_REGELINGEN, i)[0]).toMatchObject({ regeling: 'verhuisd', elementId: 'situaties-woning', waar: 'Eigen woning · nog niet toegevoegd' })
    expect(zoek('herinvesteringsreserve', TEST_VELDEN, TEST_REGELINGEN, i)[0]).toMatchObject({ regeling: 'hir', label: 'Herinvesteringsreserve' })
  })

  it('een actieve regeling springt naar het veld; geen dubbelen met het register', () => {
    const i = voorbeeld()
    i.personen[0].ondernemingen[0].herinvesteringsreserves = [{ id: 'hir-1' } as never]
    const actief = TEST_REGELINGEN.map((r) =>
      r.id === 'hir' ? { ...r, actiefBij: () => [{ veld: 'persoon:A/onderneming:ond-1/herinvesteringsreserve:hir-1/voornemen', waar: 'Meubelmakerij, Persoon A' }] } : r,
    )
    const uit = zoek('HIR', TEST_VELDEN, actief, i)
    expect(uit.filter((r) => 'veld' in r && r.veld === 'persoon:A/onderneming:ond-1/herinvesteringsreserve:hir-1/voornemen')).toHaveLength(1)
    expect(uit[0]).toMatchObject({ soort: 'regeling', actief: true })
  })

  it('velden met de persoon erbij bij twee personen; label boven synoniem', () => {
    const uit = zoek('geboortedatum', TEST_VELDEN, [], voorbeeld())
    expect(uit.slice(0, 2).map((r) => [r.label, r.waar])).toEqual([
      ['Geboortedatum', 'Persoon A'],
      ['Geboortedatum', 'Persoon B'],
    ])
    const saldo = zoek('winst', TEST_VELDEN, [], voorbeeld())
    expect(saldo[0]).toMatchObject({ soort: 'veld', veld: 'persoon:A/onderneming:ond-1/winstberekening.saldo', waar: expect.stringContaining('Persoon A') })
    expect(zoek('w', TEST_VELDEN, [], voorbeeld())).toEqual([])
    expect(zoek('xyzzy', TEST_VELDEN, TEST_REGELINGEN, voorbeeld())).toEqual([])
  })

  it('een regeling die hier niet kan (geen onderneming) staat niet in de resultaten, wel in de catalogus', () => {
    const i = voorbeeld()
    for (const p of i.personen) p.ondernemingen = []
    expect(zoek('HIR', [], TEST_REGELINGEN, i)).toEqual([])
    const c = catalogus(TEST_REGELINGEN, i)
    expect(c.map((g) => g.plaats)).toEqual(['Onderneming', 'Eigen woning'])
    expect(c[0].regelingen[0]).toMatchObject({ id: 'hir', doel: null })
    expect(c[1].regelingen[0].doel).toEqual({ soort: 'kiezer', elementId: 'situaties-woning', waar: 'Eigen woning' })
  })

  it('de echte registers: regelingen van A2, A5 en A6 zijn vindbaar op hun synoniemen', () => {
    const ids = REGELINGEN.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['verhuisd', 'box2-verlies', 'partner', 'bronbelasting', 'hir', 'staking', 'youngtimer']))
    const i = voorbeeld()
    expect(zoek('HIR', VELDREGISTER, REGELINGEN, i).some((r) => r.soort === 'regeling' && r.regeling === 'hir')).toBe(true)
    expect(zoek('verhuizen', VELDREGISTER, REGELINGEN, i).some((r) => r.soort === 'regeling' && r.regeling === 'verhuisd')).toBe(true)
    expect(zoek('xyzzy', VELDREGISTER, REGELINGEN, i)).toEqual([])
  })
})
