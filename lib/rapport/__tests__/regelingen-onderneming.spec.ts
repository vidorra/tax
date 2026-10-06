/**
 * Ronde 2 (A6): de verantwoording noemt per regeling van de onderneming die speelt één regel bij "Niet meegenomen".
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { bouw } from './hulp'

function hh(o: Partial<OndernemingInvoer>, persoon: Partial<HuishoudenInvoer['personen'][number]> = {}): HuishoudenInvoer {
  return {
    jaar: 2026,
    personen: [
      {
        id: 'A',
        geboortedatum: '1981-01-01',
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
        ondernemingen: [{ id: 'ond-1', naam: 'Ontwerpstudio', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 1600 }, startjaar: 2010, ...o }],
        ...persoon,
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

describe('verantwoording: regelingen onderneming', () => {
  it('zonder regelingen geen extra regels', () => {
    const v = bouw(hh({})).verantwoording.nietMeegenomen
    expect(v.some((t) => t.includes('herinvesteringsreserve') || t.includes('stakingswinst') || t.includes('btw-correctie'))).toBe(false)
  })

  it('herinvesteringsreserve, kostenegalisatiereserve, staking met stakingslijfrente en btw-correctie', () => {
    const v = bouw(
      hh(
        {
          for: { stand: 17460 },
          staking: { soort: 'geheel', datum: '2026-07-01', stakingswinst: 25000 },
          herinvesteringsreserves: [{ id: 'hir-2025-1', ontstaanJaar: 2025, bedragOntstaan: 5000, standBegin: 5000, herkomst: { omschrijving: 'Bus', boekwaardeOud: 1000, langlopend: false }, voornemen: true }],
          egalisatiereserves: [{ id: 'eg-1', omschrijving: 'Onderhoud', standBegin: 3000, dotatie: 1000 }],
          auto: { cataloguswaarde: 45000, datumEersteToelating: '2024-01-01', nulEmissie: false, autokosten: 6000, terBeschikkingSinds: '2026-01-01', btw: { aftrekBijAanschaf: true, methode: 'forfait' } },
        },
        { inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, stakingslijfrente: { premie: 10000 } } },
      ),
    ).verantwoording.nietMeegenomen
    // Bij staking vallen de reserves vrij: stand eind 0.
    expect(v).toContain('De herinvesteringsreserve (stand € 0) en kostenegalisatiereserve (stand € 0) staan niet uitgesplitst in dit rapport.')
    expect(v).toContain('De stakingswinst (€ 51.460) en de stakingslijfrente staan niet uitgesplitst in dit rapport.')
    expect(v).toContain('De btw-correctie privégebruik van de auto (€ 1.215) staat niet apart in dit rapport.')
  })
})
