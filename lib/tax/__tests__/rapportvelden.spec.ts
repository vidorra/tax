/**
 * Uitkomstvelden voor het fiscaal rapport (additief in types.ts): ze geven de bedragen die het rapport toont, zonder
 * dat het rapport de rekenregels hoeft te herhalen. Op het verzonnen voorbeeldhuishouden (lib/voorbeeld); dezelfde
 * velden tegen de echte aangiftes staan in prive/rapportvelden.spec.ts (alleen lokaal).
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '../engine'
import { getJaar } from '../years'
import { berekenInvesteringsaftrek } from '../modules/onderneming'
import { voorbeeldInvoer } from '@/lib/voorbeeld'

const r24 = berekenHuishouden(voorbeeldInvoer(2024), { zonderMarginaleDruk: true })
const r21 = berekenHuishouden(voorbeeldInvoer(2021), { zonderMarginaleDruk: true })
const [a24, b24] = r24.personen
const [a21, b21] = r21.personen

describe('box 1: premie-inkomen, premie per volksverzekering en tariefmaatregel', () => {
  it('2024', () => {
    // A zit boven het maximum premie-inkomen, B eronder: de premie per volksverzekering telt op tot de premie.
    expect(a24.box1.premieInkomen).toBe(getJaar(2024).box1.waarde.schijven[0].tot)
    expect(b24.box1.premieInkomen).toBe(34469)
    expect(b24.box1.premieRegels?.map((x) => x.bedrag)).toEqual([6169, 34, 3326])
    expect(b24.box1.premie).toBe(9530)
    expect(a24.box1.premieRegels?.reduce((s, x) => s + x.bedrag, 0)).toBeLessThanOrEqual(a24.box1.premie)
    expect(a24.box1.tariefmaatregelGrondslag).toBe(29811)
    expect(a24.box1.tariefmaatregelPct).toBeCloseTo(0.1253, 10)
    expect(b24.box1.tariefmaatregelGrondslag).toBe(0)
  })
  it('2021', () => {
    expect(b21.box1.premieInkomen).toBe(19786)
    expect(b21.box1.premieRegels?.map((x) => x.bedrag)).toEqual([3541, 19, 1909])
    expect(a21.box1.tariefmaatregelGrondslag).toBe(19593)
    expect(a21.box1.tariefmaatregelPct).toBeCloseTo(0.065, 10)
  })
})

describe('box 3: potten, rendementsregels en verrekening per persoon', () => {
  it('2024: één pot voor de partners met begin en eind', () => {
    const pot = r24.box3.potten?.[0]
    expect(r24.box3.potten).toHaveLength(1)
    expect(pot?.personen).toEqual(['A', 'B'])
    expect(pot?.begin).toMatchObject({ bezittingen: 137650, aftrekbareSchulden: 16600, rendementsgrondslag: 121050, schuldendrempel: 7400 })
    expect(pot?.eind).toMatchObject({ bezittingen: 143480, aftrekbareSchulden: 8850, rendementsgrondslag: 134630 })
    expect(pot?.heffingsvrijVermogen).toBe(114000)
    expect(pot?.grondslagPerPersoon).toEqual({ A: 7050, B: 0 })
    // Bank in Nederland en in het buitenland, beleggingen, crypto, schulden en de schuldendrempel (7.400 x 2,61%).
    expect(pot?.rendementRegels.map((x) => x.bedrag)).toEqual([732, 141, 4517, 129, -627, Math.floor(7400 * 0.0261)])
    expect(r24.box3.rendementRegels?.length).toBe(6)
    expect(a24.box3BelastingVoorVerrekening).toBe(106)
    expect(a24.box3Bronbelasting).toBe(63)
    expect(a24.drempelinkomenBox3).toBe(296)
  })
  it('2021: geen eindstand (niet ingevuld)', () => {
    expect(r21.box3.potten?.[0].eind).toBeUndefined()
    expect(r21.box3.potten?.[0].dividendbelasting).toBe(21)
  })
  it('zonder fiscaal partner: een pot per persoon', () => {
    const invoer = voorbeeldInvoer(2024)
    invoer.fiscaalPartner = false
    invoer.box3.posities[0].eigenaar = 'B'
    const r = berekenHuishouden(invoer, { zonderMarginaleDruk: true })
    expect(r.box3.potten?.map((p) => p.personen)).toEqual([['A'], ['B']])
    expect(r.box3.potten?.[1].positieIds).toEqual(['bank-nl', 'spaar-b', 'crypto'])
    expect(r.box3.potten?.[1].heffingsvrijVermogen).toBe(57000)
  })
  it('zonder fiscaal partner: dividendbelasting bij de eigenaar van de rekening', () => {
    const invoer = voorbeeldInvoer(2024)
    invoer.fiscaalPartner = false
    const beleggingen = invoer.box3.posities.find((x) => x.id === 'beleggingen')!
    beleggingen.eigenaar = 'B'
    const r = berekenHuishouden(invoer, { zonderMarginaleDruk: true })
    expect(r.box3.potten?.map((p) => p.dividendbelasting)).toEqual([0, 38])
    expect(r.personen.map((p) => p.voorheffingenDetail?.dividendbelastingBox3)).toEqual([0, 38])
    expect(r.personen[1].voorheffingen).toBe(38)
    // Rekening van A: bij A, ook als de verdeling in de invoer iets anders zegt (die geldt alleen voor partners).
    beleggingen.eigenaar = 'A'
    invoer.verdeling = { eigenWoning: 1, pga: 1, box3: 0, box2: 1, dividendbelasting: 0 }
    const r2 = berekenHuishouden(invoer, { zonderMarginaleDruk: true })
    expect(r2.personen.map((p) => p.voorheffingenDetail?.dividendbelastingBox3)).toEqual([38, 0])
  })
  it('partners: de grondslag in hele euro\'s per persoon en het rendementspercentage van de pot', () => {
    expect(r24.box3.potten?.[0].grondslagDeel).toEqual({ A: 7050, B: 0 })
    expect(r24.box3.potten?.[0].effectiefPct).toBeCloseTo(0.042, 10)
    expect(r24.box3.potten?.[0].gekozen).toBe('forfaitair')
  })
})

describe('persoonsgebonden aftrek, voorheffingen, drempelinkomen', () => {
  it('2021: aftrek van het huishouden en toerekening', () => {
    expect(r21.pga).toEqual({ giften: 0, zorgkosten: 0, scholing: 2390, alimentatie: 0, totaal: 2390 })
    expect(a21.pgaToerekening).toMatchObject({ toegerekend: 2390, box1: 2390, restant: 0 })
    expect(b21.pgaToerekening).toEqual({ toegerekend: 0, restantVorigJaar: 0, box1: 0, box3: 0, box2: 0, restant: 0 })
    expect(a21.voorheffingenDetail).toEqual({ loonheffing: 0, dividendbelastingBox3: 21, dividendbelastingBox2: 0 })
    expect(a21.drempelinkomenBox1).toBe(61489)
  })
})

describe('Zvw, eigen woning, heffingskortingen', () => {
  it('inkomen voor het maximum en onderdelen van de eigen woning', () => {
    expect(a24.zvw.inkomenVoorMaximum).toBe(127935)
    expect(a24.zvw.loonMetIngehoudenBijdrage).toBe(0)
    expect(r24.eigenWoning).toMatchObject({ rente: 7860, financieringskosten: 0, erfpacht: 0 })
  })
  it('splitsing per korting telt op tot de korting', () => {
    const ahk = b21.heffingskortingen.delen?.find((d) => d.soort === 'algemeen')
    expect(ahk?.totaal).toBe(b21.heffingskortingen.algemeen)
    expect((ahk?.belastingdeel ?? 0) + (ahk?.premiedeel ?? 0)).toBe(ahk?.totaal)
    expect(ahk?.belastingdeel).toBeLessThan(ahk?.premiedeel ?? 0)
  })
})

describe('inkomensvoorziening: jaarruimteberekening per jaar', () => {
  it('2024: alle jaren uit de tabel, met de regels van dat jaar', () => {
    const j = a24.inkomensvoorziening.jaarruimteBerekeningen ?? []
    expect(j.map((x) => x.jaar)).toEqual(a24.inkomensvoorziening.tabel.map((x) => x.jaar))
    expect(j[0]).toMatchObject({ jaar: 2024, inkomen: 149800, jaarruimte: 36077, alGebruikt: 0 })
    expect(j[0].berekening).toMatchObject({ franchise: 17545, premiegrondslag: 120255, verrekenbaar: 36077, afgetopt: true })
    const j2023 = j.find((x) => x.jaar === 2023)
    expect(j2023).toMatchObject({ forToename: 2740, jaarruimte: 31810 })
    expect(j2023?.berekening).toMatchObject({ franchise: 13646, premiegrondslag: 115164, verrekenbaar: 34550, jaarruimte: 31810 })
    expect(j.find((x) => x.jaar === 2022)?.berekening).toMatchObject({ afgetopt: true, inkomensgrens: 114866, premiegrondslag: 102029, verrekenbaar: 13570 })
    expect(j.find((x) => x.jaar === 2021)?.berekening?.afgetopt).toBe(false)
  })
})

describe('onderneming: investeringsaftrek per middel, oudedagsreserve, afschrijvingen', () => {
  it('2024: KIA per middel naar rato van het bedrag', () => {
    const o = a24.ondernemingen[0]
    expect(o.investeringsaftrekPerMiddel?.map((m) => m.aftrek)).toEqual([826, 414])
    expect(o.investeringsaftrekPerMiddel?.reduce((s, m) => s + m.aftrek, 0)).toBe(o.kia)
    expect(o.forStandBegin).toBe(9640)
    expect(o.forStandEind).toBe(9640)
    expect(o.forDotatie).toBe(0)
  })
  it('KIA boven de percentagezone: naar rato, de som is de KIA van de onderneming', () => {
    const params = getJaar(2024)
    const inv = berekenInvesteringsaftrek(
      [
        { omschrijving: 'Machine', datum: '2024-03-01', bedrag: 50000, regeling: 'kia' },
        { omschrijving: 'Bus', datum: '2024-04-01', bedrag: 25001, regeling: 'kia' },
        { omschrijving: 'Laptop', datum: '2024-05-01', bedrag: 1999, regeling: 'kia' },
      ],
      { params },
    )
    expect(inv.perMiddel.reduce((s, m) => s + m.aftrek, 0)).toBe(inv.kia)
    expect(inv.perMiddel[0].aftrek).toBeGreaterThan(inv.perMiddel[1].aftrek)
  })
  it('afschrijvingen per actief bij een activaregister', () => {
    const invoer = voorbeeldInvoer(2024)
    const o = invoer.personen[0].ondernemingen[0]
    o.winstberekening = { soort: 'uitgesplitst', omzet: 200000, kosten: 30000 }
    o.activa = [{ omschrijving: 'Laptop', aanschafdatum: '2023-01-15', aanschafwaarde: 3000, restwaarde: 0, levensduurJaren: 3, methode: 'lineair' }]
    const r = berekenHuishouden(invoer, { zonderMarginaleDruk: true })
    const a = r.personen[0].ondernemingen[0].afschrijvingen?.[0]
    expect(a).toMatchObject({ omschrijving: 'Laptop', aanschafwaarde: 3000, restwaarde: 0 })
    expect((a?.boekwaardeBegin ?? 0) - (a?.afschrijving ?? 0)).toBe(a?.boekwaardeEind)
  })
})
