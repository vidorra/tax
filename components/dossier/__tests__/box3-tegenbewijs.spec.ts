import { describe, expect, it } from 'vitest'
import { leegInvoer, leegPersoon, valideerInvoer } from '@/lib/dossier'
import { berekenHuishouden } from '@/lib/tax/engine'
import type { HuishoudenInvoer, VermogensPositie } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { tegenbewijsStand, volgEigenGebruik, zetEigenGebruik } from '../secties/box3Tegenbewijs'

/** Fiscale partners met loon en één box 3-positie, zoals in de gap-analyse (200.000 aan beleggingen). */
function huishouden(jaar: number, pos: Partial<VermogensPositie>, extra: Partial<HuishoudenInvoer['box3']> = {}): HuishoudenInvoer {
  const i = leegInvoer(jaar)
  i.personen = (['A', 'B'] as const).map((id) => ({ ...leegPersoon(id, jaar), loon: [{ omschrijving: 'Werkgever', soort: 'loon' as const, bruto: 50000, ingehoudenLoonheffing: 15000 }] }))
  i.fiscaalPartner = true
  i.box3 = { posities: [{ id: 'etf', omschrijving: 'Beleggingsrekening', categorie: 'beleggingen', eigenaar: 'A', waardeBegin: 200000, ...pos }], schulden: [], ...extra }
  return i
}

const signaal = (i: HuishoudenInvoer) => berekenHuishouden(i).box3.waarschuwingen.some((w) => w.id.endsWith('box3-tegenbewijs-loont'))

describe('tegenbewijs in het dossier: met en zonder stortingen en opnames', () => {
  it('zonder storting telt de storting als rendement en blijft het signaal weg', () => {
    const zonder = huishouden(2025, { waardeEind: 220000 })
    const met = huishouden(2025, { waardeEind: 220000, stortingen: 20000 })
    expect(valideerInvoer(met)).toEqual([])

    expect(berekenHuishouden(zonder).box3.werkelijkRendement).toBe(20000)
    expect(signaal(zonder)).toBe(false)
    expect(tegenbewijsStand(zonder).loont).toBe(false)

    expect(berekenHuishouden(met).box3.werkelijkRendement).toBe(0)
    expect(signaal(met)).toBe(true)
    expect(tegenbewijsStand(met).loont).toBe(true)
  })

  it('een stijging zonder storting: de engine meldt het, de sectie klapt open en wijst de bezitting aan (bevinding 19)', () => {
    // r10-stijging-ingebruik.ts, geval a: ETF van 200.000 naar 220.000, storting leeg.
    const zonder = tegenbewijsStand(huishouden(2025, { waardeEind: 220000 }))
    expect(zonder.storting).toBe(true)
    expect(zonder.stijgingZonderStorting.map((p) => p.id)).toEqual(['etf'])
    // Met 0 bevestigt de gebruiker dat er niets bij kwam: geen melding meer.
    const nul = tegenbewijsStand(huishouden(2025, { waardeEind: 220000, stortingen: 0 }))
    expect(nul.storting).toBe(false)
    expect(nul.stijgingZonderStorting).toEqual([])
    // Een daling of een gelijke waarde geeft deze melding niet.
    expect(tegenbewijsStand(huishouden(2025, { waardeEind: 200000 })).storting).toBe(false)
  })

  it('met de storting en tegenbewijs aan daalt de box 3-belasting tot nul', () => {
    const forfait = berekenHuishouden(huishouden(2025, { waardeEind: 220000 }))
    const aan = huishouden(2025, { waardeEind: 220000, stortingen: 20000 }, { tegenbewijs: true })
    const r = berekenHuishouden(aan)
    const box3 = (x: typeof r) => x.personen.reduce((s, p) => s + p.box3Belasting, 0)
    expect(box3(forfait)).toBeGreaterThan(0)
    expect(r.box3.gekozen).toBe('werkelijk')
    expect(box3(r)).toBe(0)
    expect(r.totaal.teBetalenIB).toBeLessThan(forfait.totaal.teBetalenIB)
    expect(tegenbewijsStand(aan)).toMatchObject({ mogelijk: true, toegepast: true, loont: false, heeftGegevens: true })
  })

  it('zonder opname geeft een daling geen signaal dat tegenbewijs loont, maar onvolledig; de sectie wijst de bezitting aan', () => {
    const zonder = huishouden(2025, { waardeEind: 190000 })
    expect(berekenHuishouden(zonder).box3.werkelijkRendement).toBe(0)
    expect(signaal(zonder)).toBe(false)
    expect(berekenHuishouden(zonder).box3.waarschuwingen.find((w) => w.id.endsWith('box3-tegenbewijs-onvolledig'))?.tekst).toContain('Beleggingsrekening')
    const stand = tegenbewijsStand(zonder)
    expect(stand).toMatchObject({ loont: false, onvolledig: true })
    expect(stand.dalingZonderOpname.map((x) => x.id)).toEqual(['etf'])

    const met = huishouden(2025, { waardeEind: 190000, onttrekkingen: 30000 })
    expect(berekenHuishouden(met).box3.werkelijkRendement).toBe(20000)
    expect(signaal(met)).toBe(false)
    expect(tegenbewijsStand(met)).toMatchObject({ loont: false, onvolledig: false, dalingZonderOpname: [] })
  })

  it('een opname van 0 bevestigt een echte waardedaling: het signaal blijft, de controle vervalt', () => {
    const echt = huishouden(2025, { waardeEind: 190000, onttrekkingen: 0 })
    expect(signaal(echt)).toBe(true)
    expect(tegenbewijsStand(echt)).toMatchObject({ loont: true, onvolledig: false, dalingZonderOpname: [] })
  })

  it('bijgeschreven rente telt één keer als die ook bij gestort staat', () => {
    const bank = (pos: Partial<VermogensPositie>) => huishouden(2025, { categorie: 'bankNL', waardeBegin: 100000, waardeEind: 102000, ...pos }, { tegenbewijs: true })
    expect(berekenHuishouden(bank({})).box3.werkelijkRendement).toBe(2000)
    expect(berekenHuishouden(bank({ directeOpbrengsten: 2000, stortingen: 2000 })).box3.werkelijkRendement).toBe(2000)
    // Alleen als opbrengst ingevuld, zonder storting, telt de engine de rente dubbel.
    expect(berekenHuishouden(bank({ directeOpbrengsten: 2000 })).box3.werkelijkRendement).toBe(4000)
  })

  it('vindt het signaal ook in de eigen pot van een niet-partner', () => {
    const i = huishouden(2025, { waardeEind: 220000, stortingen: 20000, eigenaar: 'B' })
    i.fiscaalPartner = false
    expect(tegenbewijsStand(i).loont).toBe(true)
  })
})

describe('tegenbewijsStand per stelsel', () => {
  it('rekent tegenbewijs alleen door in het forfaitaire stelsel', () => {
    const p2022 = getJaar(2022)
    expect(tegenbewijsStand(huishouden(2022, { waardeEind: 190000 }), p2022)).toMatchObject({ mogelijk: false, loont: false })
    expect(tegenbewijsStand(huishouden(2026, { waardeEind: 190000 }))).toMatchObject({ mogelijk: true, altijdWerkelijk: false })
  })

  it('kent het stelsel waarin altijd het werkelijk rendement telt', () => {
    const p = getJaar(2026)
    p.box3.waarde.regime = 'werkelijkRendement'
    p.box3.waarde.tegenbewijs = { ...p.box3.waarde.tegenbewijs, beschikbaar: false, kanaal: 'geen' }
    expect(tegenbewijsStand(huishouden(2026, { waardeEind: 190000 }), p)).toMatchObject({ mogelijk: false, altijdWerkelijk: true })
  })

  it('ziet betaalde rente op een schuld als ingevulde gegevens', () => {
    const i = huishouden(2026, { waardeEind: 200000 }, { schulden: [{ id: 's', omschrijving: 'Lening', eigenaar: 'A', waardeBegin: 10000, betaaldeRente: 300 }] })
    expect(tegenbewijsStand(i).heeftGegevens).toBe(true)
    expect(tegenbewijsStand(huishouden(2026, { waardeEind: 200000 })).heeftGegevens).toBe(false)
  })
})

describe('eigen gebruik van vastgoed', () => {
  const vastgoed = (pos: Partial<VermogensPositie> = {}): VermogensPositie => ({ id: 'huis', omschrijving: 'Vakantiehuis', categorie: 'onroerend', eigenaar: 'A', waardeBegin: 300000, waardeEind: 300000, ...pos })

  it('zet woz gelijk aan de waarden van de positie en telt het eigen gebruik mee', () => {
    const x = vastgoed()
    zetEigenGebruik(x, 73)
    expect(x.woz).toEqual({ begin: 300000, eind: 300000, dagenEigenGebruik: 73 })
    const p = getJaar(2026)
    const i = huishouden(2026, {}, { posities: [x], tegenbewijs: true })
    // 5,06% (params 2026) van 300.000 voor 73 van de 365 dagen.
    expect(berekenHuishouden(i).box3.werkelijkRendement).toBe(Math.round((p.box3.waarde.tegenbewijs.eigenGebruikPct * 300000 * 73) / 365))
  })

  it('volgt een gewijzigde waarde en haalt woz weg zonder dagen, zonder eindwaarde of buiten vastgoed', () => {
    const x = vastgoed()
    zetEigenGebruik(x, 30)
    x.waardeEind = 310000
    volgEigenGebruik(x)
    expect(x.woz).toEqual({ begin: 300000, eind: 310000, dagenEigenGebruik: 30 })

    zetEigenGebruik(x, 400)
    expect(x.woz?.dagenEigenGebruik).toBe(366)

    zetEigenGebruik(x, undefined)
    expect(x.woz).toBeUndefined()

    zetEigenGebruik(x, 30)
    x.waardeEind = undefined
    volgEigenGebruik(x)
    expect(x.woz).toBeUndefined()

    const y = vastgoed()
    zetEigenGebruik(y, 30)
    y.categorie = 'overig'
    volgEigenGebruik(y)
    expect(y.woz).toBeUndefined()
  })

  it('ruimt woz zonder dagen op (zoals nieuw jaar die nu achterlaat)', () => {
    const x = vastgoed({ waardeEind: undefined, woz: { begin: 300000, eind: 300000 } })
    volgEigenGebruik(x)
    expect(x.woz).toBeUndefined()
  })
})
