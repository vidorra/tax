/**
 * Ronde 2 (A5): buitenlandse bronbelasting en de partnerregeling in het fiscaal rapport (taak-A5 hoofdstuk 5, Rapport).
 * Bijlage 4.4.1 en de landkolom in 3.2.1 lezen via bronbelastingRegels(positie); de verantwoording noemt wat niet is
 * uitgesplitst.
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { bouw, kloon, regelMap } from './hulp'

const inv2024 = voorbeeldInvoer(2024)

/** Het voorbeeld 2024 met op de beleggingsrekening twee landen: VS 15% op 21,91 en Frankrijk 9,00 op 36,00. */
function tweeLanden(): HuishoudenInvoer {
  const invoer = kloon(inv2024)
  const x = invoer.box3.posities.find((p) => p.id === 'beleggingen')!
  delete x.bronbelasting
  x.bronbelastingen = [
    { id: 'bb-us', land: 'US', soort: 'dividend', brutoInkomsten: 21.91, bedrag: 3.29 },
    { id: 'bb-fr', land: 'FR', soort: 'dividend', brutoInkomsten: 36, bedrag: 9 },
  ]
  return invoer
}

describe('bijlage 4.4.1 met twee landen', () => {
  const doc = bouw(tweeLanden())
  const regels = regelMap(doc)

  it('per bezitting: ingehouden en inkomsten opgeteld, beide landen in de landkolom', () => {
    const r = regels.get('4.4.1.positie.beleggingen')
    expect(r?.bedragen).toEqual({ B: 12, C: 58 })
    expect(r?.teksten?.land).toBe('Verenigde Staten, Frankrijk')
    expect(regels.get('4.4.1.totaal')?.bedragen).toEqual({ B: 12, C: 58 })
  })

  it('per land: bruto, ingehouden, verdragstarief en verrekenbaar (VS 3, Frankrijk 5)', () => {
    const us = regels.get('4.4.1.land.us')
    const fr = regels.get('4.4.1.land.fr')
    expect(us?.label).toBe('Verenigde Staten')
    expect(us?.bedragen).toEqual({ Z: 22, A: 3, C: 3 })
    expect(us?.percentages).toEqual({ B: 0.15 })
    expect(fr?.label).toBe('Frankrijk')
    expect(fr?.bedragen).toEqual({ Z: 36, A: 9, C: 5 })
    expect(fr?.percentages).toEqual({ B: 0.15 })
    expect(regels.get('4.4.1.land.totaal')?.bedragen).toEqual({ Z: 58, A: 12, C: 8 })
  })

  it('wat boven het verdrag is ingehouden (Frankrijk 3,60) staat apart: terugvragen in het bronland', () => {
    expect(regels.get('4.4.1.terugvragen')?.bedragen).toEqual({ A: 4 })
  })

  it('verrekend: het deel van deze persoon uit de berekening', () => {
    const verrekend = regels.get('4.4.1.verrekenbaar')
    expect(verrekend?.bedragen?.B).toBeGreaterThan(0)
    expect(verrekend?.bedragen?.B).toBeLessThanOrEqual(8)
    expect(verrekend?.label).toContain('per land tot het verdragstarief')
  })
})

describe('bijlage 4.4.1 met het oude veld', () => {
  it('een land als naam (Zwitserland 35 op 100) geeft dezelfde regels en een regel per land', () => {
    const invoer = kloon(inv2024)
    const x = invoer.box3.posities.find((p) => p.id === 'beleggingen')!
    delete x.bronbelastingen
    x.bronbelasting = { land: 'Zwitserland', bedrag: 35, brutoInkomsten: 100 }
    const regels = regelMap(bouw(invoer))
    expect(regels.get('4.4.1.positie.beleggingen')?.bedragen).toEqual({ B: 35, C: 100 })
    expect(regels.get('4.4.1.positie.beleggingen')?.teksten?.land).toBe('Zwitserland')
    expect(regels.get('4.4.1.land.ch')?.bedragen).toEqual({ Z: 100, A: 35, C: 15 })
    expect(regels.has('4.4.1.land.totaal')).toBe(false)
  })

  it('zonder bronbelasting geen bijlage 4.4.1', () => {
    const invoer = kloon(inv2024)
    const x = invoer.box3.posities.find((p) => p.id === 'beleggingen')!
    delete x.bronbelasting
    delete x.bronbelastingen
    const regels = regelMap(bouw(invoer))
    expect([...regels.keys()].some((id) => id.startsWith('4.4.1'))).toBe(false)
  })
})

describe('landkolom in 3.2.1 (bankrekeningen buitenland)', () => {
  it('leest het land uit bronbelastingRegels', () => {
    const invoer = kloon(inv2024)
    invoer.box3.posities.push({
      id: 'bank-de',
      omschrijving: 'Tagesgeld',
      categorie: 'bankBuitenland',
      eigenaar: 'A',
      waardeBegin: 1000,
      bronbelastingen: [{ id: 'bb-de', land: 'DE', soort: 'rente', brutoInkomsten: 20, bedrag: 0 }],
    })
    const regels = regelMap(bouw(invoer))
    expect(regels.get('3.2.1.positie.bank-de')?.teksten?.land).toBe('Duitsland')
  })
})

describe('verantwoording: niet uitgesplitst', () => {
  it('voortgewentelde bronbelasting', () => {
    const invoer = tweeLanden()
    invoer.personen[0].voortgewenteldeBronbelasting = 250
    const v = bouw(invoer).verantwoording
    expect(v.nietMeegenomen).toContain('De voortgewentelde bronbelasting (€ 250) staat niet uitgesplitst in dit rapport.')
  })

  it('zonder voortwenteling en zonder partnerregeling geen extra regels', () => {
    const v = bouw(tweeLanden()).verantwoording
    expect(v.nietMeegenomen.some((t) => t.includes('voortgewentelde') || t.includes('terbeschikkingstelling'))).toBe(false)
  })

  it('beloning aan en terbeschikkingstelling door de partner', () => {
    const invoer = kloon(inv2024)
    const o = invoer.personen[0].ondernemingen[0]
    o.id = 'ond-1'
    o.samenwerkingMetPartner = 'arbeidsbeloning'
    o.meewerkendePartner = { uren: 600, vergoeding: 6000, vergoedingInKosten: false }
    invoer.personen[1].terbeschikkingstellingen = [
      { id: 'tbs-bus', omschrijving: 'Bestelbus', aan: { persoon: 'A', ondernemingId: 'ond-1' }, soort: 'zaak', vergoeding: 2400, kosten: 300, afschrijving: 1500 },
    ]
    const b = bouw(invoer, 'B').verantwoording.nietMeegenomen
    expect(b).toContain('De beloning van de onderneming van Persoon A (€ 6.000) zit in het resultaat uit overige werkzaamheden; de specificatie staat niet in dit rapport.')
    expect(b).toContain('Het resultaat uit terbeschikkingstelling (€ 600, vrijstelling € 72, belast € 528) zit in het resultaat uit overige werkzaamheden; de specificatie staat niet in dit rapport.')
    const a = bouw(invoer, 'A').verantwoording.nietMeegenomen
    expect(a.some((t) => t.startsWith('De correctie voor beloning aan of terbeschikkingstelling door Persoon B (-€ 6.000) zit in de winst van Meubelmakerij'))).toBe(true)
  })
})
