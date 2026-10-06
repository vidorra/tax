/**
 * Ronde 2, contract na de toets: parameters, de periodetabel belastingrente en de gedeelde hulpfuncties die alle
 * bouwagents gebruiken (bronbelastingregels, standaard "zit al in het saldo", correctie partner in de onderneming).
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, OndernemingInvoer } from '../types'
import { BESCHIKBARE_JAREN, getJaar } from '../years'
import { BELASTINGRENTE_IB } from '../years/data/belastingrente'
import { bronbelastingRegels, landCode, OUDE_BRONBELASTING_ID } from '../modules/box3/bronbelasting-invoer'
import { standaardInSaldo, zitInSaldo } from '../modules/onderneming/in-saldo'
import { berekenOnderneming } from '../modules/onderneming'
import { vulIds, itemSleutel } from '@/lib/dossier/ids'

const volgendeDag = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

describe('periodetabel belastingrente', () => {
  it('is oplopend en aansluitend, met alleen de laatste periode open', () => {
    for (let i = 1; i < BELASTINGRENTE_IB.length; i++) {
      const vorige = BELASTINGRENTE_IB[i - 1]
      expect(vorige.tot).not.toBeNull()
      expect(BELASTINGRENTE_IB[i].vanaf).toBe(volgendeDag(vorige.tot!))
    }
    expect(BELASTINGRENTE_IB[BELASTINGRENTE_IB.length - 1].tot).toBeNull()
  })

  it('2027 staat geschat op 5,5%, gelijk aan overig.belastingrenteIB van 2027', () => {
    const p2027 = BELASTINGRENTE_IB.find((x) => x.vanaf === '2027-01-01')!
    expect(p2027.pct).toBe(0.055)
    expect(p2027.status).toBe('geschat')
    expect(getJaar(2027).overig.waarde.belastingrenteIB).toBe(p2027.pct)
  })
})

describe('jaarparameters na de toets', () => {
  it('de drempel voor arbeidsbeloning aan de partner staat in één veld: meewerkaftrek.maxVergoeding = 5.000', () => {
    for (const j of BESCHIKBARE_JAREN()) {
      const o = getJaar(j).ondernemer.waarde as unknown as Record<string, unknown>
      expect(getJaar(j).ondernemer.waarde.meewerkaftrek.maxVergoeding).toBe(5000)
      expect(o.arbeidsbeloningPartnerMin).toBeUndefined()
    }
  })

  it('overgangsrecht youngtimer: alleen auto die op 31-12-2025 al youngtimer was; 2021-2025 geen', () => {
    for (const j of [2021, 2022, 2023, 2024, 2025]) expect(getJaar(j).ondernemer.waarde.auto.youngtimerOvergang).toBeNull()
    for (const j of [2027, 2028]) {
      expect(getJaar(j).ondernemer.waarde.auto.youngtimerOvergang).toEqual({ terBeschikkingUiterlijk: '2025-12-31', youngtimerOp: '2025-12-31', oudeLeeftijd: 15 })
    }
  })

  it('2027: aanslaggrens 58 en grens rendementsgrondslag 38.959 (2026 × 1,01248, naar beneden)', () => {
    const o = getJaar(2027).overig.waarde
    expect(o.aanslaggrens).toBe(58)
    expect(o.aanslagRendementsgrondslag).toBe(Math.floor(getJaar(2026).overig.waarde.aanslagRendementsgrondslag * 1.01248))
  })
})

describe('bronbelastingRegels: één lezer voor oud en nieuw', () => {
  it('leest het oude veld als één regel met een ISO-code', () => {
    const r = bronbelastingRegels({ bronbelasting: { land: 'Duitsland', bedrag: 26, brutoInkomsten: 100 } })
    expect(r).toEqual([{ id: OUDE_BRONBELASTING_ID, land: 'DE', soort: 'dividend', brutoInkomsten: 100, bedrag: 26 }])
  })

  it('laat een onbekend land als tekst staan en geeft de nieuwe regels ongewijzigd terug', () => {
    expect(bronbelastingRegels({ bronbelasting: { land: 'Zuid-Afrika', bedrag: 5, brutoInkomsten: 50 } })[0].land).toBe('Zuid-Afrika')
    const nieuw = [{ id: 'bb-1', land: 'CH', soort: 'dividend' as const, brutoInkomsten: 5000, bedrag: 1750 }]
    expect(bronbelastingRegels({ bronbelastingen: nieuw, bronbelasting: { land: 'DE', bedrag: 1, brutoInkomsten: 1 } })).toBe(nieuw)
    expect(bronbelastingRegels({})).toEqual([])
    expect(landCode('vs')).toBe('US')
    expect(landCode('ch')).toBe('CH')
  })
})

describe('standaard "zit al in het saldo"', () => {
  it('volgt de herkomst van de winst; een expliciet antwoord gaat voor', () => {
    expect(standaardInSaldo(undefined, 'hir')).toBe(false)
    expect(standaardInSaldo({ winstBron: 'fiscaal-rapport' }, 'hir')).toBe(true)
    expect(standaardInSaldo({}, 'autoBtw')).toBe(true)
    expect(standaardInSaldo({}, 'stakingPostPrive')).toBe(false)
    expect(zitInSaldo(true, {}, 'egalisatie')).toBe(true)
    expect(zitInSaldo(undefined, { winstBron: 'boekhouding' }, 'egalisatie')).toBe(false)
  })
})

describe('correctie partner in berekenOnderneming', () => {
  const o: OndernemingInvoer = { naam: 'Ontwerpstudio', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 1600 }, startjaar: 2015 }
  const ctx = { params: getJaar(2026), jaar: 2026, aowBereikt: false, urenLoondienst: 0 }

  it('telt de correctie mee in de winst (P1: beloning 6.000 buiten de kosten geeft 54.000)', () => {
    const zonder = berekenOnderneming(o, ctx)
    const met = berekenOnderneming(o, { ...ctx, correctiePartner: -6000 })
    expect(zonder.winst).toBe(60000)
    expect(met.winst).toBe(54000)
    expect(met.correctiePartner).toBe(-6000)
    expect(zonder.correctiePartner).toBeUndefined()
  })
})

describe('vaste id\'s voor lijstitems', () => {
  const invoer = (): HuishoudenInvoer =>
    ({
      jaar: 2026,
      personen: [{ id: 'A', geboortedatum: '1988-01-01', ondernemingen: [], loon: [{ omschrijving: 'Acme BV', soort: 'loon', bruto: 1, ingehoudenLoonheffing: 0 }, { omschrijving: 'Beta', soort: 'loon', bruto: 2, ingehoudenLoonheffing: 0 }], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 } }],
      kinderen: [],
      fiscaalPartner: false,
      box3: { posities: [], schulden: [] },
      verdeling: 'optimaal',
    }) as unknown as HuishoudenInvoer

  it('deterministisch: dezelfde invoer geeft dezelfde id\'s, bestaande id\'s blijven', () => {
    const a = vulIds(invoer())
    const b = vulIds(invoer())
    expect(a.personen[0].loon.map((l) => l.id)).toEqual(['loon-1', 'loon-2'])
    expect(b.personen[0].loon.map((l) => l.id)).toEqual(['loon-1', 'loon-2'])
    // Na weghalen van de eerste houdt de tweede zijn id.
    a.personen[0].loon.shift()
    vulIds(a)
    expect(a.personen[0].loon.map((l) => l.id)).toEqual(['loon-2'])
  })

  it('willekeurig voor nieuwe items in de editor, zonder botsing', () => {
    const d = vulIds(invoer())
    d.personen[0].loon.push({ omschrijving: 'Nieuw', soort: 'loon', bruto: 3, ingehoudenLoonheffing: 0 })
    let n = 0
    vulIds(d, (prefix) => `${prefix}-${n++ === 0 ? '1' : 'x9'}`)
    expect(d.personen[0].loon.map((l) => l.id)).toEqual(['loon-1', 'loon-2', 'loon-x9'])
    expect(itemSleutel(d.personen[0].loon[2], 2)).toBe('loon-x9')
    expect(itemSleutel({}, 4)).toBe('4')
  })
})
