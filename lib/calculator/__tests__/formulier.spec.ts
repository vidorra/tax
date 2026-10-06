import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import {
  decodeState,
  encodeState,
  naarInvoer,
  naarInvoerMetNotities,
  normaliseerState,
  standaardState,
  type CalculatorState,
} from '../formulier'

const winstberekening = (s: CalculatorState, id: 'A' | 'B' = 'A') => {
  const p = naarInvoer(s).personen.find((x) => x.id === id)!
  return p.ondernemingen[0].winstberekening
}

describe('naarInvoer', () => {
  it('vertaalt de standaard (alleenstaand) naar één persoon met uitgesplitste winst', () => {
    const s = standaardState(2026)
    const invoer = naarInvoer(s)
    expect(invoer.jaar).toBe(2026)
    expect(invoer.fiscaalPartner).toBe(false)
    expect(invoer.personen).toHaveLength(1)
    expect(invoer.verdeling).toEqual({ eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 })
    expect(winstberekening(s)).toEqual({ soort: 'uitgesplitst', omzet: 90000, kosten: 15000 })
    const o = invoer.personen[0].ondernemingen[0]
    expect(o.startjaar).toBe(2015)
    expect(o.uren.urencriteriumGehaald).toBe(true)
    expect(o.maandenGewerkt).toBeUndefined()
    expect(invoer.eigenWoning).toBeUndefined()
    expect(invoer.box3).toEqual({ posities: [], schulden: [] })
    expect(invoer.kinderen).toEqual([])
  })

  it('met partner: twee personen, fiscaal partner en optimale verdeling', () => {
    const s = standaardState(2026)
    s.partner = true
    s.personen.B = { ...s.personen.B, heeftOnderneming: true, omzet: 40000, kosten: 5000, urencriterium: false, loonAan: true, loonBruto: 20000, loonheffing: 2000 }
    const invoer = naarInvoer(s)
    expect(invoer.fiscaalPartner).toBe(true)
    expect(invoer.verdeling).toBe('optimaal')
    expect(invoer.personen.map((p) => p.id)).toEqual(['A', 'B'])
    const b = invoer.personen[1]
    expect(b.ondernemingen[0].uren.urencriteriumGehaald).toBe(false)
    expect(b.loon).toEqual([{ omschrijving: 'Loon', soort: 'loon', bruto: 20000, ingehoudenLoonheffing: 2000, zvwBijdrageloon: 20000 }])
    const r = berekenHuishouden(invoer)
    expect(r.personen).toHaveLength(2)
  })

  it('zonder onderneming geen ondernemingen; partner uit laat B weg', () => {
    const s = standaardState(2026)
    s.personen.A.heeftOnderneming = false
    expect(naarInvoer(s).personen[0].ondernemingen).toEqual([])
    s.personen.B.omzet = 50000
    expect(naarInvoer(s).personen).toHaveLength(1)
  })

  it('rekent 8 maanden om naar een heel jaar en meldt dat', () => {
    const s = standaardState(2026)
    s.personen.A.omzet = 60000
    s.personen.A.kosten = 10000
    s.personen.A.maandenGewerkt = 8
    const { invoer, notities, omrekeningen } = naarInvoerMetNotities(s)
    expect(invoer.personen[0].ondernemingen[0].winstberekening).toEqual({ soort: 'uitgesplitst', omzet: 90000, kosten: 15000 })
    expect(omrekeningen).toEqual([{ persoon: 'A', maanden: 8, omzet: 60000, kosten: 10000, omzetJaar: 90000, kostenJaar: 15000 }])
    expect(notities).toHaveLength(1)
    expect(notities[0]).toContain('8 maanden')
    expect(notities[0]).toContain('€ 90.000')
    expect(notities[0]).not.toContain('—')
  })

  it('zet woning, box 3 per categorie, kinderen met opvang en voorlopige aanslag om', () => {
    const s = standaardState(2026)
    s.woning = { aan: true, woz: 450000, rente: 9000 }
    s.vermogen = { bank: 30000, beleggingen: 40000, crypto: 5000, schulden: 10000 }
    s.kinderen = [{ geboortedatum: '2023-05-01', opvang: { soort: 'dagopvang', urenPerMaand: 100, uurtarief: 10.5 } }, { geboortedatum: '2018-01-01', opvang: null }]
    s.personen.A.voorlopigeAanslag = { ib: 15000, zvw: 3000 }
    s.personen.A.investeringen = 5000
    const invoer = naarInvoer(s)
    expect(invoer.eigenWoning).toEqual({ woz: 450000, rente: 9000 })
    expect(invoer.box3.posities.map((p) => [p.categorie, p.waardeBegin])).toEqual([
      ['bankNL', 30000],
      ['beleggingen', 40000],
      ['crypto', 5000],
    ])
    expect(invoer.box3.schulden.map((x) => x.waardeBegin)).toEqual([10000])
    expect(invoer.kinderen[0].opvang).toEqual([{ soort: 'dagopvang', urenPerMaand: 100, uurtarief: 10.5, maanden: 12 }])
    expect(invoer.kinderen[1].opvang).toBeUndefined()
    expect(invoer.personen[0].voorlopigeAanslagIB).toBe(15000)
    expect(invoer.personen[0].voorlopigeAanslagZvw).toBe(3000)
    expect(invoer.personen[0].ondernemingen[0].investeringen).toEqual([
      { omschrijving: 'Investeringen in bedrijfsmiddelen', datum: '2026-07-01', bedrag: 5000, regeling: 'kia' },
    ])
    const r = berekenHuishouden(invoer)
    expect(r.toeslagen.kot.totaal).toBeGreaterThan(0)
    expect(r.personen[0].heffingskortingen.iack).toBeGreaterThan(0)
  })

  it('geeft de variant alleen door aan een jaar dat hem kent', () => {
    const s = standaardState(2027, 'brief-29-09')
    expect(naarInvoer(s).variant).toBe('brief-29-09')
    expect(naarInvoer(s, 2028).variant).toBeUndefined()
    const s2 = standaardState(2026, 'brief-29-09')
    expect(s2.variant).toBe('brief-29-09')
    expect(naarInvoer(s2).variant).toBeUndefined()
    expect(naarInvoer(s2, 2027).variant).toBe('brief-29-09')
  })
})

describe('encodeState en decodeState', () => {
  it('roundtrip geeft dezelfde state', () => {
    const s = standaardState(2027, 'brief-29-09')
    s.partner = true
    s.vergelijk = true
    s.personen.B.omzet = 12345
    s.kinderen = [{ geboortedatum: '2024-02-29', opvang: { soort: 'bso', urenPerMaand: 60, uurtarief: 9.25 } }]
    const code = encodeState(s)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeState(code)).toEqual(s)
  })

  it('is tolerant voor ontbrekende en foute velden', () => {
    const json = JSON.stringify({ v: 1, s: { jaar: 2025, personen: { A: { omzet: 50000, kosten: 'veel', maandenGewerkt: 40 } }, kinderen: [{ geboortedatum: 'gisteren' }, 3] } })
    const code = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const s = decodeState(code)!
    expect(s.jaar).toBe(2025)
    expect(s.personen.A.omzet).toBe(50000)
    expect(s.personen.A.kosten).toBe(15000)
    expect(s.personen.A.maandenGewerkt).toBe(12)
    expect(s.personen.B).toEqual(standaardState().personen.B)
    expect(s.kinderen).toHaveLength(1)
    expect(s.kinderen[0].geboortedatum).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(s.woning.aan).toBe(false)
  })

  it('weigert onzin, onbekende jaren en nieuwere versies netjes', () => {
    expect(decodeState('')).toBeNull()
    expect(decodeState('!!!')).toBeNull()
    expect(decodeState(btoa('geen json'))).toBeNull()
    expect(decodeState(btoa(JSON.stringify({ v: 99, s: {} })))).toBeNull()
    expect(normaliseerState({ jaar: 1999 }).jaar).toBe(2026)
    expect(normaliseerState({ variant: 'bestaat-niet' }).variant).toBeUndefined()
    expect(normaliseerState(null)).toEqual(standaardState())
  })
})

describe('end-to-end met de rekenkern', () => {
  it('standaardstate 2026: een zzp\'er met 75.000 winst, alle stappen tot de Zvw', () => {
    const r = berekenHuishouden(naarInvoer(standaardState(2026)))
    const a = r.personen[0]
    expect(a.winstUitOnderneming).toBe(75000)
    expect(a.ondernemersaftrek.zelfstandigenaftrek).toBe(1200)
    expect(a.mkbVrijstelling).toBe(Math.round(0.127 * (75000 - 1200)))
    expect(a.belastbareWinst).toBe(75000 - 1200 - a.mkbVrijstelling)
    expect(a.verschuldigdIB).toBeGreaterThan(0)
    expect(a.zvw.bijdrage).toBe(Math.floor(0.0485 * a.belastbareWinst))
    expect(a.marginaleDruk).toBeGreaterThan(0)
  })

  it('alle beschikbare jaren rekenen met de standaardstate zonder fout', () => {
    for (const jaar of [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028]) {
      const s = standaardState(jaar)
      s.vermogen.bank = 80000
      expect(() => berekenHuishouden(naarInvoer(s))).not.toThrow()
    }
  })
})
