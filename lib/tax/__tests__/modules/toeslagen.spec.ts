import { describe, expect, it } from 'vitest'
import type { KindInvoer, TaxYearParams } from '../../types'
import { getJaar, kloon } from '../../years'
import kinderbijslagData from '../../years/data/kinderbijslag.json'
import { berekenKot, kotPercentage, laatsteDagNaMaanden } from '../../modules/toeslagen/kot'
import { berekenKgb, kgbAfbouw } from '../../modules/toeslagen/kgb'
import { berekenZorgtoeslag } from '../../modules/toeslagen/zorgtoeslag'
import { berekenKinderbijslag, eersteRechtKwartaal } from '../../modules/toeslagen/kinderbijslag'
import { berekenToeslagen } from '../../modules/toeslagen'

const p2026 = getJaar(2026)

/** 2025-params voor kinderbijslag: 2024 als basis met de kinderbijslag van 2025. */
function params2025(): TaxYearParams {
  const p = kloon(getJaar(2024))
  p.jaar = 2025
  p.toeslagen.waarde.kinderbijslag = kinderbijslagData['2025']
  return p
}

const kind1: KindInvoer = {
  id: 'k1',
  geboortedatum: '2023-10-17',
  opvang: [{ soort: 'dagopvang', urenPerMaand: 143, uurtarief: 11.23, maanden: 12, startdatum: '2026-01-15' }],
}

describe('kinderopvangtoeslag', () => {
  it('rekenvoorbeeld 2026: 143 uur à 11,23 bij 170.000 geeft 36,5% en circa 586 per maand', () => {
    const r = berekenKot([kind1], 170000, { params: p2026, jaar: 2026 })
    expect(r.perKind).toHaveLength(1)
    expect(r.perKind[0].rang).toBe(1)
    expect(r.perKind[0].pct).toBeCloseTo(0.365, 6)
    expect(r.perKind[0].toeslagPerJaar / 12).toBeCloseTo(586.15, 0)
    expect(r.totaal).toBe(7034) // 143 × 11,23 × 0,365 × 12 = 7.033,8
    expect(r.perKind[0].kostenPerJaar).toBe(19271) // 143 × 11,23 × 12
    expect(r.perKind[0].eigenBijdragePerJaar).toBe(19271 - 7034)
    expect(r.perKind[0].aanvraagUiterlijk).toBe('2026-04-30')
  })

  it('het kind met de meeste opvanguren is het eerste kind', () => {
    const groot: KindInvoer = { id: 'oud', geboortedatum: '2019-03-01', opvang: [{ soort: 'bso', urenPerMaand: 40, uurtarief: 9, maanden: 12 }] }
    const klein: KindInvoer = { id: 'jong', geboortedatum: '2024-03-01', opvang: [{ soort: 'dagopvang', urenPerMaand: 180, uurtarief: 10, maanden: 12 }] }
    const r = berekenKot([groot, klein], 170000, { params: p2026, jaar: 2026 })
    const jong = r.perKind.find((k) => k.kindId === 'jong')!
    const oud = r.perKind.find((k) => k.kindId === 'oud')!
    expect(jong.rang).toBe(1)
    expect(oud.rang).toBe(2)
    const rij = kotPercentage(p2026.toeslagen.waarde.kot.tabel, 170000).rij!
    expect(jong.pct).toBe(rij.pctKind1)
    expect(oud.pct).toBe(rij.pctKind2)
    expect(oud.toeslagPerJaar).toBe(Math.round(40 * 9 * rij.pctKind2 * 12))
  })

  it('begrenst uurprijs en uren per maand', () => {
    const k: KindInvoer = { id: 'k', geboortedatum: '2024-01-01', opvang: [{ soort: 'dagopvang', urenPerMaand: 250, uurtarief: 13, maanden: 1 }] }
    const r = berekenKot([k], 30000, { params: p2026, jaar: 2026 })
    expect(r.perKind[0].pct).toBe(0.96)
    expect(r.totaal).toBe(Math.round(230 * 11.23 * 0.96))
    expect(r.perKind[0].kostenPerJaar).toBe(250 * 13)
    expect(r.waarschuwingen.some((w) => w.id.startsWith('kot-max-uren'))).toBe(true)
  })

  it('kiest de eerste tabelrij met totInkomen ≥ toetsingsinkomen, null is de laatste rij', () => {
    const tabel = [
      { totInkomen: 50000, pctKind1: 0.9, pctKind2: 0.9 },
      { totInkomen: 100000, pctKind1: 0.5, pctKind2: 0.8 },
      { totInkomen: null, pctKind1: 0.3, pctKind2: 0.7 },
    ]
    expect(kotPercentage(tabel, 50000).rij!.pctKind1).toBe(0.9)
    expect(kotPercentage(tabel, 50001).rij!.pctKind1).toBe(0.5)
    expect(kotPercentage(tabel, 1e9).rij!.pctKind1).toBe(0.3)
  })

  it('directe financiering gebruikt het vergoedingspercentage zonder inkomenstoets', () => {
    const p = kloon(p2026)
    p.toeslagen.waarde.kot = { ...p.toeslagen.waarde.kot, regime: 'directeFinanciering', vergoedingPct: 0.956, eigenBijdragePct: 0.044 }
    const k: KindInvoer = { id: 'k', geboortedatum: '2024-01-01', opvang: [{ soort: 'dagopvang', urenPerMaand: 100, uurtarief: 12, maanden: 12, startdatum: '2026-01-01' }] }
    const laag = berekenKot([k], 30000, { params: p, jaar: 2029 })
    const hoog = berekenKot([k], 300000, { params: p, jaar: 2029 })
    expect(laag.totaal).toBe(hoog.totaal)
    expect(laag.totaal).toBe(Math.round(100 * 11.23 * 0.956 * 12))
    expect(laag.perKind[0].aanvraagUiterlijk).toBeUndefined()
    // eigen bijdrage = 4,4% van de begrensde prijs plus alles boven de maximum uurprijs
    expect(laag.perKind[0].eigenBijdragePerJaar).toBeCloseTo(100 * 12 * (11.23 * 0.044 + (12 - 11.23)), -1)
  })

  it('aanvraagtermijn: laatste dag van de derde maand na de startmaand', () => {
    expect(laatsteDagNaMaanden('2026-01-15', 3)).toBe('2026-04-30')
    expect(laatsteDagNaMaanden('2026-11-01', 3)).toBe('2027-02-28')
  })

  it('geen opvang geeft geen toeslag', () => {
    expect(berekenKot([{ id: 'x', geboortedatum: '2025-01-01' }], 50000, { params: p2026, jaar: 2026 }).totaal).toBe(0)
  })
})

describe('kindgebonden budget', () => {
  const kind = (id: string, geboortedatum: string): KindInvoer => ({ id, geboortedatum })

  it('volledig maximum onder het afbouwpunt voor paren', () => {
    const r = berekenKgb([kind('a', '2020-01-01')], 30000, 0, { params: p2026, jaar: 2026, partner: true })
    expect(r.bedrag).toBe(2580)
  })

  it('afbouw 7,60% boven 39.141 voor paren', () => {
    const r = berekenKgb([kind('a', '2020-01-01')], 50000, 0, { params: p2026, jaar: 2026, partner: true })
    expect(r.bedrag).toBe(Math.round(2580 - 0.076 * (50000 - 39141)))
  })

  it('dit huishouden (paar, 170.000) krijgt geen kindgebonden budget', () => {
    expect(berekenKgb([kind('a', '2023-10-17')], 170000, 0, { params: p2026, jaar: 2026, partner: true }).bedrag).toBe(0)
  })

  it('verhoging voor 12 tot en met 15 en voor 16 en 17 jaar, leeftijd op 1 januari', () => {
    const r12 = berekenKgb([kind('a', '2013-06-01')], 20000, 0, { params: p2026, jaar: 2026, partner: true })
    expect(r12.bedrag).toBe(2580 + 724)
    const r16 = berekenKgb([kind('a', '2009-06-01')], 20000, 0, { params: p2026, jaar: 2026, partner: true })
    expect(r16.bedrag).toBe(2580 + 964)
    const r18 = berekenKgb([kind('a', '2007-06-01')], 20000, 0, { params: p2026, jaar: 2026, partner: true })
    expect(r18.bedrag).toBe(0)
  })

  it('alleenstaande ouder krijgt de alo-kop en het eigen afbouwpunt', () => {
    const r = berekenKgb([kind('a', '2020-01-01')], 29736, 0, { params: p2026, jaar: 2026, partner: false })
    expect(r.bedrag).toBe(2580 + 3416)
  })

  it('kind geboren in het jaar telt mee vanaf het kwartaal na de geboorte', () => {
    const r = berekenKgb([kind('a', '2026-05-10')], 20000, 0, { params: p2026, jaar: 2026, partner: true })
    expect(r.bedrag).toBe(1290) // 6 van de 12 maanden
  })

  it('meerdere afbouwpunten: elk percentage tot het volgende punt', () => {
    const afbouw = [
      { vanafAlleen: 30000, vanafPaar: 40000, pct: 0.08 },
      { vanafAlleen: 60000, vanafPaar: 60000, pct: 0.1 },
    ]
    expect(kgbAfbouw(afbouw, 70000, true).totaal).toBeCloseTo(0.08 * 20000 + 0.1 * 10000, 6)
    expect(kgbAfbouw(afbouw, 50000, true).totaal).toBeCloseTo(0.08 * 10000, 6)
    const p = kloon(p2026)
    p.toeslagen.waarde.kgb.afbouw = afbouw
    const r = berekenKgb([kind('a', '2020-01-01'), kind('b', '2021-01-01')], 70000, 0, { params: p, jaar: 2026, partner: true })
    expect(r.bedrag).toBe(2 * 2580 - 2600)
  })

  it('geen recht boven de vermogensgrens', () => {
    const r = berekenKgb([kind('a', '2020-01-01')], 20000, 200000, { params: p2026, jaar: 2026, partner: true })
    expect(r.bedrag).toBe(0)
    expect(r.waarschuwingen[0].id).toBe('kgb-vermogen')
  })
})

describe('zorgtoeslag', () => {
  it('lineair: 1.550 − 13,73% × (40.857 − 29.736) ≈ 23', () => {
    expect(berekenZorgtoeslag(40857, 0, { params: p2026, partner: false }).bedrag).toBe(23)
  })
  it('maximum onder het drempelinkomen', () => {
    expect(berekenZorgtoeslag(20000, 0, { params: p2026, partner: false }).bedrag).toBe(1550)
    expect(berekenZorgtoeslag(20000, 0, { params: p2026, partner: true }).bedrag).toBe(2963)
  })
  it('nul boven de inkomensgrens of de vermogensgrens', () => {
    expect(berekenZorgtoeslag(40858, 0, { params: p2026, partner: false }).bedrag).toBe(0)
    expect(berekenZorgtoeslag(20000, 150000, { params: p2026, partner: false }).bedrag).toBe(0)
    expect(berekenZorgtoeslag(20000, 150000, { params: p2026, partner: true }).bedrag).toBe(2963)
  })
})

describe('kinderbijslag', () => {
  it('eerste recht in het kwartaal na de geboorte', () => {
    expect(eersteRechtKwartaal('2025-02-11')).toBe('2025-04-01')
    expect(eersteRechtKwartaal('2025-12-31')).toBe('2026-01-01')
    expect(eersteRechtKwartaal('2026-04-01')).toBe('2026-04-01')
  })

  it('kind geboren 11-02-2025: in 2025 vanaf het tweede kwartaal, 286,45 + 2 × 291,49', () => {
    const r = berekenKinderbijslag([{ id: 'k5', geboortedatum: '2025-02-11' }], { params: params2025(), jaar: 2025 })
    expect(r.perKwartaal).toEqual([
      { kwartaal: '2025-K2', kindId: 'k5', bedrag: 286.45 },
      { kwartaal: '2025-K3', kindId: 'k5', bedrag: 291.49 },
      { kwartaal: '2025-K4', kindId: 'k5', bedrag: 291.49 },
    ])
    expect(r.totaal).toBe(869.43)
  })

  it('kind geboren 17-10-2023: in 2023 nog geen kinderbijslag', () => {
    expect(berekenKinderbijslag([kind1], { params: getJaar(2023), jaar: 2023 }).totaal).toBe(0)
  })

  it('2026: 2 × 295,07 + 2 × 298,40 = 1.186,94', () => {
    const r = berekenKinderbijslag([kind1], { params: p2026, jaar: 2026 })
    expect(r.perKwartaal.map((k) => k.bedrag)).toEqual([295.07, 295.07, 298.4, 298.4])
    expect(r.totaal).toBe(1186.94)
  })

  it('leeftijd op de eerste dag van het kwartaal bepaalt de leeftijdsgroep', () => {
    const r = berekenKinderbijslag([{ id: 'x', geboortedatum: '2020-02-15' }], { params: p2026, jaar: 2026 })
    expect(r.perKwartaal.map((k) => k.bedrag)).toEqual([295.07, 358.3, 362.35, 362.35])
  })

  it('stopt bij 18 jaar', () => {
    const r = berekenKinderbijslag([{ id: 'x', geboortedatum: '2008-05-15' }], { params: p2026, jaar: 2026 })
    expect(r.perKwartaal).toHaveLength(2)
  })

  it('nog niet geboren of geboren na het jaar: geen recht', () => {
    const r = berekenKinderbijslag([{ id: 'x', geboortedatum: '2026-11-03' }], { params: p2026, jaar: 2026 })
    expect(r.totaal).toBe(0)
  })
})

describe('toeslagen samen', () => {
  it('telt alles op en geeft een waarschuwing bij een afwijkend opgegeven toetsingsinkomen', () => {
    const r = berekenToeslagen([kind1], { params: p2026, jaar: 2026, toetsingsinkomen: 170000, vermogenToets: 120000, partner: true, opgegevenToetsingsinkomen: 150000 })
    expect(r.kot.totaal).toBe(7034)
    expect(r.kgb).toBe(0)
    expect(r.zorgtoeslag).toBe(0)
    expect(r.kinderbijslag).toBe(1186.94)
    expect(r.totaal).toBe(8220.94)
    const w = r.waarschuwingen.find((x) => x.id === 'toeslagen-toetsingsinkomen')
    expect(w).toBeDefined()
    expect(w!.ernst).toBe('actie')
    expect(w!.tekst).toContain('terugbetalen')
    expect(r.uitleg.find((u) => u.id === 'toeslagen.verschil-voorschot')!.bedrag).toBeLessThan(0)
  })

  it('geen waarschuwing binnen 5%', () => {
    const r = berekenToeslagen([kind1], { params: p2026, jaar: 2026, toetsingsinkomen: 170000, vermogenToets: 0, partner: true, opgegevenToetsingsinkomen: 165000 })
    expect(r.waarschuwingen.some((x) => x.id === 'toeslagen-toetsingsinkomen')).toBe(false)
  })

  it('uitlegregels bevatten geen em-dashes', () => {
    const r = berekenToeslagen([kind1], { params: p2026, jaar: 2026, toetsingsinkomen: 50000, vermogenToets: 0, partner: true, opgegevenToetsingsinkomen: 80000 })
    const tekst = JSON.stringify([r.uitleg, r.waarschuwingen])
    expect(tekst).not.toContain('—')
  })
})
