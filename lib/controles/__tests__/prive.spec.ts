import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, PersoonInvoer } from '@/lib/tax/types'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import { controleer } from '../index'
import { PRIVE_REGELS } from '../regels/prive'
import type { ControleContext } from '../types'

const persoon = (extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id: 'A',
  geboortedatum: '1985-03-01',
  ondernemingen: [],
  loon: [{ id: 'loon-1', omschrijving: 'Acme BV', soort: 'loon', bruto: 60000, ingehoudenLoonheffing: 0 }],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...extra,
})

function ctx(invoer: HuishoudenInvoer, extra: Partial<ControleContext> = {}): ControleContext {
  return { jaar: invoer.jaar, invoer, resultaat: berekenHuishouden(invoer), params: getJaar(invoer.jaar), status: 'concept', vandaag: '2026-10-05', ...extra }
}
const ids = (c: ControleContext) => controleer(c, PRIVE_REGELS).alle.map((x) => x.id)

const basis = (jaar: number, p: PersoonInvoer = persoon()): HuishoudenInvoer => ({
  jaar,
  personen: [p],
  fiscaalPartner: false,
  kinderen: [],
  box3: { posities: [], schulden: [] },
  verdeling: 'optimaal',
})

describe('controles aanslag en privé', () => {
  it('va-te-laag: verstreken jaar zonder voorlopige aanslag, veel bij te betalen', () => {
    const c = ctx(basis(2025))
    const v = controleer(c, PRIVE_REGELS).alle.find((x) => x.regel === 'va-te-laag')
    expect(v).toMatchObject({ id: 'va-te-laag:A', ernst: 'let-op', negeren: 'gezien', veld: 'persoon:A/voorlopigeAanslagIB' })
    expect(v?.vingerafdruk).toMatch(/^verschil=\d+$/)
  })

  it('va-te-laag: de uitleg past bij vandaag (vóór 1 mei, tussen 1 mei en 1 juli, daarna)', () => {
    const uitleg = (vandaag: string) => controleer(ctx(basis(2025), { vandaag }), PRIVE_REGELS).alle.find((x) => x.regel === 'va-te-laag')?.uitleg ?? ''
    expect(uitleg('2026-10-05')).toMatch(/Sinds 1 juli 2026 loopt daarover belastingrente tot de aanslag er is: nu ongeveer € [\d.]+ per jaar\. Een hogere voorlopige aanslag beperkt dat\.$/)
    expect(uitleg('2026-05-15')).toMatch(/Komt de aanslag na 1 juli 2026, dan kost dat ongeveer € [\d.]+ per jaar belastingrente\. Je voorkomt dat met een hogere voorlopige aanslag\.$/)
  })

  it('va-te-laag niet in het lopende jaar zonder indieningsdatum, niet bij aangifte vóór 1 mei en niet als ingediend', () => {
    expect(ids(ctx(basis(2026)))).not.toContain('va-te-laag:A')
    expect(ids(ctx(basis(2025), { staat: { versie: 1, planning: { indieningsdatum: '2026-04-15' } } }))).not.toContain('va-te-laag:A')
    expect(ids(ctx(basis(2025), { status: 'ingediend' }))).not.toContain('va-te-laag:A')
  })

  it('va-te-laag niet als de voorlopige aanslag klopt', () => {
    const r = berekenHuishouden(basis(2025))
    const p = persoon({ voorlopigeAanslagIB: r.personen[0].verschuldigdIB })
    expect(ids(ctx(basis(2025, p)))).not.toContain('va-te-laag:A')
  })

  it('ew-schuld-box3 bij een nieuwe aflossingsvrije lening; niet meer zodra de schuld uit de doorrol in box 3 staat; ew-dubbel bij een tweede', () => {
    const inv = basis(2026)
    inv.eigenWoning = { woz: 400000, leningdelen: [{ id: 'ld-1', omschrijving: 'Aflossingsvrij', hoofdsom: 100000, startdatum: '2026-02-01', aflossingsvorm: 'aflossingsvrij', rente: 3000 }] }
    expect(ids(ctx(inv))).toContain('ew-schuld-box3:ld-1')
    inv.box3.schulden = [
      { id: 'schuld-ew-ld-1', omschrijving: 'Aflossingsvrij, deel box 3', eigenaar: 'A', waardeBegin: 100000, herkomst: { bron: 'eigenwoningschuld', jaar: 2025, sleutel: 'ld-1' } },
      { id: 'schuld-1', omschrijving: 'Hypotheek box 3', eigenaar: 'A', waardeBegin: 100000 },
    ]
    const c = ctx(inv)
    expect(ids(c)).not.toContain('ew-schuld-box3:ld-1')
    const dubbel = controleer(c, PRIVE_REGELS).alle.find((x) => x.regel === 'ew-dubbel')
    expect(dubbel).toMatchObject({ id: 'ew-dubbel:schuld-1', ernst: 'fout', negeren: 'met-reden', veld: 'box3/schuld:schuld-1/waardeBegin' })
  })

  it('ewr-vervalt binnen zes maanden (EW5: vanaf 1-9-2028)', () => {
    const inv = basis(2028)
    inv.eigenWoning = { woz: 0, eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2026-03-01', bedrag: 71000 }] }
    expect(ids(ctx(inv, { vandaag: '2028-09-01' }))).toContain('ewr-vervalt:A:2026-03-01')
    expect(ids(ctx(inv, { vandaag: '2028-08-31' }))).not.toContain('ewr-vervalt:A:2026-03-01')
  })

  it('box2-verlies-vervallen (let op) en box2-verlies-dit-jaar (info)', () => {
    const inv = basis(2026, persoon({ box2Verliezen: [{ jaar: 2019, bedrag: 30000 }] }))
    inv.box2 = [{ id: 'ab-1', eigenaar: 'A', dividend: 0, ingehoudenDividendbelasting: 0, vervreemdingsvoordeel: -5000 }]
    const alle = controleer(ctx(inv), PRIVE_REGELS).alle
    expect(alle.find((x) => x.regel === 'box2-verlies-vervallen')).toMatchObject({ ernst: 'let-op', vingerafdruk: '2019=30000' })
    expect(alle.find((x) => x.regel === 'box2-verlies-dit-jaar')).toMatchObject({ ernst: 'info' })
  })

  it('ew-partner-reserve bij een aankoop door partners met een reserve', () => {
    const inv = basis(2026)
    inv.personen.push({ ...persoon(), id: 'B', loon: [] })
    inv.fiscaalPartner = true
    inv.eigenWoning = {
      woz: 500000,
      eigenwoningreserve: [{ eigenaar: 'A', datumToevoeging: '2025-09-01', bedrag: 100000 }],
      aankoop: { leverdatum: '2026-04-01', koopsom: 500000, kostenKoper: 0, aandeelA: 0.5 },
      leningdelen: [{ id: 'ld-1', omschrijving: 'Hypotheek', hoofdsom: 450000, startdatum: '2026-04-01', aflossingsvorm: 'annuitair', rente: 9000 }],
    }
    expect(ids(ctx(inv))).toContain('ew-partner-reserve')
  })
})
