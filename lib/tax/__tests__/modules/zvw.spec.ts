import { describe, expect, it } from 'vitest'
import { berekenZvw } from '../../modules/zvw'
import { getJaar, kloon } from '../../years'

describe('Zvw', () => {
  it('rekent tot het maximum bijdrage-inkomen (2024)', () => {
    const r = berekenZvw({ params: getJaar(2024), bijdrageInkomen: 127935, loonMetIngehoudenBijdrage: 0, voorlopig: 3700 })
    expect(r.bijdrageInkomen).toBe(71628)
    expect(r.bijdrage).toBe(Math.floor(71628 * 0.0532))
    expect(r.teBetalen).toBe(r.bijdrage - 3700)
  })

  it('rekent onder het maximum met de parameters van 2021', () => {
    const params = kloon(getJaar(2024))
    params.zvw.waarde = { pctOndernemer: 0.0575, pctWerkgever: 0.07, maxBijdrageInkomen: 58311 }
    const r = berekenZvw({ params, bijdrageInkomen: 41760, loonMetIngehoudenBijdrage: 0, voorlopig: 2300 })
    expect(r.bijdrageInkomen).toBe(41760)
    expect(r.bijdrage).toBe(2401) // 5,75% × 41.760 = 2.401,2
    expect(r.teBetalen).toBe(101)
  })

  it('rondt naar beneden af (2026: 4,85% × 58.740 = 2.848,9)', () => {
    const r = berekenZvw({ params: getJaar(2026), bijdrageInkomen: 58740, loonMetIngehoudenBijdrage: 0, voorlopig: 0 })
    expect(r.bijdrage).toBe(2848)
    expect(r.teBetalen).toBe(2848)
  })

  it('telt loon met ingehouden bijdrage mee voor het maximum', () => {
    // ruimte 79.409 − 50.000 = 29.409; 4,85% × 29.409 = 1.426,3
    const r = berekenZvw({ params: getJaar(2026), bijdrageInkomen: 60000, loonMetIngehoudenBijdrage: 50000, voorlopig: 0 })
    expect(r.bijdrageInkomen).toBe(29409)
    expect(r.bijdrage).toBe(1426)
  })

  it('is nul als het loon al boven het maximum ligt of het inkomen negatief is', () => {
    expect(berekenZvw({ params: getJaar(2026), bijdrageInkomen: 30000, loonMetIngehoudenBijdrage: 90000, voorlopig: 0 }).bijdrage).toBe(0)
    expect(berekenZvw({ params: getJaar(2026), bijdrageInkomen: -10000, loonMetIngehoudenBijdrage: 0, voorlopig: 0 }).bijdrage).toBe(0)
  })

  it('geeft een teruggave als de voorlopige aanslag hoger was', () => {
    const r = berekenZvw({ params: getJaar(2026), bijdrageInkomen: 20000, loonMetIngehoudenBijdrage: 0, voorlopig: 1500 })
    expect(r.bijdrage).toBe(970)
    expect(r.teBetalen).toBe(-530)
  })
})
