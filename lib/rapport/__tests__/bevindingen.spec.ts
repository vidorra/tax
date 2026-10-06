/**
 * Herstel van de bevindingen uit de review van de rapportexport (modelkant): opmaak van 5.6.1, kolomkoppen per
 * groep in box 3, één afronding van de verdeling van de grondslag, sluitende kolommen, het verloop van de
 * niet-benutte zelfstandigenaftrek uit de engine, de rekenvariant, het schijvenstelsel, de kapitaalsvergelijking
 * zonder beginvermogen, tegenbewijs bij partners, de samenlevingsvorm, box 3 in de verantwoording en het
 * euroteken in meldingen.
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import type { Kolom, RapportDocument, Regel, TabelBlok, VraagBlok } from '../model'
import { alleSecties, alleTeksten, bouw, kloon, regelMap } from './hulp'

// Het verzonnen voorbeeldhuishouden (lib/voorbeeld); persoon A heeft een jaarrekening.
const inv2024 = voorbeeldInvoer(2024)
const inv2021 = voorbeeldInvoer(2021)
const O = '5.meubelmakerij'

const sectieMet = (doc: RapportDocument, titel: string) => alleSecties(doc).find((s) => s.titel === titel)
const tabellen = (doc: RapportDocument, titel: string) => (sectieMet(doc, titel)?.blokken ?? []).filter((b): b is TabelBlok => b.soort === 'tabel')
const kolomSom = (regels: Array<Regel | undefined>, k: Kolom) => regels.reduce((s, r) => s + (r?.bedragen?.[k] ?? 0), 0)

describe('bevinding 3: 5.6.1 links uitgelijnd zoals bij de accountant', () => {
  const doc = bouw(inv2024)
  const s = sectieMet(doc, 'Algemene gegevens')

  it('antwoord op de naamvraag in kolom B, koppen en datums links in A en B', () => {
    const vraag = s?.blokken.find((b): b is VraagBlok => b.soort === 'vraag' && b.id === `${O}.6.1.naam-gewijzigd`)
    expect(vraag).toMatchObject({ antwoord: 'nee', antwoordKolom: 'B' })
    const t = s?.blokken.find((b): b is TabelBlok => b.soort === 'tabel')
    expect(t?.koppen).toEqual([
      { kolom: 'A', regels: ['Begin'], stijl: 'kop', uitlijning: 'links' },
      { kolom: 'B', regels: ['Einde'], stijl: 'kop', uitlijning: 'links' },
    ])
    expect(t?.regels[0]).toMatchObject({ teksten: { A: '01-01-2024', B: '31-12-2024' }, tekstLinks: ['A', 'B'] })
    // De andere vragen houden het antwoord rechts.
    const andere = s?.blokken.filter((b): b is VraagBlok => b.soort === 'vraag' && b.id !== `${O}.6.1.naam-gewijzigd`) ?? []
    expect(andere.length).toBeGreaterThan(0)
    expect(andere.every((v) => v.antwoordKolom === undefined)).toBe(true)
  })
})

describe('bevinding 4: kolomkoppen per groep in 3.2.1 en 3.2.2', () => {
  const doc = bouw(inv2024)

  it('3.2.1: peildata bovenaan, daarna per groep een tabel met groepskop en kolomkop, tot slot het totaal', () => {
    const t = tabellen(doc, 'Waarde van bezittingen')
    expect(t[0]).toMatchObject({ regels: [], koppen: [{ kolom: 'B', regels: ['01-01-2024'] }, { kolom: 'C', regels: ['31-12-2024'] }] })
    const groepen = t.filter((x) => x.herhaalKop)
    expect(groepen.map((g) => [g.herhaalKop, g.koppen?.map((k) => k.regels[0])])).toEqual([
      ['Vermogen op bank- en spaarrekeningen in Nederland', ['Bank']],
      ['Vermogen op bank- en spaarrekeningen in het buitenland', ['Bank']],
      ['Beleggingen', ['Naam']],
      ['Vorderingen en uitgeleend geld', ['Omschrijving']],
    ])
    // Geen groepskopregel meer in de tabel zelf; de subtotalen staan in hun groep.
    expect(groepen.every((g) => g.regels.every((r) => r.soort !== 'groepskop'))).toBe(true)
    expect(groepen[0].regels.at(-1)?.id).toBe('3.2.1.bankNL.subtotaal')
    expect(t.at(-1)?.regels.at(-1)?.id).toBe('3.2.1.totaal')
  })

  it('3.2.1: het land bij buitenlandse rekeningen als dat bekend is', () => {
    const invoer = kloon(inv2024)
    invoer.box3.posities.find((x) => x.categorie === 'bankBuitenland')!.bronbelasting = { land: 'Duitsland', bedrag: 0, brutoInkomsten: 0 }
    const t = tabellen(bouw(invoer), 'Waarde van bezittingen').find((x) => x.herhaalKop?.includes('buitenland'))
    expect(t?.koppen?.map((k) => [k.kolom, k.regels[0]])).toEqual([
      ['omschrijving', 'Bank'],
      ['land', 'Land'],
    ])
    expect(t?.regels[0].teksten).toEqual({ land: 'Duitsland' })
  })

  it('3.2.2: peildata, daarna de kolomkop Omschrijving boven de schulden', () => {
    const t = tabellen(doc, 'Waarde van schulden')
    expect(t).toHaveLength(2)
    expect(t[0].regels).toEqual([])
    expect(t[1].koppen?.map((k) => k.regels[0])).toEqual(['Omschrijving'])
    expect(t[1].regels[0].witVoor).toBeUndefined()
  })
})

describe('bevinding 5: één afronding van de verdeling van de grondslag', () => {
  // Grondslag 7.051 (oneven, één euro meer op de bank), verdeling 50/50: A 3.526, B 3.525.
  const invoer = kloon(inv2024)
  invoer.box3.posities[0].waardeBegin += 1
  invoer.verdeling = { ...(invoer.verdeling as Exclude<HuishoudenInvoer['verdeling'], 'optimaal'>), box3: 0.5 }
  const a = regelMap(bouw(invoer, 'A'))
  const b = regelMap(bouw(invoer, 'B'))

  it('beide rapporten tonen dezelfde delen; het deel van de partner staat negatief en de kolom telt op', () => {
    expect(a.get('3.2.3.deel-partner')?.bedragen?.B).toBe(-3525)
    expect(a.get('3.2.3.deel-eigen')?.bedragen?.B).toBe(3526)
    expect(b.get('3.2.3.deel-partner')?.bedragen?.B).toBe(-3526)
    expect(b.get('3.2.3.deel-eigen')?.bedragen?.B).toBe(3525)
    for (const r of [a, b]) {
      expect((r.get('3.2.3.grondslag')?.bedragen?.B ?? 0) + (r.get('3.2.3.deel-partner')?.bedragen?.B ?? 0)).toBe(r.get('3.2.3.deel-eigen')?.bedragen?.B)
    }
  })

  it('het aandeel rendement is na te rekenen met het percentage en het eigen deel', () => {
    expect(a.get('3.2.3.aandeel')).toMatchObject({ label: 'Aandeel rendement: 4,20% x 3.526', bedragen: { B: 148 } })
    expect(b.get('3.2.3.aandeel')).toMatchObject({ label: 'Aandeel rendement: 4,20% x 3.525', bedragen: { B: 148 } })
  })
})

describe('bevinding 6: niet-kwalificerend leningdeel in 3.1.2', () => {
  it('een regel met de niet aftrekbare rente, zodat kolom A optelt tot de aftrekbare rente', () => {
    const invoer = kloon(inv2024)
    invoer.eigenWoning = {
      woz: 412000,
      leningdelen: [
        { omschrijving: 'Leningdeel 1', hoofdsom: 150000, startdatum: '2010-05-01', aflossingsvorm: 'aflossingsvrij', overgangsrecht: true, rente: 3000 },
        { omschrijving: 'Leningdeel 2', hoofdsom: 50000, startdatum: '2018-05-01', aflossingsvorm: 'aflossingsvrij', rente: 1500 },
      ],
    }
    const r = regelMap(bouw(invoer))
    expect(r.get('3.1.2.niet-aftrekbaar')).toMatchObject({ label: 'Niet aftrekbare rente (geen eigenwoningschuld)', bedragen: { A: -1500 } })
    const kolomA = kolomSom([r.get('3.1.2.lening.1'), r.get('3.1.2.lening.2'), r.get('3.1.2.niet-aftrekbaar')], 'A')
    expect(kolomA).toBe(3000)
    expect(r.get('3.1.2.aftrekbare-rente')?.bedragen?.B).toBe(-kolomA)
  })

  it('zonder niet-aftrekbare rente geen extra regel (voorbeeld)', () => {
    expect(regelMap(bouw(inv2024)).has('3.1.2.niet-aftrekbaar')).toBe(false)
  })
})

describe('bevinding 7: niet-benutte zelfstandigenaftrek uit eerdere jaren volgens de engine', () => {
  it('een vervallen jaar telt niet mee als resterend en staat op een eigen regel', () => {
    const invoer = kloon(inv2024)
    invoer.personen[0].nietBenutteZelfstandigenaftrek = [
      { jaar: 2014, bedrag: 1000 },
      { jaar: 2022, bedrag: 3000 },
    ]
    const doc = bouw(invoer)
    const r = regelMap(doc)
    expect(r.get('6.1.eerder.2014')?.bedragen?.B).toBe(1000)
    expect(r.get('6.1.eerder.2022')?.bedragen?.B).toBe(3000)
    expect(r.get('6.1.eerder.verrekend')?.bedragen?.B).toBe(-3000)
    expect(r.get('6.1.eerder.vervallen')).toMatchObject({ label: 'Vervallen (verrekentermijn voorbij)', bedragen: { B: -1000 } })
    expect(r.get('6.1.eerder.resterend')?.bedragen?.C).toBe(0)
    const kolomB = kolomSom([r.get('6.1.eerder.2014'), r.get('6.1.eerder.2022'), r.get('6.1.eerder.verrekend'), r.get('6.1.eerder.vervallen')], 'B')
    expect(kolomB).toBe(r.get('6.1.eerder.resterend')?.bedragen?.C)
    expect(doc.verantwoording.meldingen.some((m) => m.tekst.startsWith('Niet-benutte zelfstandigenaftrek uit 2014 (€ 1.000) is vervallen'))).toBe(true)
  })
})

describe('bevinding 8: de rekenvariant op het voorblad en in de verantwoording', () => {
  const invoer = kloon(inv2024)
  invoer.jaar = 2027

  it('met variant: label en status', () => {
    const doc = bouw({ ...invoer, variant: 'brief-29-09' })
    expect(doc.voorblad.regels.at(-1)).toEqual({ label: 'Rekenvariant', waarde: 'Brief 29 september 2026 (voorstel)' })
    expect(doc.verantwoording.methoden.find((m) => m.label === 'Rekenvariant')?.waarde).toBe(
      'Brief 29 september 2026 (voorstel). Andere variant: Standaard (Belastingplan); die geeft andere bedragen.',
    )
    expect(doc.verantwoording.parameters[0]).toMatchObject({ blok: 'Variant: Brief 29 september 2026', status: 'voorstel' })
  })

  it('zonder variant in een jaar met varianten: standaard (Belastingplan)', () => {
    const doc = bouw(invoer)
    expect(doc.voorblad.regels.at(-1)).toEqual({ label: 'Rekenvariant', waarde: 'Standaard (Belastingplan)' })
    expect(doc.verantwoording.methoden.find((m) => m.label === 'Rekenvariant')?.waarde).toBe(
      'Standaard (Belastingplan). Andere variant: Brief 29 september 2026; die geeft andere bedragen.',
    )
  })

  it('in een jaar zonder varianten geen regel', () => {
    const doc = bouw(inv2024)
    expect(doc.voorblad.regels.map((r) => r.label)).not.toContain('Rekenvariant')
    expect(doc.verantwoording.methoden.map((m) => m.label)).not.toContain('Rekenvariant')
  })
})

describe('bevinding 9: schijvenstelsel (2021) met een grondslag boven nul', () => {
  const invoer = kloon(inv2021)
  invoer.box3.posities.push({ id: 'spaar', omschrijving: 'Spaarrekening', categorie: 'bankNL', eigenaar: 'A', waardeBegin: 300000 })
  invoer.verdeling = { ...(invoer.verdeling as Exclude<HuishoudenInvoer['verdeling'], 'optimaal'>), box3: 0.5 }

  for (const persoon of ['A', 'B'] as const) {
    it(`persoon ${persoon}: voordeel per schijf over het eigen deel, opgeteld gelijk aan het voordeel`, () => {
      const r = regelMap(bouw(invoer, persoon))
      const voordeel = r.get('3.2.3.voordeel')?.bedragen?.C ?? 0
      expect(voordeel).toBeGreaterThan(0)
      const schijven = [...r.values()].filter((x) => /^3\.2\.3\.schijf\.\d+$/.test(x.id))
      expect(schijven.length).toBeGreaterThan(0)
      expect(schijven[0].label).toBe('Rendement 1e schijf (tot 50.000)')
      expect(schijven[0].teksten).toEqual({ A: '1,898%' })
      expect(kolomSom(schijven, 'Z')).toBe(r.get('3.2.3.deel-eigen')?.bedragen?.B)
      expect(kolomSom(schijven, 'B')).toBe(r.get('3.2.3.schijf.totaal')?.bedragen?.B)
      expect(r.get('3.2.3.schijf.totaal')?.bedragen?.B).toBe(voordeel)
    })
  }
})

describe('bevinding 11: kapitaalsvergelijking zonder beginvermogen', () => {
  it('de ontbrekende regel zonder bedrag en een melding; geen streep boven de winstberekening', () => {
    const invoer = kloon(inv2024)
    delete invoer.personen[0].ondernemingen[0].jaarrekening!.begin
    const doc = bouw(invoer)
    const r = regelMap(doc)
    expect(r.get(`${O}.1.1.eindvermogen`)?.bedragen?.C).toBe(97450)
    expect(r.get(`${O}.1.1.beginvermogen`)).toMatchObject({ label: 'Af: beginvermogen (niet ingevoerd)' })
    expect(r.get(`${O}.1.1.beginvermogen`)?.bedragen).toBeUndefined()
    expect(r.get(`${O}.1.1.onttrekkingen.totaal`)?.bedragen?.C).toBe(118960)
    expect(r.get(`${O}.1.1.fiscale-winstberekening`)?.streepBoven).toBeUndefined()
    expect(doc.verantwoording.meldingen.some((m) => m.tekst.includes('het beginvermogen ontbreekt, dus de kapitaalsvergelijking is niet te maken'))).toBe(true)
  })
})

describe('bevinding 13: tegenbewijs bij partners', () => {
  it('het werkelijk rendement van het huishouden wordt zichtbaar verdeeld', () => {
    const invoer = kloon(inv2024)
    invoer.box3.tegenbewijs = true
    for (const x of invoer.box3.posities) {
      x.waardeEind = x.waardeBegin
      delete x.bronbelasting
      delete x.bronbelastingen
    }
    for (const x of invoer.box3.schulden) x.waardeEind = x.waardeBegin
    invoer.box3.posities[0].directeOpbrengsten = 201
    invoer.verdeling = { ...(invoer.verdeling as Exclude<HuishoudenInvoer['verdeling'], 'optimaal'>), box3: 0.5 }
    for (const persoon of ['A', 'B'] as const) {
      const r = regelMap(bouw(invoer, persoon))
      const werkelijk = r.get('3.2.3.werkelijk')?.bedragen?.B ?? 0
      const partner = r.get('3.2.3.werkelijk.deel-partner')?.bedragen?.B ?? 0
      const eigen = r.get('3.2.3.werkelijk.deel-eigen')?.bedragen?.B
      expect(werkelijk).toBeGreaterThan(0)
      expect(partner).toBeLessThan(0)
      expect(werkelijk + partner).toBe(eigen)
      expect(r.get('3.2.3.voordeel')?.bedragen?.C).toBe(eigen)
    }
  })
})

describe('bevinding 14: samenlevingsvorm tegenover het fiscaal partnerschap van het jaar', () => {
  const situatie = (doc: RapportDocument) => {
    const g = doc.hoofdstukken[0].blokken.find((b) => b.soort === 'gegevens')
    return g?.soort === 'gegevens' ? g.rijen.find((r) => r.label === 'Persoonlijke situatie')?.waarde : undefined
  }

  it('gehuwd zonder fiscaal partner: weggelaten, met een melding', () => {
    const invoer = kloon(inv2024)
    invoer.fiscaalPartner = false
    const doc = bouw(invoer, 'A', { gegevens: { samenlevingsvorm: 'gehuwd' } })
    expect(situatie(doc)).toBeUndefined()
    expect(alleTeksten(doc)).toContain('Persoon A heeft in 2024 geen fiscale partner.')
    expect(doc.verantwoording.meldingen.find((m) => m.tekst.startsWith('De samenlevingsvorm'))?.tekst).toBe(
      'De samenlevingsvorm bij de persoonlijke gegevens (gehuwd) past niet bij de keuze voor 2024: geen fiscale partner. Hoofdstuk 1 noemt de samenlevingsvorm daarom niet. Controleer beide gegevens.',
    )
  })

  it('alleenstaand met fiscaal partner: weggelaten, met een melding', () => {
    const doc = bouw(inv2024, 'A', { gegevens: { samenlevingsvorm: 'alleenstaand' } })
    expect(situatie(doc)).toBeUndefined()
    expect(doc.verantwoording.meldingen.some((m) => m.tekst.includes('past niet bij de keuze voor 2024: fiscale partners'))).toBe(true)
  })

  it('passende vormen blijven staan, zonder melding', () => {
    expect(situatie(bouw(inv2024, 'A', { gegevens: { samenlevingsvorm: 'gehuwd' } }))).toBe('Gehuwd')
    const zonder = kloon(inv2024)
    zonder.fiscaalPartner = false
    const doc = bouw(zonder, 'A', { gegevens: { samenlevingsvorm: 'samenwonend' } })
    expect(situatie(doc)).toBe('Samenwonend')
    expect(doc.verantwoording.meldingen.some((m) => m.tekst.startsWith('De samenlevingsvorm'))).toBe(false)
  })
})

describe('bevinding 15: zonder box 3 ook geen box 3 in de verantwoording', () => {
  it('geen methode en geen parameterblok box 3 als box 3 is weggelaten', () => {
    const invoer = kloon(inv2024)
    invoer.box3 = { posities: [], schulden: [] }
    const v = bouw(invoer).verantwoording
    expect(v.nietMeegenomen.some((t) => t.startsWith('Belastbaar inkomen uit sparen en beleggen (box 3): weggelaten'))).toBe(true)
    expect(v.methoden.some((m) => m.label === 'Box 3')).toBe(false)
    expect(v.parameters.some((p) => p.blok.startsWith('Sparen en beleggen'))).toBe(false)
  })
})

describe('bevinding 24: bedragen in meldingen met euroteken', () => {
  it('meldingen van de engine en van het rapport', () => {
    // Bronbelasting boven 15% van het dividend, in het oude invoerveld (land als naam).
    const meer = kloon(inv2024)
    const beleggingen = meer.box3.posities.find((x) => x.id === 'beleggingen')!
    delete beleggingen.bronbelastingen
    beleggingen.bronbelasting = { land: 'Verenigde Staten', bedrag: 90, brutoInkomsten: 420 }
    const doc = bouw(meer)
    const t = doc.verantwoording.meldingen.map((m) => m.tekst)
    expect(t).toContain('Er is € 90 aan buitenlandse bronbelasting ingehouden, maar verrekenbaar is maximaal 15% van de bruto-inkomsten (€ 63). Het meerdere kun je soms terugvragen in het bronland.')
    expect(t.some((x) => x.startsWith('Na dit jaar staat er nog € '))).toBe(true)
    const invoer = kloon(inv2024)
    invoer.personen[0].ondernemingen[0].jaarrekening!.onttrekkingen![0].bedrag += 100
    const kv = bouw(invoer).verantwoording.meldingen.find((m) => m.tekst.includes('kapitaalsvergelijking sluit niet'))
    expect(kv?.tekst).toContain('(verschil -€ 100)')
  })
})

describe('extra: dividendbelasting zonder fiscaal partnerschap bij de eigenaar van de rekening', () => {
  it('4.2 in het rapport van de eigenaar, zonder doorschuiven', () => {
    const invoer = kloon(inv2024)
    invoer.fiscaalPartner = false
    invoer.box3.posities.find((x) => x.id === 'beleggingen')!.eigenaar = 'B'
    const b = regelMap(bouw(invoer, 'B'))
    expect(b.get('4.2.dividendbelasting')?.bedragen?.C).toBe(38)
    expect(b.get('4.2.toegerekend')?.bedragen?.C).toBe(38)
    expect(b.get('2.2.3.dividendbelasting')?.bedragen?.B).toBe(38)
    expect(regelMap(bouw(invoer, 'A')).get('2.2.3.dividendbelasting')?.bedragen?.B ?? 0).toBe(0)
  })
})
