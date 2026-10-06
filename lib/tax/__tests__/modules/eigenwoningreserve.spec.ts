import { describe, expect, it } from 'vitest'
import type { EigenWoningInvoer, LeningdeelInvoer } from '../../types'
import { getJaar } from '../../years'
import { berekenEigenWoning } from '../../modules/eigen-woning'

const ctx = (jaar: number) => ({ params: getJaar(jaar), jaar })
const reken = (ew: EigenWoningInvoer, jaar = 2026) => berekenEigenWoning(ew, ctx(jaar))

const vorigeWoning = { leverdatum: '2026-03-01', verkoopprijs: 400000, verkoopkosten: 8000, eigenwoningschuld: 250000, aandeelA: 0.5 }
const lening = (extra: Partial<LeningdeelInvoer> = {}): LeningdeelInvoer => ({
  id: 'ld-1',
  omschrijving: 'Hypotheek nieuwe woning',
  hoofdsom: 450000,
  startdatum: '2026-06-01',
  aflossingsvorm: 'annuitair',
  rente: 9000,
  ...extra,
})

describe('eigenwoningreserve en bijleenregeling', () => {
  it('de termijn komt uit de params: 3 jaar', () => {
    expect(getJaar(2026).eigenWoning.waarde.reserveTermijnJaren).toBe(3)
  })

  it('EW1: verkoop 1-3-2026, saldo 142.000 50/50; vervalt op 1-3-2029', () => {
    const r = reken({ woz: 0, vorigeWoning })
    expect(r.vervreemdingssaldo).toBe(142000)
    expect(r.eigenwoningreserve).toEqual([
      { eigenaar: 'A', datumToevoeging: '2026-03-01', bedrag: 71000, vervaltOp: '2029-03-01' },
      { eigenaar: 'B', datumToevoeging: '2026-03-01', bedrag: 71000, vervaltOp: '2029-03-01' },
    ])
  })

  it('EW2: daarna nieuwe woning 1-6-2026, verwerving 500.000, lening 450.000: max 358.000, box 3 92.000, reserve 0', () => {
    const r = reken({ woz: 485000, vorigeWoning, aankoop: { leverdatum: '2026-06-01', koopsom: 485000, kostenKoper: 15000, aandeelA: 0.5 }, leningdelen: [lening()] })
    expect(r.maxEigenwoningschuld).toBe(358000)
    expect(r.bijleenregeling).toMatchObject({ reserveVoor: 142000, leningen: 450000, eigenwoningschuld: 358000, ander: 92000, reserveGebruikt: 142000 })
    expect(r.eigenwoningreserve).toEqual([])
    expect(r.leningsplitsing).toEqual([
      { id: 'ld-1', omschrijving: 'Hypotheek nieuwe woning', eigenwoningBegin: 0, anderBegin: 0, eigenwoningEind: 358000, anderEind: 92000, renteEigenWoning: 7160, renteAnder: 1840, reden: 'bijleenregeling' },
    ])
    expect(r.rente).toBe(7160)
    expect(r.nietKwalificerendeSchuld).toBe(92000)
    expect(r.waarschuwingen.find((w) => w.id === 'ew-box3-schuld')?.tekst).toContain('vanaf 1 januari 2027')
  })

  it('EW2b: het jaar erna met de splitsing van de doorrol: rente naar rato begin / standBegin (20.000 geeft 15.911)', () => {
    const r = reken({ woz: 485000, leningdelen: [lening({ standBegin: 446000, standEind: 440000, rente: 20000, eigenwoningschuld: { begin: 354818, reden: 'bijleenregeling' } })] }, 2027)
    expect(r.rente).toBe(15911)
    expect(r.leningsplitsing?.[0]).toMatchObject({ eigenwoningBegin: 354818, anderBegin: 91182, renteEigenWoning: 15911, renteAnder: 4089, reden: 'bijleenregeling' })
    expect(r.leningsplitsing?.[0].eigenwoningEind).toBe(Math.round((440000 * 354818) / 446000))
    // Het andere deel staat al als box 3-schuld (doorrol): geen nieuwe melding en geen tweede bijleenregeling.
    expect(r.waarschuwingen.map((w) => w.id)).not.toContain('ew-box3-schuld')
    expect(r.bijleenregeling).toBeUndefined()
  })

  it('EW3: nieuwe woning 300.000, lening 200.000, reserve 142.000: max 158.000, box 3 42.000, reserve 0', () => {
    const r = reken({ woz: 300000, eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2025-03-01', bedrag: 142000 }], aankoop: { leverdatum: '2026-05-01', koopsom: 300000, kostenKoper: 0, aandeelA: 1 }, leningdelen: [lening({ hoofdsom: 200000, startdatum: '2026-05-01' })] })
    expect(r.maxEigenwoningschuld).toBe(158000)
    expect(r.bijleenregeling?.ander).toBe(42000)
    expect(r.eigenwoningreserve).toEqual([])
  })

  it('EW3b: lening 100.000: alles eigenwoningschuld, reserve 0', () => {
    const r = reken({ woz: 300000, eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2025-03-01', bedrag: 142000 }], aankoop: { leverdatum: '2026-05-01', koopsom: 300000, kostenKoper: 0, aandeelA: 1 }, leningdelen: [lening({ hoofdsom: 100000, startdatum: '2026-05-01' })] })
    expect(r.bijleenregeling).toMatchObject({ eigenwoningschuld: 100000, ander: 0 })
    expect(r.eigenwoningreserve).toEqual([])
  })

  it('EW4: reserve 50.000, verbouwing 30.000 met een lening van 30.000: reserve 20.000, de lening in box 3', () => {
    const r = reken(
      { woz: 300000, eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2026-03-01', bedrag: 50000 }], verbeteringen: [{ datum: '2027-04-01', kosten: 30000 }], leningdelen: [lening({ hoofdsom: 30000, startdatum: '2027-04-01', rente: 600 })] },
      2027,
    )
    expect(r.bijleenregeling).toMatchObject({ soort: 'verbetering', reserveVoor: 50000, maxEigenwoningschuld: 0, ander: 30000 })
    expect(r.eigenwoningreserve).toEqual([{ eigenaar: 'A', datumToevoeging: '2026-03-01', bedrag: 20000, vervaltOp: '2029-03-01' }])
    expect(r.rente).toBe(0)
  })

  it('EW5: reserve uit 2026, geen nieuwe woning vóór 1-3-2029: in 2029 vervallen', () => {
    const r = reken({ woz: 0, eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2026-03-01', bedrag: 71000 }, { eigenaar: 'B', datumToevoeging: '2026-03-01', bedrag: 71000 }] }, 2028)
    expect(r.eigenwoningreserve?.map((t) => t.vervaltOp)).toEqual(['2029-03-01', '2029-03-01'])
    const later = reken({ woz: 0, eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2026-03-01', bedrag: 71000 }] }, 2028)
    expect(later.reserveVervallen).toBeUndefined()
  })

  it('EW6: nieuwe aflossingsvrije lening in 2026: 100.000 box 3-schuld', () => {
    const r = reken({ woz: 400000, leningdelen: [lening({ hoofdsom: 100000, startdatum: '2026-02-01', aflossingsvorm: 'aflossingsvrij', rente: 3000 })] })
    expect(r.nietKwalificerendeSchuld).toBe(100000)
    expect(r.leningsplitsing?.[0]).toMatchObject({ eigenwoningEind: 0, anderEind: 100000, reden: 'aflossingseis' })
    expect(r.rente).toBe(0)
  })

  it('EW7: eerst gekocht (1-3), later verkocht (1-6): geen box 3-schuld door de reserve; reserve blijft tot 1-6-2029', () => {
    const r = reken({
      woz: 500000,
      vorigeWoning: { ...vorigeWoning, leverdatum: '2026-06-01' },
      aankoop: { leverdatum: '2026-03-01', koopsom: 490000, kostenKoper: 10000, aandeelA: 0.5 },
      leningdelen: [lening({ startdatum: '2026-03-01' })],
    })
    expect(r.bijleenregeling).toMatchObject({ reserveVoor: 0, ander: 0, reserveNaAankoop: 142000 })
    expect(r.eigenwoningreserve?.reduce((s, t) => s + t.bedrag, 0)).toBe(142000)
    expect(r.eigenwoningreserve?.[0].vervaltOp).toBe('2029-06-01')
  })

  it('EW8: partners samen (lid 10): reserve A 100.000, B 0, gezamenlijke lening 450.000: max 400.000, box 3 50.000', () => {
    const r = reken({
      woz: 500000,
      eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2025-09-01', bedrag: 100000 }],
      aankoop: { leverdatum: '2026-04-01', koopsom: 500000, kostenKoper: 0, aandeelA: 0.5 },
      leningdelen: [lening({ startdatum: '2026-04-01' })],
    })
    expect(r.maxEigenwoningschuld).toBe(400000)
    expect(r.bijleenregeling?.ander).toBe(50000)
  })

  it('financieringskosten tellen mee in het maximum zonder vermindering met de reserve', () => {
    const r = reken({ woz: 300000, financieringskosten: 3000, eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2025-03-01', bedrag: 142000 }], aankoop: { leverdatum: '2026-05-01', koopsom: 300000, kostenKoper: 0, aandeelA: 1 }, leningdelen: [lening({ hoofdsom: 200000, startdatum: '2026-05-01' })] })
    expect(r.maxEigenwoningschuld).toBe(161000)
  })
})

describe('review ronde 2: verkoop en aankoop op dezelfde dag, verbouwing in het aankoopjaar (art. 3.119a lid 2 en 3)', () => {
  const aankoopEW2 = { leverdatum: '2026-06-01', koopsom: 485000, kostenKoper: 15000, aandeelA: 0.5 }

  it('bevinding 1: verkoop en aankoop allebei op 1-6-2026: eerst de verkoop, dus de reserve telt (zoals EW2)', () => {
    const zelfdeDag = reken({ woz: 485000, vorigeWoning: { ...vorigeWoning, leverdatum: '2026-06-01' }, aankoop: aankoopEW2, leningdelen: [lening()] })
    expect(zelfdeDag.bijleenregeling).toMatchObject({ reserveVoor: 142000, maxEigenwoningschuld: 358000, eigenwoningschuld: 358000, ander: 92000, reserveGebruikt: 142000, reserveNaAankoop: 0 })
    expect(zelfdeDag.rente).toBe(7160)
    expect(zelfdeDag.nietKwalificerendeSchuld).toBe(92000)
    expect(zelfdeDag.eigenwoningreserve).toEqual([])
    const melding = zelfdeDag.waarschuwingen.find((w) => w.id === 'ew-zelfde-dag')
    expect(melding?.ernst).toBe('info')
    expect(melding?.tekst).toContain('eerst de verkoop')
    // Een dag eerder verkocht: dezelfde uitkomst, zonder de melding.
    const dagEerder = reken({ woz: 485000, vorigeWoning: { ...vorigeWoning, leverdatum: '2026-05-31' }, aankoop: aankoopEW2, leningdelen: [lening()] })
    expect(dagEerder.bijleenregeling).toMatchObject({ reserveVoor: 142000, maxEigenwoningschuld: 358000, ander: 92000 })
    expect(dagEerder.waarschuwingen.map((w) => w.id)).not.toContain('ew-zelfde-dag')
  })

  it('bevinding 1: een vervallen toevoeging wordt niet gebruikt; de reserve gaat uit de toevoeging die nog geldt', () => {
    const r = reken({
      woz: 300000,
      eigenwoningreserve: [
        { eigenaar: 'A', datumToevoeging: '2023-03-01', bedrag: 50000 },
        { eigenaar: 'A', datumToevoeging: '2025-03-01', bedrag: 40000 },
      ],
      aankoop: { leverdatum: '2026-06-01', koopsom: 300000, kostenKoper: 0, aandeelA: 1 },
      leningdelen: [lening({ hoofdsom: 280000 })],
    })
    expect(r.bijleenregeling).toMatchObject({ reserveVoor: 40000, maxEigenwoningschuld: 260000, ander: 20000, reserveGebruikt: 40000 })
    expect(r.eigenwoningreserve).toEqual([])
    expect(r.reserveVervallen).toEqual([{ eigenaar: 'A', datumToevoeging: '2023-03-01', bedrag: 50000, vervaltOp: '2026-03-01' }])
  })

  it('bevinding 2: aankoop 1-3 (310.000) en verbouwing 1-5 (20.000) met één lening van 330.000, zonder reserve: alles eigenwoningschuld', () => {
    const r = reken({
      woz: 350000,
      aankoop: { leverdatum: '2026-03-01', koopsom: 300000, kostenKoper: 10000, aandeelA: 0.5 },
      verbeteringen: [{ datum: '2026-05-01', kosten: 20000 }],
      leningdelen: [lening({ hoofdsom: 330000, startdatum: '2026-03-01' })],
    })
    expect(r.bijleenregeling).toMatchObject({ soort: 'aankoop', kosten: 330000, kostenVerbetering: 20000, reserveVoor: 0, maxEigenwoningschuld: 330000, eigenwoningschuld: 330000, ander: 0 })
    expect(r.rente).toBe(9000)
    expect(r.nietKwalificerendeSchuld).toBe(0)
    expect(r.waarschuwingen.map((w) => w.id)).not.toContain('ew-box3-schuld')
    expect(r.uitleg.find((x) => x.id === 'ew-max-schuld')?.formule).toBe('verwervingskosten 310.000 + kosten verbetering 20.000 − eigenwoningreserve 0')
  })

  it('bevinding 2: met een reserve van 50.000: maximum 310.000 + 20.000 − 50.000 = 280.000, box 3 50.000, reserve op', () => {
    const r = reken({
      woz: 350000,
      eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2025-03-01', bedrag: 50000 }],
      aankoop: { leverdatum: '2026-03-01', koopsom: 300000, kostenKoper: 10000, aandeelA: 0.5 },
      verbeteringen: [{ datum: '2026-05-01', kosten: 20000 }],
      leningdelen: [lening({ hoofdsom: 330000, startdatum: '2026-03-01' })],
    })
    expect(r.bijleenregeling).toMatchObject({ reserveVoor: 50000, maxEigenwoningschuld: 280000, eigenwoningschuld: 280000, ander: 50000, reserveGebruikt: 50000 })
    expect(r.rente).toBe(7636) // 9.000 × 280.000 / 330.000
    expect(r.eigenwoningreserve).toEqual([])
  })

  it('bevinding 2: reserve groter dan de koopsom: de rest gaat af van de verbouwing (330.000 − 320.000 = 10.000)', () => {
    const r = reken({
      woz: 350000,
      eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2025-03-01', bedrag: 320000 }],
      aankoop: { leverdatum: '2026-03-01', koopsom: 300000, kostenKoper: 10000, aandeelA: 1 },
      verbeteringen: [{ datum: '2026-05-01', kosten: 20000 }],
      leningdelen: [lening({ hoofdsom: 15000, startdatum: '2026-03-01', rente: 300 })],
    })
    expect(r.bijleenregeling).toMatchObject({ maxEigenwoningschuld: 10000, eigenwoningschuld: 10000, ander: 5000, reserveGebruikt: 320000 })
    expect(r.eigenwoningreserve).toEqual([])
  })

  it('bevinding 2: een verbouwing vóór de leverdatum hoort bij de vorige woning en telt niet mee', () => {
    const r = reken({
      woz: 350000,
      aankoop: { leverdatum: '2026-03-01', koopsom: 300000, kostenKoper: 10000, aandeelA: 0.5 },
      verbeteringen: [{ datum: '2026-02-01', kosten: 15000 }],
      leningdelen: [lening({ hoofdsom: 320000, startdatum: '2026-03-01' })],
    })
    expect(r.bijleenregeling).toMatchObject({ kosten: 310000, maxEigenwoningschuld: 310000, ander: 10000 })
    expect(r.bijleenregeling?.kostenVerbetering).toBeUndefined()
    expect(r.waarschuwingen.find((w) => w.id === 'ew-verbetering-voor-aankoop')?.tekst).toContain('1 februari 2026')
  })

  it('eerst gekocht (1-3), dan verkocht (1-6), dan verbouwd (1-9) met een eigen lening: die lening valt onder de nieuwe reserve', () => {
    const r = reken({
      woz: 500000,
      vorigeWoning: { ...vorigeWoning, leverdatum: '2026-06-01' },
      aankoop: { leverdatum: '2026-03-01', koopsom: 490000, kostenKoper: 10000, aandeelA: 0.5 },
      verbeteringen: [{ datum: '2026-09-01', kosten: 20000 }],
      leningdelen: [lening({ startdatum: '2026-03-01' }), lening({ id: 'ld-2', omschrijving: 'Verbouwing', hoofdsom: 20000, startdatum: '2026-09-01', rente: 300 })],
    })
    // Aankoop: geen reserve, maximum 500.000. Verbouwing: reserve 142.000 direct ervoor, maximum 0; de reserve neemt af met 20.000.
    expect(r.bijleenregeling).toMatchObject({ maxEigenwoningschuld: 500000, leningen: 470000, eigenwoningschuld: 450000, ander: 20000, reserveGebruikt: 20000, reserveNaAankoop: 122000 })
    expect(r.eigenwoningreserve?.reduce((s, t) => s + t.bedrag, 0)).toBe(122000)
    expect(r.uitleg.find((x) => x.id === 'ew-max-schuld')?.formule).toBe('max(0, verwervingskosten 500.000 − eigenwoningreserve 0) + max(0, kosten verbetering 20.000 − eigenwoningreserve 142.000)')
    // Betaald uit eigen geld: geen box 3-schuld, de reserve neemt wel af.
    const zonderLening = reken({
      woz: 500000,
      vorigeWoning: { ...vorigeWoning, leverdatum: '2026-06-01' },
      aankoop: { leverdatum: '2026-03-01', koopsom: 490000, kostenKoper: 10000, aandeelA: 0.5 },
      verbeteringen: [{ datum: '2026-09-01', kosten: 20000 }],
      leningdelen: [lening({ startdatum: '2026-03-01' })],
    })
    expect(zonderLening.bijleenregeling).toMatchObject({ ander: 0, reserveNaAankoop: 122000 })
  })

  it('twee verbouwingen zonder aankoop en een lening na de eerste: samen begrensd (zoals vóór de review)', () => {
    const r = reken(
      {
        woz: 300000,
        verbeteringen: [
          { datum: '2027-03-01', kosten: 10000 },
          { datum: '2027-09-01', kosten: 10000 },
        ],
        leningdelen: [lening({ hoofdsom: 20000, startdatum: '2027-09-01', rente: 400 })],
      },
      2027,
    )
    expect(r.bijleenregeling).toMatchObject({ soort: 'verbetering', kosten: 20000, maxEigenwoningschuld: 20000, ander: 0 })
  })
})
