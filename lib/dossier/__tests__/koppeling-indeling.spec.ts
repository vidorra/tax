import { describe, expect, it } from 'vitest'
import type { MbGrootboekRegel, MbJaarImport, MbKoppelingPubliek } from '@/lib/moneybird/types'
import { berekenTotalen, bijdrageVan } from '@/lib/moneybird/indeling'
import { neemOver } from '@/lib/moneybird/overname'
import {
  bronTekst,
  bruikbareKoppelingen,
  echteWijzigingen,
  formatMoment,
  herberekenTotalen,
  importMetKeuzes,
  regelsMetKeuzes,
  teBewarenIndeling,
  voorkeurKoppeling,
} from '@/components/dossier/koppelingen/indeling'

const regel = (id: string, soort: string, bedrag: number, categorie: MbGrootboekRegel['categorie'], extra: Partial<MbGrootboekRegel> = {}): MbGrootboekRegel => ({
  ledgerAccountId: id,
  naam: `Rekening ${id}`,
  rgsCode: null,
  soort,
  bedrag,
  categorie,
  voorstel: categorie,
  reden: 'test',
  aangepast: false,
  ...extra,
})

// omzet 10.000, kosten 1.500 + 500, afschrijving 800, financieel −200 → winst 7.000
const imp: MbJaarImport = {
  koppelingId: '7',
  administratie: { id: '123', naam: 'Meubelmakerij' },
  jaar: 2026,
  opgehaaldOp: '2027-02-01T10:00:00.000Z',
  regels: [
    regel('1', 'revenue', 10000, 'omzet'),
    regel('2', 'expenses', 1500, 'kosten'),
    regel('3', 'expenses', 500, 'kosten'),
    regel('4', 'expenses', 800, 'afschrijving'),
    regel('5', 'other_income_expenses', -200, 'financieel'),
  ],
  totalen: { omzet: 10000, kosten: 2000, afschrijvingen: 800, beperktAftrekbaar: 0, autokosten: 0, financieel: -200, nettoWinstMoneybird: 7000, nettoWinstIndeling: 7000, verschil: 0 },
  balans: { ondernemingsvermogenBegin: null, ondernemingsvermogenEinde: null, forStand: null, onderhandenWerkBegin: null, onderhandenWerkEind: null },
  investeringen: [],
  desinvesteringen: [],
  activa: [],
  opdrachtgevers: [],
  uren: null,
  waarschuwingen: [],
}

describe('herindelen in de browser', () => {
  it('zonder wijzigingen blijven de totalen van de server staan', () => {
    expect(herberekenTotalen(imp, imp.regels)).toEqual(imp.totalen)
    expect(importMetKeuzes(imp, {})).toEqual(imp)
  })

  it('van kosten naar beperkt aftrekbaar: winst gelijk, bedrag verschuift', () => {
    const t = herberekenTotalen(imp, regelsMetKeuzes(imp.regels, { '3': 'beperktAftrekbaar' }))
    expect(t.kosten).toBe(1500)
    expect(t.beperktAftrekbaar).toBe(500)
    expect(t.nettoWinstIndeling).toBe(7000)
    expect(t.verschil).toBe(0)
  })

  it('niet meenemen verhoogt de winst volgens de indeling en geeft een verschil', () => {
    const t = herberekenTotalen(imp, regelsMetKeuzes(imp.regels, { '2': 'negeren' }))
    expect(t.kosten).toBe(500)
    expect(t.nettoWinstIndeling).toBe(8500)
    expect(t.verschil).toBe(-1500)
  })

  it('financiële lasten naar kosten en terug naar de oorspronkelijke categorie', () => {
    const t = herberekenTotalen(imp, regelsMetKeuzes(imp.regels, { '5': 'kosten' }))
    expect(t.financieel).toBe(0)
    expect(t.kosten).toBe(2200)
    expect(t.nettoWinstIndeling).toBe(7000)
    expect(herberekenTotalen(imp, regelsMetKeuzes(imp.regels, { '5': 'financieel' }))).toEqual(imp.totalen)
  })

  it('tussen omzet en kosten draait het teken van het bedrag om; de bijdrage aan de winst blijft', () => {
    const regels = regelsMetKeuzes(imp.regels, { '2': 'omzet', '1': 'kosten' })
    // Kosten 1.500 als omzet: een negatieve omzet. Omzet 10.000 als kosten: een negatieve kostenpost.
    expect(regels[1]).toMatchObject({ categorie: 'omzet', bedrag: -1500, bijdrage: -1500 })
    expect(regels[0]).toMatchObject({ categorie: 'kosten', bedrag: -10000, bijdrage: 10000 })
    for (const [i, r] of regels.entries()) expect(bijdrageVan(r)).toBe(bijdrageVan(imp.regels[i]))
    const t = herberekenTotalen(imp, regels)
    expect(t).toMatchObject({ omzet: -1500, kosten: 500 - 10000, nettoWinstIndeling: 7000, verschil: 0 })
    // De bedragen in de regels tellen op tot dezelfde totalen, zoals de server ze optelt (berekenTotalen).
    expect(berekenTotalen(regels, imp.totalen.nettoWinstMoneybird)).toEqual(t)
  })

  it('financieel tussen baten en kosten: een rentelast als kosten wordt een positieve kostenpost', () => {
    const [r] = regelsMetKeuzes([imp.regels[4]], { '5': 'kosten' })
    expect(r).toMatchObject({ categorie: 'kosten', bedrag: 200, bijdrage: -200 })
    // En terug: weer het oorspronkelijke bedrag.
    expect(regelsMetKeuzes([r], { '5': 'financieel' })[0]).toMatchObject({ categorie: 'financieel', bedrag: -200, bijdrage: -200 })
  })

  it('de jaarrekening volgt de indeling: een regel op niet meenemen wordt een privéboeking', () => {
    const metJaarrekening: MbJaarImport = {
      ...imp,
      jaarrekening: { winstEnVerlies: [{ rubriek: 'omzet', bedrag: 10000 }], bron: 'moneybird' },
      priveMutaties: { onttrekkingen: [{ omschrijving: 'Privé-opnamen', bedrag: 4000 }], stortingen: [] },
    }
    expect(importMetKeuzes(metJaarrekening, {}).jaarrekening).toBe(metJaarrekening.jaarrekening)
    const j = importMetKeuzes(metJaarrekening, { '3': 'negeren', '1': 'kosten' }).jaarrekening!
    expect(j.onttrekkingen).toEqual([
      { omschrijving: 'Privé-opnamen', bedrag: 4000 },
      { omschrijving: 'Rekening 3 (niet in de winst)', bedrag: 500 },
    ])
    // Omzet als kosten: een negatieve kostenpost (zonder RGS-code in de rubriek overig).
    expect(j.winstEnVerlies).toContainEqual({ rubriek: 'overig', bedrag: -10000 + 1500 })
    expect(j.winstEnVerlies?.some((x) => x.rubriek === 'omzet')).toBe(false)
    expect(j.bron).toBe('moneybird')
  })

  it('een eerder genegeerde regel weer meenemen gebruikt het voorstel voor het teken', () => {
    const basis: MbJaarImport = {
      ...imp,
      regels: [...imp.regels, regel('6', 'expenses', 300, 'negeren', { voorstel: 'kosten', aangepast: true })],
      totalen: { ...imp.totalen, verschil: -300, nettoWinstMoneybird: 6700 },
    }
    const t = herberekenTotalen(basis, regelsMetKeuzes(basis.regels, { '6': 'kosten' }))
    expect(t.kosten).toBe(2300)
    expect(t.nettoWinstIndeling).toBe(6700)
    expect(t.verschil).toBe(0)
  })

  it('aangepast-vlag en de indeling om te bewaren', () => {
    const regels = regelsMetKeuzes(imp.regels, { '3': 'beperktAftrekbaar', '4': 'afschrijving' })
    expect(regels[2]).toMatchObject({ categorie: 'beperktAftrekbaar', aangepast: true })
    expect(regels[3]).toBe(imp.regels[3])
    // Elke regel van dit jaar gaat mee: een eigen keuze zet hem, null wist een oude keuze (samenvoegen op de server).
    const bewaar = teBewarenIndeling(regels)
    expect(bewaar['3']).toBe('beperktAftrekbaar')
    expect(Object.entries(bewaar).filter(([, v]) => v !== null)).toEqual([['3', 'beperktAftrekbaar']])
    expect(Object.keys(bewaar).length).toBe(imp.regels.length)
    expect(echteWijzigingen(imp, { '3': 'beperktAftrekbaar', '4': 'afschrijving' })).toEqual({ '3': 'beperktAftrekbaar' })
    // terug naar het voorstel: niet meer bewaren als eigen keuze
    const terug = regelsMetKeuzes(regels, { '3': 'kosten' })
    expect(Object.values(teBewarenIndeling(terug)).every((v) => v === null)).toBe(true)
  })

  it('neemOver gebruikt de opnieuw berekende totalen', () => {
    const o = neemOver(undefined, importMetKeuzes(imp, { '3': 'beperktAftrekbaar' }))
    expect(o.winstberekening).toEqual({ soort: 'uitgesplitst', omzet: 10000, kosten: 1500, afschrijvingen: 800, financieleBatenLasten: -200 })
    expect(o.beperktAftrekbaar).toBe(500)
    expect(o.uren.urencriteriumGehaald).toBe(true)
  })
})

describe('koppelingen en herkomst', () => {
  const k = (id: string, administratieId: string | null, persoon: 'A' | 'B' | null = null): MbKoppelingPubliek => ({
    id,
    label: id,
    bron: 'dossier',
    tokenMasker: '••••abcd',
    administratieId,
    administratieNaam: administratieId ? `Adm ${administratieId}` : null,
    aangemaakt: null,
    laatstGebruikt: null,
    persoon,
  })

  it('alleen koppelingen met een administratie zijn bruikbaar; de eerdere bron gaat voor', () => {
    const lijst = [k('1', null), k('2', '20'), k('3', '30')]
    expect(bruikbareKoppelingen(lijst).map((x) => x.id)).toEqual(['2', '3'])
    expect(voorkeurKoppeling(lijst, undefined)).toBe('2')
    const bron = { soort: 'moneybird' as const, koppelingId: '3', administratieId: '30', jaar: 2026, geimporteerdOp: '2027-02-01T10:00:00.000Z' }
    expect(voorkeurKoppeling(lijst, bron)).toBe('3')
    expect(voorkeurKoppeling(lijst, { ...bron, koppelingId: '1' })).toBe('2')
    // Een bron uit de tijd van de koppeling uit de serverinstellingen ('env') bestaat niet meer: terug naar de voorkeur.
    expect(voorkeurKoppeling(lijst, { ...bron, koppelingId: 'env' })).toBe('2')
    expect(voorkeurKoppeling([k('1', null)], undefined)).toBeNull()
  })

  it('van wie: de onderneming van een persoon kiest diens koppeling en nooit vanzelf die van de ander', () => {
    const lijst = [k('1', '10', 'A'), k('2', '20', 'B'), k('3', '30', null)]
    expect(voorkeurKoppeling(lijst, undefined, 'A')).toBe('1')
    expect(voorkeurKoppeling(lijst, undefined, 'B')).toBe('2')
    // Partner zonder eigen koppeling: een koppeling die aan niemand hangt, anders niets (zelf kiezen).
    expect(voorkeurKoppeling([k('1', '10', 'A'), k('3', '30', null)], undefined, 'B')).toBe('3')
    expect(voorkeurKoppeling([k('1', '10', 'A')], undefined, 'B')).toBeNull()
    // Wat eerder is geïmporteerd, gaat voor, ook als het van de ander is.
    const bron = { soort: 'moneybird' as const, koppelingId: '1', administratieId: '10', jaar: 2026, geimporteerdOp: '2027-02-01T10:00:00.000Z' }
    expect(voorkeurKoppeling(lijst, bron, 'B')).toBe('1')
  })

  it('herkomstregel met een Nederlandse datum', () => {
    expect(formatMoment('2027-02-01T10:00:00.000Z')).toBe('1 februari 2027')
    expect(formatMoment('2027-02-01T10:00:00.000Z', true)).toBe('1 februari 2027 om 11:00')
    expect(formatMoment('2026-12-31T23:30:00.000Z')).toBe('1 januari 2027')
    expect(formatMoment('kapot')).toBe('kapot')
    expect(
      bronTekst({ soort: 'moneybird', koppelingId: '7', administratieId: '123', administratieNaam: 'Meubelmakerij', jaar: 2026, geimporteerdOp: '2027-02-01T10:00:00.000Z' }),
    ).toBe('Cijfers uit Moneybird (administratie Meubelmakerij), opgehaald op 1 februari 2027')
  })
})
