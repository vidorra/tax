import { describe, expect, it } from 'vitest'
import { verdeelGrondslag, type Box3Context } from '@/lib/tax/modules/box3/forfaitair'
import { getJaar } from '@/lib/tax/years'

const ctx = (aandeelA: number, fiscaalPartner = true): Box3Context => ({
  params: getJaar(2024),
  jaar: 2024,
  fiscaalPartner,
  aandeelA,
  personen: ['A', 'B'],
})

describe('verdeelGrondslag', () => {
  it('partners: hele euro\'s die optellen tot de grondslag', () => {
    expect(verdeelGrondslag(6651, ctx(0.5))).toEqual({ A: 3326, B: 3325 })
    expect(verdeelGrondslag(6651, ctx(1))).toEqual({ A: 6651, B: 0 })
    expect(verdeelGrondslag(6651, ctx(0))).toEqual({ A: 0, B: 6651 })
  })

  it('een grondslag met centen gaat eerst naar beneden, zodat beide delen hele euro\'s zijn', () => {
    const d = verdeelGrondslag(352632.6, ctx(0.47))
    expect(Number.isInteger(d.A) && Number.isInteger(d.B)).toBe(true)
    expect(d.A + d.B).toBe(352632)
  })

  it('zonder partnerschap alles naar de eerste persoon, onafgerond', () => {
    expect(verdeelGrondslag(100.4, { ...ctx(0.5, false), personen: ['A'] })).toEqual({ A: 100.4, B: 0 })
  })
})
