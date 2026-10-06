import { describe, expect, it } from 'vitest'
import type { HuishoudenResultaat } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { formatEuro } from '@/components/ui/format'
import { grensKort, grensZinnen } from '../grenzen-tekst'

/** formatEuro zet een harde spatie na het euroteken; de tests schrijven een gewone spatie. */
const n = (s: string) => s.replace(/\u00a0/g, ' ')

const persoon = (id: 'A' | 'B', vervallen: { soort: 'aanslaggrens' | 'teruggaafgrens'; bedrag: number } | null) => ({
  id,
  aanslag: { grond: 'b' as const, verschuldigd: 0, voorheffingssaldo: 0, voorlopigeAanslagen: 0, teBetalen: 0, terug: 0, vervallenDoorGrens: vervallen },
})

describe('grenzen-tekst', () => {
  const params = getJaar(2026)
  it('één persoon: een zin met de grens uit de params', () => {
    const r = { personen: [persoon('A', { soort: 'aanslaggrens', bedrag: 40 })] } as unknown as HuishoudenResultaat
    expect(grensZinnen(r, params).map(n)).toEqual(['Berekend € 40; onder de aanslaggrens van € 58, dus niets te betalen.'])
    expect(grensZinnen(r, params)[0]).toContain(formatEuro(params.overig.waarde.aanslaggrens))
  })
  it('twee personen: met de naam ervoor; zonder aanslag niets', () => {
    const r = { personen: [persoon('A', null), persoon('B', { soort: 'teruggaafgrens', bedrag: 12 })] } as unknown as HuishoudenResultaat
    expect(grensZinnen(r, params).map(n)).toEqual(['Persoon B: terug € 12; onder de teruggaafgrens van € 18, dus niets terug.'])
    expect(grensZinnen({ personen: [{ id: 'A' }] } as unknown as HuishoudenResultaat, params)).toEqual([])
  })
  it('korte regel uit de samenvatting', () => {
    expect(grensKort({ teBetalenIB: 40 })).toBeNull()
    expect(n(grensKort({ teBetalenIB: 40, teBetalenIBNaGrenzen: 0 })!)).toBe('Berekend € 40, onder de aanslaggrens')
    expect(grensKort({ teBetalenIB: 40, teBetalenIBNaGrenzen: 40 })).toBeNull()
  })
})
