import { describe, expect, it } from 'vitest'
import { bedragVoor, bijdrageVan, deelIn, herindeel, schoonIndeling, stelCategorieVoor } from '../indeling'
import type { MbGrootboekRegel, MbJaarImport } from '../types'

const v = (naam: string, soort: string, rgsCode: string | null = null) => stelCategorieVoor({ naam, soort, rgsCode })

describe('stelCategorieVoor', () => {
  it('RGS-code gaat voor', () => {
    expect(v('Opbrengsten', 'revenue', 'WOmzNopOdg')).toEqual({ categorie: 'omzet', reden: 'RGS WOmz: netto-omzet' })
    expect(v('Diversen', 'expenses', 'WAfsMvaInv').categorie).toBe('afschrijving')
    expect(v('Onderhoud', 'expenses', 'WBedAutRoa').categorie).toBe('autokosten')
    expect(v('Rente', 'other_income_expenses', 'WFbeRbaOpb').categorie).toBe('financieel')
    expect(v('Bank', 'expenses', 'WBedAdlBan').categorie).toBe('financieel')
    // Een algemene naam met een specifieke RGS-code voor beperkt aftrekbare kosten.
    expect(v('Overig', 'expenses', 'WBedVkkRep')).toEqual({ categorie: 'beperktAftrekbaar', reden: 'RGS WBedVkkRep: representatiekosten' })
    expect(v('Overig', 'expenses', 'WBedVkkRel').categorie).toBe('beperktAftrekbaar')
    expect(v('Overig', 'expenses', 'WBedVkkKer').categorie).toBe('beperktAftrekbaar')
    expect(v('Overig', 'expenses', 'WBedWkrWkiMmz').categorie).toBe('beperktAftrekbaar')
    expect(v('Overig', 'expenses', 'WBedOvpMlv').categorie).toBe('beperktAftrekbaar')
  })

  it('de gemengde code voor opleidingen en congressen kijkt naar de naam', () => {
    expect(v('Cursussen', 'expenses', 'WBedWkrWkgOsc').categorie).toBe('kosten')
    expect(v('Congressen en seminars', 'expenses', 'WBedWkrWkgOsc').categorie).toBe('beperktAftrekbaar')
  })

  it('zonder RGS: soort en daarna trefwoorden in de naam', () => {
    expect(v('Verkopen', 'revenue').categorie).toBe('omzet')
    expect(v('Koersverschillen', 'other_income_expenses').categorie).toBe('financieel')
    for (const naam of ['Representatie', 'Relatiegeschenken', 'Lunch met klant', 'Zakelijke diners', 'Etentjes', 'Zakelijke maaltijden', 'Congres', 'Seminar', 'Symposium', 'Studiereis Berlijn', 'Kerstpakketten', 'Consumpties', 'Horeca', 'Borrel', 'Eten en drinken']) {
      expect(v(naam, 'expenses').categorie, naam).toBe('beperktAftrekbaar')
    }
    expect(v('Lunch met klant', 'expenses').reden).toBe("naam bevat 'lunch'")
    expect(v('Afschrijving laptop', 'expenses').categorie).toBe('afschrijving')
    expect(v('Brandstof', 'expenses').categorie).toBe('autokosten')
    expect(v('Leasekosten auto', 'expenses').categorie).toBe('autokosten')
    expect(v("Auto's", 'expenses').categorie).toBe('autokosten')
    expect(v('Rentekosten', 'expenses').categorie).toBe('financieel')
    expect(v('Bankkosten', 'expenses').categorie).toBe('financieel')
    expect(v('Kantoorkosten', 'expenses')).toEqual({ categorie: 'kosten', reden: 'Moneybird-soort kosten' })
  })

  it('auto alleen bij expenses, en niet bij automatisering', () => {
    expect(v('Automatiseringskosten', 'expenses').categorie).toBe('kosten')
    expect(v('Autorisatie software', 'expenses').categorie).toBe('kosten')
    expect(v('Brandstof doorbelast', 'direct_costs').categorie).toBe('kosten')
    expect(v('Auto onderdelen', 'direct_costs').categorie).toBe('kosten')
  })

  it('accenten en hoofdletters maken niet uit', () => {
    expect(v('CONSUMPTIËS', 'expenses').categorie).toBe('beperktAftrekbaar')
  })
})

describe('indeling van de gebruiker', () => {
  const info = { ledgerAccountId: '602', naam: 'Representatie', rgsCode: null, soort: 'expenses' }
  it('een keuze gaat altijd voor', () => {
    expect(deelIn(info, { '602': 'kosten' })).toEqual({ categorie: 'kosten', voorstel: 'beperktAftrekbaar', reden: "naam bevat 'representatie'", aangepast: true })
    expect(deelIn(info, {})).toMatchObject({ categorie: 'beperktAftrekbaar', aangepast: false })
    expect(deelIn(info, { '602': 'beperktAftrekbaar' })).toMatchObject({ categorie: 'beperktAftrekbaar', aangepast: true })
    expect(deelIn(info, { '602': 'onzin' as never })).toMatchObject({ categorie: 'beperktAftrekbaar', aangepast: false })
  })

  it('schoonIndeling accepteert alleen id’s en bekende categorieën', () => {
    expect(schoonIndeling({ '1': 'kosten', '22': 'negeren' })).toEqual({ indeling: { '1': 'kosten', '22': 'negeren' } })
    expect('fout' in schoonIndeling({ abc: 'kosten' })).toBe(true)
    expect('fout' in schoonIndeling({ '1': 'iets' })).toBe(true)
    expect('fout' in schoonIndeling([])).toBe(true)
    expect('fout' in schoonIndeling(JSON.parse('{"__proto__": "kosten"}'))).toBe(true)
  })
})

describe('herindelen zonder Moneybird', () => {
  const regel = (p: Partial<MbGrootboekRegel>): MbGrootboekRegel => ({
    ledgerAccountId: '1', naam: 'x', rgsCode: null, soort: 'expenses', bedrag: 0, categorie: 'kosten', voorstel: 'kosten', reden: '', aangepast: false, ...p,
  })
  const imp = {
    regels: [
      regel({ ledgerAccountId: '1', naam: 'Omzet', soort: 'revenue', bedrag: 1000, categorie: 'omzet', voorstel: 'omzet' }),
      regel({ ledgerAccountId: '2', naam: 'Lunch', bedrag: 100, categorie: 'beperktAftrekbaar', voorstel: 'beperktAftrekbaar' }),
      regel({ ledgerAccountId: '3', naam: 'Bankkosten', bedrag: -20, categorie: 'financieel', voorstel: 'financieel' }),
    ],
    totalen: { nettoWinstMoneybird: 880 },
  } as unknown as MbJaarImport

  it('bijdrage en bedrag zijn elkaars omkering, ook voor negeren', () => {
    for (const r of imp.regels) {
      for (const c of ['omzet', 'kosten', 'financieel', 'negeren'] as const) {
        const b = bedragVoor(bijdrageVan(r), { ...r, categorie: c })
        expect(bijdrageVan({ ...r, categorie: c, bedrag: b })).toBe(bijdrageVan(r))
      }
    }
  })

  it('herberekent de totalen; negeren verklaart het verschil', () => {
    const basis = herindeel(imp, {})
    expect(basis.totalen).toMatchObject({ omzet: 1000, beperktAftrekbaar: 100, financieel: -20, nettoWinstIndeling: 880, verschil: 0 })
    const anders = herindeel(imp, { '2': 'kosten', '3': 'negeren' })
    expect(anders.totalen).toMatchObject({ kosten: 100, beperktAftrekbaar: 0, financieel: 0, nettoWinstIndeling: 900, verschil: -20 })
    expect(anders.regels[1]).toMatchObject({ categorie: 'kosten', voorstel: 'beperktAftrekbaar', bedrag: 100, aangepast: true })
    expect(anders.regels[2]).toMatchObject({ categorie: 'negeren', bedrag: -20 })
  })
})

describe('browser en server rekenen de totalen gelijk', () => {
  it('herberekenTotalen (UI) is gelijk aan herindeel (server) na een andere indeling', async () => {
    const { herindeel } = await import('../indeling')
    const { importMetKeuzes } = await import('../../../components/dossier/koppelingen/indeling')
    const { haalJaarImport } = await import('../import')
    const { NEP_ADM, NEP_TOKEN, nepMoneybird } = await import('./fixtures/nep')
    const n = nepMoneybird()
    const imp = await haalJaarImport(NEP_TOKEN, { id: NEP_ADM, naam: 'Studio Voorbeeld' }, 2025, {}, '7', new Date('2026-03-01T10:00:00Z'), { fetch: n.fetch, wacht: async () => undefined })
    const kostenRegels = imp.regels.filter((r) => r.categorie === 'kosten').slice(0, 2)
    const omzetRegel = imp.regels.find((r) => r.categorie === 'omzet')!
    const keuzes = Object.fromEntries([
      ...kostenRegels.map((r, i) => [r.ledgerAccountId, i === 0 ? 'beperktAftrekbaar' : 'negeren'] as const),
      [omzetRegel.ledgerAccountId, 'financieel'] as const,
    ])
    const ui = importMetKeuzes(imp, keuzes).totalen
    const server = herindeel(imp, keuzes).totalen
    for (const k of ['omzet', 'kosten', 'afschrijvingen', 'beperktAftrekbaar', 'autokosten', 'financieel', 'nettoWinstIndeling'] as const) {
      expect(ui[k], k).toBe(server[k])
    }
  })

  it('ook tussen omzet en kosten: dezelfde bedragen per regel, totalen en jaarrekening', async () => {
    const { herindeel, berekenTotalen } = await import('../indeling')
    const { importMetKeuzes } = await import('../../../components/dossier/koppelingen/indeling')
    const { haalJaarImport } = await import('../import')
    const { NEP_ADM, NEP_TOKEN, nepMoneybird } = await import('./fixtures/nep')
    const n = nepMoneybird()
    const imp = await haalJaarImport(NEP_TOKEN, { id: NEP_ADM, naam: 'Studio Voorbeeld' }, 2025, {}, '7', new Date('2026-03-01T10:00:00Z'), { fetch: n.fetch, wacht: async () => undefined })
    const kosten = imp.regels.find((r) => r.categorie === 'kosten' && r.bedrag !== 0)!
    const omzet = imp.regels.find((r) => r.categorie === 'omzet' && r.bedrag !== 0)!
    const financieel = imp.regels.find((r) => r.categorie === 'financieel' && r.bedrag !== 0)!
    const keuzes = { [kosten.ledgerAccountId]: 'omzet', [omzet.ledgerAccountId]: 'kosten', [financieel.ledgerAccountId]: 'kosten' } as const
    const ui = importMetKeuzes(imp, keuzes)
    const server = herindeel(imp, keuzes)
    const kern = (x: typeof imp) => x.regels.map((r) => ({ id: r.ledgerAccountId, categorie: r.categorie, bedrag: r.bedrag, bijdrage: r.bijdrage }))
    expect(kern(ui)).toEqual(kern(server))
    // Het bedrag van de verschoven regels draait om, de bijdrage aan de winst blijft.
    const naKosten = ui.regels.find((r) => r.ledgerAccountId === kosten.ledgerAccountId)!
    expect(naKosten.bedrag).toBe(-kosten.bedrag)
    expect(naKosten.bijdrage).toBe(kosten.bijdrage)
    expect(ui.totalen).toEqual(server.totalen)
    expect(berekenTotalen(ui.regels, imp.totalen.nettoWinstMoneybird)).toEqual(server.totalen)
    expect(server.jaarrekening?.winstEnVerlies?.length).toBeGreaterThan(0)
    expect(ui.jaarrekening).toEqual(server.jaarrekening)
  })
})
