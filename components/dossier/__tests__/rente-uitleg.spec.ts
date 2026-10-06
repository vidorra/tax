/**
 * Review ronde 2, bevinding 21: bij een geschat percentage belastingrente zegt het label Geschat wat er geschat is
 * (datum en percentage uit de periodetabel), niet dat het met indexatieregels is berekend.
 */
import { describe, expect, it } from 'vitest'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'
import { renteSchattingUitleg, renteStatusUitleg } from '../planning/va-tekst'

describe('uitleg bij een geschatte belastingrente', () => {
  it('noemt de datum en het percentage uit de tabel', () => {
    const geschat = BELASTINGRENTE_IB.find((p) => p.status !== 'definitief')
    const tekst = renteSchattingUitleg(BELASTINGRENTE_IB)
    if (!geschat) return expect(tekst).toBeNull()
    expect(tekst).toMatch(/^Het percentage vanaf \d{1,2} \w+ \d{4} is nog niet bekendgemaakt\. We rekenen met \d+(,\d+)?%\.$/)
    expect(tekst).not.toMatch(/indexatie/)
  })

  it('zonder geschatte periode geen eigen uitleg', () => {
    expect(renteSchattingUitleg([{ vanaf: '2026-01-01', tot: null, pct: 0.05, status: 'definitief', bron: { titel: 'x', datum: '2026-10-05' } }])).toBeNull()
    expect(renteSchattingUitleg([{ vanaf: '2027-01-01', tot: null, pct: 0.055, status: 'geschat', bron: { titel: 'x', datum: '2026-10-05' } }])).toBe('Het percentage vanaf 1 januari 2027 is nog niet bekendgemaakt. We rekenen met 5,5%.')
  })

  it('in de uitleg alleen bij regels over de belastingrente', () => {
    const tabel = [{ vanaf: '2027-01-01', tot: null, pct: 0.055, status: 'geschat' as const, bron: { titel: 'x', datum: '2026-10-05' } }]
    const f = renteStatusUitleg(tabel)
    expect(f({ parameter: 'belastingrente (periodetabel)' })).toMatch(/^Het percentage vanaf 1 januari 2027/)
    expect(f({ parameter: 'overig.belastingrenteRegels' })).toMatch(/^Het percentage/)
    expect(f({ parameter: 'box1.schijven' })).toBeUndefined()
    expect(f({})).toBeUndefined()
  })
})
