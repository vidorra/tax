import { describe, expect, it } from 'vitest'
import { getJaar } from '../years'
import { diff, plat, statusVan } from '../years/diff'

const vind = (regels: ReturnType<typeof diff>, pad: string) => regels.find((r) => r.pad === pad)

describe('diff tussen jaren', () => {
  const regels = diff(getJaar(2026), getJaar(2027))

  it('bevat de wijziging van het tarief van schijf 1 in box 1', () => {
    const r = vind(regels, 'box1.schijven[0].tarief')
    expect(r).toBeDefined()
    expect(r!.oud).toBe(getJaar(2026).box1.waarde.schijven[0].tarief)
    expect(r!.nieuw).toBe(getJaar(2027).box1.waarde.schijven[0].tarief)
    expect(r!.oud).not.toBe(r!.nieuw)
  })

  it('bevat de zelfstandigenaftrek van 1.200 naar 900', () => {
    const r = vind(regels, 'ondernemer.zelfstandigenaftrek')
    expect(r).toMatchObject({ oud: 1200, nieuw: 900 })
  })

  it('geeft per regel de status in beide jaren', () => {
    const r = vind(regels, 'box1.schijven[0].tarief')!
    expect(r.statusOud).toBe(statusVan(getJaar(2026), 'box1.schijven[0].tarief'))
    expect(r.statusNieuw).toBe(statusVan(getJaar(2027), 'box1.schijven[0].tarief'))
  })

  it('sorteert op pad en neemt geen metadata mee', () => {
    const paden = regels.map((r) => r.pad)
    expect(paden).toEqual([...paden].sort())
    expect(paden.some((p) => /\.(status|bron|toelichting|veldStatus)\b/.test(p))).toBe(false)
    expect(paden.some((p) => p.startsWith('changelog') || p.startsWith('varianten') || p === 'bijgewerkt')).toBe(false)
  })

  it('een jaar met zichzelf geeft geen verschillen', () => {
    expect(diff(getJaar(2026), getJaar(2026))).toEqual([])
  })
})

describe('diff tussen jaar en variant', () => {
  it('bevat het heffingsvrij vermogen box 3 van 60.098 naar 30.846', () => {
    const regels = diff(getJaar(2027), getJaar(2027, 'brief-29-09'))
    expect(vind(regels, 'box3.heffingsvrijVermogen')).toMatchObject({ oud: 60098, nieuw: 30846 })
  })
})

describe('plat', () => {
  it('slaat blokken plat tot parameterpaden', () => {
    const p = getJaar(2026)
    const m = plat(p)
    expect(m.get('ondernemer.zelfstandigenaftrek')).toBe(p.ondernemer.waarde.zelfstandigenaftrek)
    expect(m.get('box1.schijven[0].tarief')).toBe(p.box1.waarde.schijven[0].tarief)
    expect(m.has('indexatie.tcf')).toBe(true)
  })
})
