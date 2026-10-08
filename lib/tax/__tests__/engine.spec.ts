/**
 * Engine op het verzonnen voorbeeldhuishouden (lib/voorbeeld): vaste uitkomsten als regressie, plus eigenschappen.
 * De regressie tegen de echte aangiftes staat in prive/engine.spec.ts (gitignored, alleen lokaal).
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '../engine'
import type { HuishoudenResultaat } from '../types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'

type Verwacht = Record<string, number | number[]>

function waardenA(r: HuishoudenResultaat, id: 'A' | 'B' = 'A') {
  const a = r.personen.find((p) => p.id === id)!
  const o = a.ondernemingen[0]
  return {
    winstUitOnderneming: a.winstUitOnderneming,
    correctieBeperktAftrekbaar: o?.correctieBeperktAftrekbaar,
    kia: o?.kia,
    zelfstandigenaftrek: a.ondernemersaftrek.zelfstandigenaftrek,
    mkbVrijstelling: a.mkbVrijstelling,
    belastbareWinst: a.belastbareWinst,
    jaarruimte: a.inkomensvoorziening.jaarruimte,
    lijfrenteAftrek: a.inkomensvoorziening.lijfrenteAftrek,
    aovAftrek: a.inkomensvoorziening.aovAftrek,
    inkomensvoorziening: a.inkomensvoorziening.totaal,
    box1Inkomen: a.box1.inkomen,
    schijven: a.box1.schijven.map((s) => s.belasting),
    tariefmaatregel: a.box1.tariefmaatregel,
    box1Belasting: a.box1.belasting,
    premie: a.box1.premie,
    box3Inkomen: a.box3Inkomen,
    box3Belasting: a.box3Belasting,
    heffingskortingen: a.heffingskortingen.verzilverd,
    algemeneHeffingskorting: a.heffingskortingen.algemeen,
    arbeidskorting: a.heffingskortingen.arbeid,
    verschuldigdIB: a.verschuldigdIB,
    voorheffingen: a.voorheffingen,
    teBetalenIB: a.teBetalenIB,
    zvwBijdrage: a.zvw.bijdrage,
    zvwTeBetalen: a.zvw.teBetalen,
  } as Record<string, number | number[] | undefined>
}

function vergelijk(r: HuishoudenResultaat, verwacht: Verwacht, tolerantie = 0, id: 'A' | 'B' = 'A') {
  const w = waardenA(r, id)
  for (const [sleutel, v] of Object.entries(verwacht)) {
    const echt = w[sleutel]
    if (Array.isArray(v)) {
      expect(echt, sleutel).toEqual(v)
    } else if (tolerantie > 0) {
      expect(Math.abs((echt as number) - v), `${sleutel}: ${echt} vs ${v}`).toBeLessThanOrEqual(tolerantie)
    } else {
      expect(echt, sleutel).toBe(v)
    }
  }
}

describe('voorbeeldhuishouden 2024', () => {
  const r = berekenHuishouden(voorbeeldInvoer(2024), { zonderMarginaleDruk: true })
  it('persoon A: winst, ondernemersaftrek, lijfrente en AOV, box 1 boven de tweede schijf', () =>
    vergelijk(r, {
      winstUitOnderneming: 151328,
      correctieBeperktAftrekbaar: 228,
      kia: 1240,
      zelfstandigenaftrek: 3750,
      mkbVrijstelling: 19643,
      belastbareWinst: 127935,
      jaarruimte: 36077,
      lijfrenteAftrek: 9800,
      aovAftrek: 3460,
      inkomensvoorziening: 13260,
      box1Inkomen: 108257,
      tariefmaatregel: 3735,
      box1Belasting: 37324,
      box3Inkomen: 296,
      box3Belasting: 43,
      heffingskortingen: 0,
      verschuldigdIB: 47901,
      voorheffingen: 38,
      teBetalenIB: 4363,
      zvwTeBetalen: 110,
    }))
  it('persoon A: schijf 1 en 2 vol, premie en Zvw-bijdrage op het maximum', () => {
    const meer = voorbeeldInvoer(2024)
    const o = meer.personen[0].ondernemingen[0]
    if (o.winstberekening.soort === 'saldo') o.winstberekening.saldo += 50000
    const r2 = berekenHuishouden(meer, { zonderMarginaleDruk: true })
    const [a, a2] = [r, r2].map((x) => x.personen.find((p) => p.id === 'A')!)
    expect(a.box1.schijven.slice(0, 2).map((s) => s.belasting)).toEqual(a2.box1.schijven.slice(0, 2).map((s) => s.belasting))
    expect(a.box1.schijven[2].belasting).toBe(16205)
    expect(a.box1.premie).toBe(a2.box1.premie)
    expect(a.zvw.bijdrage).toBe(a2.zvw.bijdrage)
  })
  it('persoon B: kortingen inclusief inkomensafhankelijke combinatiekorting', () => {
    vergelijk(
      r,
      {
        winstUitOnderneming: 46280,
        mkbVrijstelling: 5661,
        belastbareWinst: 36869,
        jaarruimte: 7907,
        lijfrenteAftrek: 2400,
        box1Inkomen: 34469,
        schijven: [3212, 0, 0],
        premie: 9530,
        // Kortingen per deel naar boven afgerond (KG:202:2022:14).
        algemeneHeffingskorting: 2723,
        arbeidskorting: 5121,
        heffingskortingen: 10794,
        verschuldigdIB: 1948,
        teBetalenIB: 148,
        zvwBijdrage: 1961,
        zvwTeBetalen: 61,
      },
      0,
      'B',
    )
    expect(r.personen.find((p) => p.id === 'B')!.heffingskortingen.iack).toBe(2950)
  })
  it('box 3: een pot boven het heffingsvrij vermogen, Amerikaanse bronbelasting binnen het verdragstarief', () => {
    expect(r.box3.forfaitairRendement).toBe(5085)
    expect(r.box3.rendementsgrondslag).toBe(121050)
    expect(r.box3.grondslag).toBe(7050)
    expect(r.box3.effectiefPct).toBeCloseTo(0.042, 6)
    expect(r.personen.find((p) => p.id === 'A')!.box3Bronbelasting).toBe(63)
    expect(r.box3.waarschuwingen.some((w) => w.id.includes('bronbelasting'))).toBe(false)
  })
  it('eigen woning bij A', () => {
    expect(r.eigenWoning?.forfait).toBe(1442)
    expect(r.eigenWoning?.saldo).toBe(-6418)
  })
  it('lijfrentepremie eerst naar de oudste reserveringsruimte', () => {
    const tabel = r.personen.find((p) => p.id === 'A')!.inkomensvoorziening.tabel
    expect(tabel.map((t) => [t.jaar, t.ditJaarBenut])).toEqual([
      [2024, 0],
      [2023, 0],
      [2022, 4911],
      [2021, 4889],
    ])
  })
  it('kinderopvangtoeslag voor het kind in de dagopvang', () => {
    expect(r.totaal.toeslagen).toBeGreaterThan(0)
  })
})

describe('voorbeeldhuishouden 2021', () => {
  const r = berekenHuishouden(voorbeeldInvoer(2021), { zonderMarginaleDruk: true })
  it('persoon A klopt met de vaste uitkomst', () =>
    vergelijk(r, {
      winstUitOnderneming: 97320,
      correctieBeperktAftrekbaar: 172,
      kia: 952,
      zelfstandigenaftrek: 6670,
      mkbVrijstelling: 12691,
      belastbareWinst: 77959,
      jaarruimte: 10658,
      inkomensvoorziening: 9220,
      box1Inkomen: 59099,
      tariefmaatregel: 1273,
      box1Belasting: 13484,
      // Kortingen per deel naar boven afgerond (KG:202:2022:14).
      algemeneHeffingskorting: 564,
      arbeidskorting: 506,
      verschuldigdIB: 22127,
      voorheffingen: 21,
      teBetalenIB: -5294,
      zvwTeBetalen: -48,
    }))
  it('box 3 onder het heffingsvrij vermogen', () => {
    expect(r.box3.rendementsgrondslag).toBe(56800)
    expect(r.box3.grondslag).toBe(0)
  })
  it('eigen woning klopt', () => {
    expect(r.eigenWoning?.forfait).toBe(1690)
    expect(r.eigenWoning?.saldo).toBe(-7250)
  })
  it('lijfrente: eerst de reserveringsruimte van de oudste jaren', () => {
    const tabel = r.personen.find((p) => p.id === 'A')!.inkomensvoorziening.tabel
    expect(tabel.map((t) => [t.jaar, t.ditJaarBenut])).toEqual([
      [2021, 0],
      [2020, 323],
      [2019, 5877],
    ])
  })
  it('scholingsuitgaven van A na de drempel, toegerekend aan A', () => {
    expect(r.pga?.scholing).toBe(2390)
    // Drempelinkomen 61.489 min de persoonsgebonden aftrek 2.390.
    expect(r.personen.find((p) => p.id === 'A')!.box1.inkomen).toBe(59099)
    expect(r.personen.find((p) => p.id === 'B')!.box1.inkomen).toBe(19786)
  })
})

describe('eigenschappen', () => {
  const basis = voorbeeldInvoer(2024)
  it('meer winst geeft nooit minder belasting', () => {
    const r1 = berekenHuishouden(basis, { zonderMarginaleDruk: true })
    const meer = structuredClone(basis)
    const o = meer.personen[0].ondernemingen[0]
    if (o.winstberekening.soort === 'saldo') o.winstberekening.saldo += 5000
    const r2 = berekenHuishouden(meer, { zonderMarginaleDruk: true })
    expect(r2.totaal.verschuldigdIB).toBeGreaterThan(r1.totaal.verschuldigdIB)
  })
  it('optimale verdeling is nooit duurder dan de vaste verdeling', () => {
    const vast = berekenHuishouden(basis, { zonderMarginaleDruk: true })
    const opt = berekenHuishouden({ ...basis, verdeling: 'optimaal' }, { zonderMarginaleDruk: true })
    const kosten = (r: HuishoudenResultaat) => r.totaal.verschuldigdIB + r.totaal.verschuldigdZvw - r.totaal.toeslagen
    expect(kosten(opt)).toBeLessThanOrEqual(kosten(vast) + 1)
  })
  it('lijfrente- en AOV-aftrek blijven bij de persoon', () => {
    const r = berekenHuishouden({ ...basis, verdeling: 'optimaal' }, { zonderMarginaleDruk: true })
    const [a, b] = ['A', 'B'].map((id) => r.personen.find((p) => p.id === id)!.inkomensvoorziening)
    expect(a.totaal).toBe(9800 + 3460)
    expect(b.totaal).toBe(2400)
  })
  it('marginale druk 2024 rond 44,6% (MKB onder de tariefmaatregel)', () => {
    const r = berekenHuishouden(basis)
    const m = r.personen.find((p) => p.id === 'A')!.marginaleDruk!
    expect(m).toBeGreaterThan(0.44)
    expect(m).toBeLessThan(0.452)
  })
})
