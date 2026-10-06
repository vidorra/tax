/** Ronde 2 (contract, na de nacontrole): badges van de tabrij en de knop terug (lib/dossier/jaar-tabs.ts). */
import { describe, expect, it } from 'vitest'
import { jaarBadges, leesTerug } from '../jaar-tabs'

const telling = (fouten: number) => ({ fouten, letOp: 2, info: 1, genegeerd: 0 })

describe('jaarBadges', () => {
  it('fouten bij Invoer alleen als de controles streng zijn', () => {
    expect(jaarBadges({ status: 'concept', controles: telling(2), staat: { versie: 1 } }).invoer).toBeUndefined()
    const streng = { versie: 1 as const, controles: { streng: { op: '2026-10-05T10:00:00Z', door: 'export' as const } } }
    expect(jaarBadges({ status: 'concept', controles: telling(2), staat: streng }).invoer).toEqual({ tekst: '2', srTekst: '2 fouten open' })
    expect(jaarBadges({ status: 'ingediend', controles: telling(1), staat: null }).invoer).toEqual({ tekst: '1', srTekst: '1 fout open' })
    expect(jaarBadges({ status: 'ingediend', controles: telling(0), staat: null }).invoer).toBeUndefined()
    expect(jaarBadges({ status: 'ingediend', staat: null }).invoer).toBeUndefined()
  })

  it('voortgang bij Aangifte invullen pas zodra er iets is afgevinkt, opgeteld over de personen', () => {
    const t = (afgevinkt: number, totaal: number) => ({ afgevinkt, totaal, verschillen: 0, gewijzigd: 0 })
    expect(jaarBadges({ status: 'concept', staat: { versie: 1, samenvatting: { invulhulp: { A: t(0, 42) } } } }).aangifte).toBeUndefined()
    expect(jaarBadges({ status: 'concept', staat: { versie: 1, samenvatting: { invulhulp: { A: t(18, 42), B: t(6, 30) } } } }).aangifte).toEqual({
      tekst: '24/72',
      srTekst: '24 van 72 ingevuld en gecontroleerd',
    })
  })
})

describe('leesTerug', () => {
  it('kent alleen de andere tabs', () => {
    expect(leesTerug('export')).toEqual({ tab: 'export', label: 'Export' })
    expect(leesTerug(['aangifte'])).toEqual({ tab: 'aangifte', label: 'Aangifte invullen' })
    expect(leesTerug('invoer')).toBeUndefined()
    expect(leesTerug('onzin')).toBeUndefined()
    expect(leesTerug(undefined)).toBeUndefined()
  })
})
