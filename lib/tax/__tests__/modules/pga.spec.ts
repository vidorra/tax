import { describe, expect, it } from 'vitest'
import { berekenPga } from '../../modules/pga'
import { getJaar, kloon } from '../../years'

const p2026 = () => ({ params: getJaar(2026), aowBereikt: false })

describe('persoonsgebonden aftrek', () => {
  it('rekent de scholingsaftrek 2021 boven de drempel (2.640 − 250 = 2.390)', () => {
    const params = kloon(getJaar(2024))
    params.pga.waarde.scholing = { actief: true, drempel: 250, max: 15000 }
    const r = berekenPga({ scholing: 2640 }, { params, gezamenlijkDrempelinkomen: 84000, aowBereikt: false })
    expect(r.scholing).toBe(2390)
    expect(r.totaal).toBe(2390)
  })

  it('geeft geen scholingsaftrek als die regeling niet meer bestaat', () => {
    const r = berekenPga({ scholing: 2640 }, { ...p2026(), gezamenlijkDrempelinkomen: 80000 })
    expect(r.scholing).toBe(0)
  })

  it('rekent gewone giften boven de drempel van 1%', () => {
    const r = berekenPga({ giftenGewoon: 3000 }, { ...p2026(), gezamenlijkDrempelinkomen: 100000 })
    expect(r.giften).toBe(2000)
  })

  it('gebruikt de minimale drempel bij een laag inkomen', () => {
    const r = berekenPga({ giftenGewoon: 50 }, { ...p2026(), gezamenlijkDrempelinkomen: 3000 })
    expect(r.giften).toBe(0)
  })

  it('begrenst gewone giften op 10% van het drempelinkomen', () => {
    const r = berekenPga({ giftenGewoon: 5000 }, { ...p2026(), gezamenlijkDrempelinkomen: 20000 })
    expect(r.giften).toBe(2000)
    expect(r.waarschuwingen.map((w) => w.id)).toContain('pga-giften-max')
  })

  it('verhoogt giften aan culturele instellingen met 25%, maximaal 1.250', () => {
    expect(berekenPga({ giftenCultureel: 2000 }, { ...p2026(), gezamenlijkDrempelinkomen: 100000 }).giften).toBe(1250) // 1.000 + 250
    expect(berekenPga({ giftenCultureel: 10000 }, { ...p2026(), gezamenlijkDrempelinkomen: 100000 }).giften).toBe(9000 + 1250)
  })

  it('trekt periodieke giften af zonder drempel', () => {
    expect(berekenPga({ giftenPeriodiek: 5000 }, { ...p2026(), gezamenlijkDrempelinkomen: 100000 }).giften).toBe(5000)
  })

  it('rekent specifieke zorgkosten met verhoging en drempel', () => {
    // 2.000 × 1,4 = 2.800 − 1,65% × 30.000 (495) = 2.305
    expect(berekenPga({ specifiekeZorgkosten: 2000 }, { ...p2026(), gezamenlijkDrempelinkomen: 30000 }).zorgkosten).toBe(2305)
    // geen verhoging; drempel 848 + 5,75% × (60.000 − 51.411) = 1.341,87
    expect(berekenPga({ specifiekeZorgkosten: 2000 }, { ...p2026(), gezamenlijkDrempelinkomen: 60000 }).zorgkosten).toBe(658)
  })

  it('gebruikt de hogere verhoging voor AOW-gerechtigden', () => {
    // 1.000 × 2,13 = 2.130 − 495 = 1.635
    expect(berekenPga({ specifiekeZorgkosten: 1000 }, { params: getJaar(2026), aowBereikt: true, gezamenlijkDrempelinkomen: 30000 }).zorgkosten).toBe(1635)
  })

  it('verdubbelt de laagste zorgkostendrempel voor partners', () => {
    // 15.000 ≤ 2 × 9.680: drempel 2 × 166 = 332; 100 × 1,4 = 140 → 0; 1.000 × 1,4 = 1.400 − 332 = 1.068
    const r = berekenPga({ specifiekeZorgkosten: 1000 }, { ...p2026(), gezamenlijkDrempelinkomen: 15000, fiscaalPartner: true })
    expect(r.zorgkosten).toBe(1068)
  })

  it('geeft geen zorgkostenaftrek als die niet actief is', () => {
    const params = getJaar(2026)
    params.pga.waarde.zorgkosten.actief = false
    expect(berekenPga({ specifiekeZorgkosten: 2000 }, { params, aowBereikt: false, gezamenlijkDrempelinkomen: 30000 }).zorgkosten).toBe(0)
  })

  it('trekt partneralimentatie volledig af', () => {
    const r = berekenPga(undefined, { ...p2026(), gezamenlijkDrempelinkomen: 50000, partneralimentatie: 6000 })
    expect(r.alimentatie).toBe(6000)
    expect(r.totaal).toBe(6000)
  })

  it('is nul zonder invoer', () => {
    expect(berekenPga(undefined, { ...p2026(), gezamenlijkDrempelinkomen: 50000 }).totaal).toBe(0)
  })
})
