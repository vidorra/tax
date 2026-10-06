/**
 * Het rapportmodel buiten het voorbeeldhuishouden: zonder partner, zonder onderneming, alleen loon, een dossier 2027, twee
 * ondernemingen en een uitgesplitste winstberekening. Plus de algemene eisen: nummering over wat er staat, geen
 * dubbele regel-id's en geen em-dashes of pijlen in wat de lezer ziet.
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { nummer } from '../nummering'
import { uniekeSlugs } from '../secties/bouwstenen'
import type { RapportDocument } from '../model'
import { alleIds, alleRegels, alleSecties, alleTeksten, bouw, kloon, regelMap, vergelijk } from './hulp'

// Het verzonnen voorbeeldhuishouden (lib/voorbeeld); persoon A heeft een jaarrekening, B niet.
const inv2024 = voorbeeldInvoer(2024)
const inv2021 = voorbeeldInvoer(2021)
const zonderJaarrekening = (invoer: HuishoudenInvoer): HuishoudenInvoer => {
  const kopie = kloon(invoer)
  for (const p of kopie.personen) for (const o of p.ondernemingen) delete o.jaarrekening
  return kopie
}

const nummers = (doc: RapportDocument) => alleSecties(doc).map((s) => `${s.nummer} ${s.titel}`)
const titels = (doc: RapportDocument) => doc.hoofdstukken.map((h) => `${h.nummer} ${h.titel}`)

function algemeneEisen(doc: RapportDocument) {
  const ids = alleIds(doc)
  const dubbel = ids.filter((id, i) => ids.indexOf(id) !== i)
  expect(dubbel, 'dubbele regel-id').toEqual([])
  for (const t of alleTeksten(doc)) {
    expect(/[\u2013\u2014\u2192]/.test(t), `em-dash of pijl in: ${t}`).toBe(false)
  }
  for (const r of alleRegels(doc)) {
    for (const v of Object.values(r.bedragen ?? {})) {
      expect(Number.isInteger(v), `${r.id} heel getal`).toBe(true)
      expect(Object.is(v, -0), `${r.id} geen -0`).toBe(false)
    }
  }
  // Nummering doorlopend: per niveau 1, 2, 3, ...
  const loop = (secties: RapportDocument['hoofdstukken'], voor: string) =>
    secties.forEach((s, i) => {
      expect(s.nummer).toBe(voor ? `${voor}.${i + 1}` : String(i + 1))
      loop(s.secties, s.nummer ?? '')
    })
  loop(doc.hoofdstukken, '')
}

const enkel = { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 }

describe('algemene eisen op het voorbeeld', () => {
  for (const [naam, invoer] of [
    ['2024', inv2024],
    ['2021', inv2021],
    ['2024 zonder jaarrekening', zonderJaarrekening(inv2024)],
  ] as const) {
    for (const persoon of ['A', 'B'] as const) {
      it(`${naam}, persoon ${persoon}`, () => algemeneEisen(bouw(invoer, persoon)))
    }
  }

  it('geen begeleidende brief of BSN in het rapport', () => {
    const tekst = alleTeksten(bouw(inv2024)).join('\n')
    // Geen aanhef of afsluiting van een brief en geen BSN als label met nummer; de verantwoording noemt het woord wel.
    expect(tekst).not.toMatch(/Geachte|Hoogachtend|Met vriendelijke groet|\bBSN:|Burgerservicenummer\s+\d/)
    expect(tekst).not.toMatch(/\b\d{9}\b/)
  })
})

describe('huishouden zonder partner', () => {
  const invoer = kloon(inv2024)
  invoer.fiscaalPartner = false
  invoer.personen = invoer.personen.filter((p) => p.id === 'A')
  for (const x of [...invoer.box3.posities, ...invoer.box3.schulden]) x.eigenaar = 'A'
  invoer.verdeling = enkel
  const doc = bouw(invoer)
  const r = regelMap(doc)

  it('geen partnergegevens, alleenstaand', () => {
    const gegevens = doc.hoofdstukken[0].blokken.find((b) => b.soort === 'gegevens')
    expect(gegevens?.soort === 'gegevens' && gegevens.rijen.map((x) => x.label)).toEqual(['Naam', 'Geboortedatum', 'Persoonlijke situatie'])
    expect(alleTeksten(doc)).toContain('Persoon A heeft in 2024 geen fiscale partner.')
  })

  it('geen verdeelregels; heffingsvrij vermogen en schuldendrempel voor één persoon', () => {
    expect(r.has('3.1.2.naar-partner')).toBe(false)
    expect(r.get('3.1.2.saldo')?.bedragen?.C).toBe(-6418)
    expect(r.has('3.2.3.deel-eigen')).toBe(false)
    expect(r.get('3.2.3.heffingsvrij')?.bedragen?.B).toBe(-57000)
    expect(r.get('3.2.2.drempel')?.bedragen?.B).toBe(-3700)
    expect(r.has('4.2.naar-partner')).toBe(false)
    expect(r.get('4.2.toegerekend')?.bedragen?.C).toBe(38)
    expect(doc.verantwoording.uitkomsten).toHaveLength(3)
    expect(doc.verantwoording.methoden.some((m) => m.label === 'Verdeling gezamenlijke posten')).toBe(false)
  })

  it('algemene eisen', () => algemeneEisen(doc))
})

describe('huishouden zonder onderneming', () => {
  const invoer = kloon(inv2024)
  invoer.personen[0].ondernemingen = []
  delete invoer.personen[0].voorlopigeAanslagZvw
  const doc = bouw(invoer)

  it('geen winstaangifte, geen ondernemersaftrek; de nummering schuift door', () => {
    expect(titels(doc)).toEqual(['1 Persoonlijke gegevens', '2 Inkomstenbelasting en premieheffing', '3 Belastbaar inkomen', '4 Bijlagen'])
    const n = nummers(doc)
    expect(n).toContain('3.1.1 Inkomsten uit eigen woning')
    expect(n).toContain('3.1.2 Uitgaven voor inkomensvoorziening')
    expect(n.some((x) => x.endsWith('Zorgverzekeringswet (Zvw)'))).toBe(false)
    expect(regelMap(doc).has('3.1.2.saldo')).toBe(true)
    expect(doc.verantwoording.nietMeegenomen).toContain('Winstaangifte en ondernemersaftrek: weggelaten, er is geen onderneming ingevoerd.')
  })

  it('algemene eisen', () => algemeneEisen(doc))
})

describe('alleen loon', () => {
  const invoer: HuishoudenInvoer = {
    jaar: 2024,
    fiscaalPartner: false,
    kinderen: [],
    personen: [
      {
        id: 'A',
        geboortedatum: '1985-03-01',
        ondernemingen: [],
        loon: [{ omschrijving: 'Loon', soort: 'loon', bruto: 52000, ingehoudenLoonheffing: 14000, zvwBijdrageloon: 52000 }],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
      },
    ],
    box3: { posities: [], schulden: [] },
    verdeling: enkel,
  }
  const doc = bouw(invoer)
  const r = regelMap(doc)

  it('alleen de hoofdstukken met inhoud, nummering doorlopend', () => {
    expect(titels(doc)).toEqual(['1 Persoonlijke gegevens', '2 Inkomstenbelasting en premieheffing', '3 Belastbaar inkomen'])
    expect(nummers(doc)).toEqual([
      '1 Persoonlijke gegevens',
      '2 Inkomstenbelasting en premieheffing',
      '2.1 Drempel-/ verzamel-/ belastbaar inkomen',
      '2.2 Belastingberekening',
      '2.2.1 Verschuldigde inkomstenbelasting en premie volksverzekeringen',
      '2.2.2 Heffingskortingen',
      '2.2.3 Voorheffingen',
      '2.2.4 Voorlopige aanslagen en teruggaven',
      '3 Belastbaar inkomen',
      '3.1 Toelichting belastbaar inkomen uit werk en woning (box 1)',
      '3.1.1 Berekening belastbaar inkomen',
    ])
  })

  it('loon, loonheffing en heffingskortingen', () => {
    expect(r.get('2.1.loon')?.bedragen?.B).toBe(52000)
    expect(r.get('2.2.3.loonheffing')?.bedragen?.B).toBe(14000)
    for (const soort of ['algemeen', 'arbeid']) {
      const k = r.get(`2.2.2.${soort}`)?.bedragen
      expect(k?.B).toBeGreaterThan(0)
      expect((k?.Z ?? 0) + (k?.A ?? 0)).toBe(k?.B)
    }
    const kortingen = (r.get('2.2.2.algemeen')?.bedragen?.B ?? 0) + (r.get('2.2.2.arbeid')?.bedragen?.B ?? 0)
    expect(r.get('2.2.2.maximaal')?.bedragen?.C).toBe(-kortingen)
  })

  it('verantwoording noemt wat is weggelaten', () => {
    const t = doc.verantwoording.nietMeegenomen.join('\n')
    expect(t).toContain('Zorgverzekeringswet: weggelaten')
    expect(t).toContain('box 3): weggelaten')
    expect(t).toContain('Persoonsgebonden aftrek: weggelaten')
    expect(t).toContain('Winstaangifte en ondernemersaftrek: weggelaten')
  })

  it('algemene eisen', () => algemeneEisen(doc))
})

describe('dossier 2027', () => {
  const invoer = kloon(inv2024)
  invoer.jaar = 2027
  const doc = bouw(invoer)

  it('bouwt met de parameters van 2027, zonder jaartallen uit het voorbeeld', () => {
    expect(doc.titel).toBe('Fiscaal rapport aangifte inkomstenbelasting 2027')
    expect(titels(doc)).toContain('5 Winstaangifte 2027 van Meubelmakerij')
    const box3 = alleSecties(doc).find((s) => s.titel === 'Waarde van bezittingen')
    const koppen = box3?.blokken[0].soort === 'tabel' ? box3.blokken[0].koppen?.map((k) => k.regels[0]) : []
    expect(koppen).toEqual(['01-01-2027', '31-12-2027'])
    expect(regelMap(doc).get('4.1.1.2027.inkomen')?.label).toBe('Inkomsten in 2026')
    expect(regelMap(doc).has('4.1.1.2016.jaar')).toBe(false)
  })

  it('algemene eisen', () => algemeneEisen(doc))
})

describe('twee ondernemingen', () => {
  const invoer = kloon(inv2024)
  const tweede: OndernemingInvoer = {
    naam: 'Fotografie',
    winstberekening: { soort: 'uitgesplitst', omzet: 20000, kosten: 5000, afschrijvingen: 1000, financieleBatenLasten: -50 },
    beperktAftrekbaar: 300,
    investeringen: [{ omschrijving: 'Objectief', datum: '2024-05-01', bedrag: 3000, regeling: 'kia' }],
    uren: { onderneming: 200 },
    startjaar: 2020,
  }
  invoer.personen[0].ondernemingen.push(tweede)
  const doc = bouw(invoer)
  const r = regelMap(doc)

  it('een hoofdstuk per onderneming, ondernemersaftrek daarna', () => {
    expect(titels(doc)).toEqual([
      '1 Persoonlijke gegevens',
      '2 Inkomstenbelasting en premieheffing',
      '3 Belastbaar inkomen',
      '4 Bijlagen',
      '5 Winstaangifte 2024 van Meubelmakerij',
      '6 Winstaangifte 2024 van Fotografie',
      '7 Ondernemersaftrek',
    ])
  })

  it('3.1.1 telt beide saldi op; de uitgesplitste winstberekening staat in grove rubrieken en sluit', () => {
    const saldo2 = 20000 - 50 - 5000 - 1000 - 300
    expect(r.get('3.1.1.onderneming.2')?.bedragen?.B).toBe(saldo2)
    expect(r.get('3.1.1.fiscale-winstberekening')?.bedragen?.C).toBe(152340 + saldo2)
    expect(r.get('3.1.1.onderneming.1')?.streepOnder).toBeUndefined()
    expect(r.get('3.1.1.onderneming.2')?.streepOnder).toEqual(['B'])
    const F = '5.fotografie.3'
    vergelijk(doc, {
      [`${F}.omzet`]: { C: 20000 },
      [`${F}.opbrengsten.totaal`]: { C: 20000 },
      [`${F}.afschrijvingen.totaal`]: { C: -1000 },
      [`${F}.beperktAftrekbaar`]: { C: 300 },
      [`${F}.overig`]: { C: 5000 },
      [`${F}.overige-kosten.totaal`]: { C: -5300 },
      [`${F}.financieel.totaal`]: { C: -50 },
      [`${F}.saldo`]: { C: saldo2 },
    })
    expect(r.get('5.fotografie.6.2.middel.1')?.bedragen).toEqual({ A: 3000, B: 3000, C: 840 })
    expect(doc.verantwoording.nietMeegenomen.some((t) => t.startsWith('Fotografie: geen jaarrekening ingevoerd'))).toBe(true)
  })

  it('dubbele namen krijgen een eigen id', () => {
    expect(uniekeSlugs(['Meubelmakerij', 'Meubelmakerij', 'Café'])).toEqual(['meubelmakerij', 'meubelmakerij-2', 'cafe'])
  })

  it('algemene eisen', () => algemeneEisen(doc))
})

describe('nummering', () => {
  it('na een weggevallen paragraaf schuift de nummering, de regel-id blijft gelijk', () => {
    const invoer = kloon(inv2021)
    for (const p of invoer.box3.posities) delete p.dividendbelasting
    const doc = bouw(invoer)
    const n = nummers(doc)
    expect(n).toContain('4.2 Specificatie beperking tarief aftrekbare bedragen')
    expect(n.some((x) => x.endsWith('Dividendbelasting'))).toBe(false)
    expect(regelMap(doc).get('4.3.beperking')?.bedragen?.C).toBe(1273)
  })

  it('nummer() geeft de inhoudsopgave en is idempotent', () => {
    const doc = bouw(inv2024)
    const eerste = nummer(doc)
    const tweede = nummer(doc)
    expect(tweede.map((x) => x.nummer)).toEqual(eerste.map((x) => x.nummer))
    expect(eerste.length).toBe(alleSecties(doc).length)
    expect(eerste[0]).toMatchObject({ nummer: '1', titel: 'Persoonlijke gegevens', niveau: 1 })
    expect(eerste.find((x) => x.nummer === '2.2.1')?.niveau).toBe(3)
  })
})

describe('verantwoording', () => {
  it('status, parameters met status, methoden en accountantsverschillen', () => {
    const doc = bouw(inv2024, 'A', { accountant: { A: { teBetalen: 4314, verschuldigd: 47854, box1Belasting: 37324, zvw: null } } })
    const v = doc.verantwoording
    expect(v.statusZin).toBe('Indicatieve berekening, geen belastingadvies en geen aangifte. De aanslag van de Belastingdienst is leidend.')
    expect(v.parameters.find((p) => p.blok.startsWith('Sparen en beleggen'))?.status).toBe('definitief')
    expect(v.methoden.find((m) => m.label === 'Box 3')?.waarde).toContain('Forfaitair')
    expect(v.verschillen).toEqual([
      { label: 'Belasting box 1 (inclusief tariefmaatregel)', accountant: 37324, berekend: 37324 },
      { label: 'Verschuldigde inkomstenbelasting', accountant: 47854, berekend: 47901 },
      { label: 'Te betalen inkomstenbelasting', accountant: 4314, berekend: 4363 },
    ])
    expect(v.berekendOp).toBe('2026-10-04')
  })

  it('voorblad met adres als dat is ingevuld, zonder kantoor; kopregel met de berekendatum', () => {
    const doc = bouw(inv2024, 'A', { gegevens: { adres: { straat: 'Voorbeeldstraat 1', postcode: '1234 AB', plaats: 'Voorbeeld' } }, dossierStatus: 'ingediend' })
    expect(doc.voorblad.adresregels).toEqual(['Persoon A', 'Voorbeeldstraat 1', '1234 AB Voorbeeld'])
    expect(doc.voorblad.regels.map((r) => r.label)).toEqual(['Opgesteld met', 'Datum', 'Status'])
    expect(doc.voorblad.regels[2].waarde).toBe('Ingediend')
    expect(doc.kopregel).toEqual({ links: 'Fiscaal rapport aangifte inkomstenbelasting 2024 van Persoon A', rechts: ['Berekend op: 4 oktober 2026'] })
  })

  it('samenwonend: de zinnen over het fiscaal partnerschap', () => {
    const doc = bouw(inv2024, 'A', { gegevens: { samenlevingsvorm: 'samenwonend' } })
    const t = alleTeksten(doc)
    expect(t).toContain('Persoon A staat heel 2024 op hetzelfde adres ingeschreven als de huisgenoot.')
    expect(t).toContain('Persoon A en de huisgenoot zijn heel 2024 fiscale partners.')
  })
})
