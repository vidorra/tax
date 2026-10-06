import { describe, expect, it } from 'vitest'
import { invoerPaden, KOLOMMEN, platteRegels, platteSecties } from '@/lib/rapport/plat'
import type { RapportDocument } from '@/lib/rapport/model'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { voorbeeldRapport, voorbeeldRapportPartner } from './rapport-voorbeeld'

function aantalBedragen(doc: RapportDocument): number {
  let n = 0
  for (const ps of platteSecties(doc))
    for (const b of ps.sectie.blokken) if (b.soort === 'tabel') for (const r of b.regels) for (const k of KOLOMMEN) if (typeof r.bedragen?.[k] === 'number') n++
  return n
}

describe('platteSecties', () => {
  it('nummert doorlopend op positie als het nummer ontbreekt en neemt een ingevuld nummer over', () => {
    const a = platteSecties(voorbeeldRapport())
    expect(a.map((s) => s.nummer).slice(0, 9)).toEqual(['1', '2', '2.1', '2.2', '2.2.1', '2.2.2', '2.2.3', '2.2.4', '2.3'])
    expect(a.find((s) => s.nummer === '4.4.1')?.sectie.titel).toBe('Voorkoming dubbele belasting')
    expect(a.find((s) => s.nummer === '5.6.2')?.hoofdstukNummer).toBe('5')
    const b = platteSecties(voorbeeldRapportPartner())
    expect(b.map((s) => s.nummer)).toEqual(['1', '2', '2.1'])
  })
})

describe('platteRegels', () => {
  const docs = [voorbeeldRapport(), voorbeeldRapportPartner()]
  const regels = platteRegels(docs)

  it('geeft één rij per bedrag, over beide documenten', () => {
    expect(regels.length).toBe(aantalBedragen(docs[0]) + aantalBedragen(docs[1]))
    expect(regels.filter((r) => r.persoon === 'B').length).toBe(aantalBedragen(docs[1]))
    for (const p of ['A', 'B'] as const) {
      const sleutels = regels.filter((r) => r.persoon === p).map((r) => `${r.regelId}|${r.kolom}`)
      expect(new Set(sleutels).size).toBe(sleutels.length)
    }
  })

  it('vult jaar, persoon, hoofdstuk, paragraaf, kolom, soort en herkomst', () => {
    expect(regels[0]).toEqual({
      jaar: 2024,
      persoon: 'A',
      naam: 'Persoon A',
      hoofdstuk: '2 Inkomstenbelasting en premieheffing',
      paragraaf: '2.1 Drempel-/ verzamel-/ belastbaar inkomen',
      regelId: '2.1.winst',
      omschrijving: 'Belastbare winst uit onderneming',
      kolom: 'B',
      peildatum: null,
      bedrag: 127935,
      soort: 'post',
      herkomst: 'personen[0].belastbareWinst',
    })
  })

  it('geeft een subtotaal zonder label de groepskop als omschrijving en neemt peildata over', () => {
    const bank = regels.filter((r) => r.regelId === '3.2.1.bank-nl')
    expect(bank.map((r) => [r.kolom, r.peildatum, r.bedrag, r.omschrijving])).toEqual([
      ['B', 'begin', 50900, 'Vermogen op bank- en spaarrekeningen in Nederland'],
      ['C', 'eind', 50200, 'Vermogen op bank- en spaarrekeningen in Nederland'],
    ])
    expect(bank[0].paragraaf).toBe('3.2.1 Waarde van bezittingen')
    expect(regels.find((r) => r.regelId === '4.1.1.2023.som')?.omschrijving).toBe('2023')
    expect(regels.find((r) => r.regelId === '3.1.2.totaal-leningen' && r.kolom === 'Z')?.omschrijving).toBe('Eigenwoningschuld(en) aangegaan bij een Nederlandse bank of financiële instelling, óf aangegaan vóór 2013, of een lening die voldoet aan de aflossingseis')
  })

  it('telt percentages en tekstcellen niet mee', () => {
    expect(regels.some((r) => r.regelId === '5.6.1.boekjaar')).toBe(false)
    const rendement = regels.filter((r) => r.regelId === '3.2.3.rendement-bank-nl')
    expect(rendement.map((r) => r.kolom)).toEqual(['Z', 'B'])
  })

  it('gebruikt de nummers uit het model van de partner', () => {
    expect(regels.find((r) => r.persoon === 'B' && r.regelId === '2.1.te-ontvangen')?.paragraaf).toBe('2.1 Voorlopige aanslagen en teruggaven')
  })
})

describe('invoerPaden', () => {
  it('maakt pad-waardeparen van geneste objecten en lijsten', () => {
    const paden = invoerPaden({ a: 1, b: { c: [1, { d: 'x' }], e: [], f: {}, g: null, h: undefined, i: true, 'j-k': 's' } })
    expect(paden).toEqual([
      { pad: 'a', waarde: 1 },
      { pad: 'b.c[0]', waarde: 1 },
      { pad: 'b.c[1].d', waarde: 'x' },
      { pad: 'b.e', waarde: '[]' },
      { pad: 'b.f', waarde: '{}' },
      { pad: 'b.g', waarde: null },
      { pad: 'b.i', waarde: true },
      { pad: 'b["j-k"]', waarde: 's' },
    ])
    expect(invoerPaden({ n: Number.NaN })).toEqual([{ pad: 'n', waarde: 'NaN' }])
  })

  it('leest een volledige invoer (het voorbeeldhuishouden)', () => {
    const paden = invoerPaden(voorbeeldInvoer(2024))
    expect(paden).toContainEqual({ pad: 'jaar', waarde: 2024 })
    expect(paden).toContainEqual({ pad: 'personen[0].inkomensvoorziening.lijfrentePremies', waarde: 9800 })
    expect(paden).toContainEqual({ pad: 'kinderen[0].opvang[0].soort', waarde: 'dagopvang' })
    expect(paden).toContainEqual({ pad: 'personen[1].loon', waarde: '[]' })
    expect(paden.every((p) => p.pad.length > 0)).toBe(true)
  })
})
