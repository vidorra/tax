import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '../../types'
import { getJaar } from '../../years'
import { aanslagUitleg, berekenAanslag } from '../../modules/aanslag'
import { berekenHuishouden } from '../../engine'

const p2026 = getJaar(2026)

describe('aanslag- en teruggaafgrens (art. 9.4)', () => {
  it('de grenzen komen uit de params: 2026 58 en 18, 2022 48 en 15', () => {
    expect(p2026.overig.waarde.aanslaggrens).toBe(58)
    expect(p2026.overig.waarde.teruggaafgrens).toBe(18)
    expect(getJaar(2022).overig.waarde.aanslaggrens).toBe(48)
    expect(getJaar(2022).overig.waarde.teruggaafgrens).toBe(15)
  })

  it('G1: verschil 40 onder de aanslaggrens: nihil, 40 vervalt', () => {
    const a = berekenAanslag({ verschuldigd: 3240, voorheffingen: 3200 }, { params: p2026 })
    expect(a).toMatchObject({ grond: 'b', teBetalen: 0, terug: 0, vervallenDoorGrens: { soort: 'aanslaggrens', bedrag: 40 } })
  })

  it('G2: verschil 59: aanslag, te betalen 59', () => {
    const a = berekenAanslag({ verschuldigd: 3259, voorheffingen: 3200 }, { params: p2026 })
    expect(a).toMatchObject({ grond: 'a', teBetalen: 59, terug: 0, vervallenDoorGrens: null })
  })

  it('G3: teruggaaf 15 onder de teruggaafgrens: nihil, 15 vervalt', () => {
    const a = berekenAanslag({ verschuldigd: 3240, voorheffingen: 3255 }, { params: p2026 })
    expect(a).toMatchObject({ teBetalen: 0, terug: 0, vervallenDoorGrens: { soort: 'teruggaafgrens', bedrag: 15 } })
  })

  it('G4: teruggaaf 19: terug 19', () => {
    const a = berekenAanslag({ verschuldigd: 3240, voorheffingen: 3259 }, { params: p2026 })
    expect(a).toMatchObject({ teBetalen: 0, terug: 19, vervallenDoorGrens: null })
  })

  it('G5: alleen 10 dividendbelasting: met aangifte terug 0 (10 ≤ 18); zonder aangifte en zonder c of d geen aanslag', () => {
    const met = berekenAanslag({ verschuldigd: 0, voorheffingen: 10 }, { params: p2026, aangifteGedaan: true })
    expect(met).toMatchObject({ grond: 'b', terug: 0, vervallenDoorGrens: { soort: 'teruggaafgrens', bedrag: 10 } })
    const zonder = berekenAanslag({ verschuldigd: 0, voorheffingen: 10 }, { params: p2026, aangifteGedaan: false })
    expect(zonder).toMatchObject({ grond: 'geen', teBetalen: 0, terug: 0 })
    // Grond c: rendementsgrondslag boven de grens (partners het dubbele); grond d: groene beleggingen.
    const grens = p2026.overig.waarde.aanslagRendementsgrondslag
    expect(berekenAanslag({ verschuldigd: 0, voorheffingen: 100 }, { params: p2026, aangifteGedaan: false, rendementsgrondslag: grens + 1 }).grond).toBe('c')
    expect(berekenAanslag({ verschuldigd: 0, voorheffingen: 100 }, { params: p2026, aangifteGedaan: false, rendementsgrondslag: grens + 1, fiscaalPartner: true }).grond).toBe('geen')
    expect(berekenAanslag({ verschuldigd: 0, voorheffingen: 100 }, { params: p2026, aangifteGedaan: false, groeneBeleggingen: true })).toMatchObject({ grond: 'd', terug: 100 })
  })

  it('G6: verschuldigd 10.000, voorlopige aanslag 9.990: aanslag 10.000, na verrekening 10, met melding', () => {
    const a = berekenAanslag({ verschuldigd: 10000, voorheffingen: 0, voorlopigeAanslagIB: 9990 }, { params: p2026 })
    expect(a).toMatchObject({ grond: 'a', voorlopigeAanslagen: 9990, teBetalen: 10, terug: 0, vervallenDoorGrens: null })
    expect(aanslagUitleg(a, p2026).waarschuwingen.map((w) => w.id)).toEqual(['aanslag-grens-na-va'])
  })

  it('G7: 2022, verschil 49 boven de aanslaggrens van 48: te betalen 49', () => {
    const a = berekenAanslag({ verschuldigd: 3249, voorheffingen: 3200 }, { params: getJaar(2022) })
    expect(a).toMatchObject({ grond: 'a', teBetalen: 49 })
  })

  it('een voorlopige teruggaaf verlaagt het voorheffingssaldo; een nihil-aanslag geeft de betaalde voorlopige aanslag terug', () => {
    const teruggaaf = berekenAanslag({ verschuldigd: 3000, voorheffingen: 3000, voorlopigeAanslagIB: -500 }, { params: p2026 })
    expect(teruggaaf).toMatchObject({ voorheffingssaldo: 2500, grond: 'a', teBetalen: 500 })
    const nihil = berekenAanslag({ verschuldigd: 3240, voorheffingen: 3200, voorlopigeAanslagIB: 1000 }, { params: p2026 })
    expect(nihil).toMatchObject({ teBetalen: 0, terug: 1000, vervallenDoorGrens: { soort: 'aanslaggrens', bedrag: 40 } })
  })
})

describe('engine: aanslag per persoon en het totaal na de grenzen', () => {
  const invoer = (loonheffing: number): HuishoudenInvoer => ({
    jaar: 2026,
    personen: [
      {
        id: 'A',
        geboortedatum: '1985-05-01',
        ondernemingen: [],
        loon: [{ omschrijving: 'Acme BV', soort: 'loon', bruto: 40000, ingehoudenLoonheffing: loonheffing }],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  })

  it('teBetalenIB blijft het berekende bedrag; teBetalenIBNaGrenzen volgt de grens', () => {
    const basis = berekenHuishouden(invoer(0))
    const V = basis.personen[0].verschuldigdIB
    const r = berekenHuishouden(invoer(V - 40))
    expect(r.personen[0].teBetalenIB).toBe(40)
    expect(r.personen[0].aanslag).toMatchObject({ teBetalen: 0, vervallenDoorGrens: { soort: 'aanslaggrens', bedrag: 40 } })
    expect(r.totaal.teBetalenIB).toBe(40)
    expect(r.totaal.teBetalenIBNaGrenzen).toBe(0)
    expect(r.personen[0].uitleg.some((u) => u.id === 'aanslag-grens')).toBe(true)
    const boven = berekenHuishouden(invoer(V - 500))
    expect(boven.totaal.teBetalenIBNaGrenzen).toBe(500)
  })
})

describe('verantwoording in het rapport: grenzen en belastingrente in plaats van "niet toegepast"', () => {
  const invoer = (loonheffing: number): HuishoudenInvoer => ({
    jaar: 2025,
    personen: [{ id: 'A', geboortedatum: '1985-05-01', ondernemingen: [], loon: [{ omschrijving: 'Acme BV', soort: 'loon', bruto: 40000, ingehoudenLoonheffing: loonheffing }], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 } }],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  })

  it('noemt de toegepaste grens en de rente; de oude zinnen staan er niet meer', async () => {
    const { bouw } = await import('@/lib/rapport/__tests__/hulp')
    const V = berekenHuishouden(invoer(0)).personen[0].verschuldigdIB
    const doc = bouw(invoer(V - 40))
    const m = Object.fromEntries(doc.verantwoording.methoden.map((x) => [x.label, x.waarde]))
    expect(m['Aanslag- en teruggaafgrens']).toContain('onder de aanslaggrens van € 57; wordt niet opgelegd')
    expect(m['Belastingrente']).toBe('Niet van toepassing: er is niets bij te betalen.')
    const tekst = doc.verantwoording.nietMeegenomen.join('\n')
    expect(tekst).not.toContain('niet berekend')
    expect(tekst).not.toContain('niet toegepast')
    const bij = bouw(invoer(V - 1000))
    const r = Object.fromEntries(bij.verantwoording.methoden.map((x) => [x.label, x.waarde]))
    expect(r['Belastingrente']).toContain('Geen belastingrente bij aangifte vóór 1 mei 2026')
    expect(r['Belastingrente']).toContain('vanaf 1 juli 2026 5% belastingrente over € 1.000')
  })
})
