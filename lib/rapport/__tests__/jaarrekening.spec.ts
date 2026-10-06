/**
 * Hoofdstuk 5 met een jaarrekening, op het verzonnen voorbeeldhuishouden (lib/voorbeeld; persoon A heeft in 2024 en
 * 2021 een balans, privé-onttrekkingen en een winstberekening in rubrieken). Kapitaalsvergelijking, balans en
 * winstberekening moeten sluiten (activa = passiva, kapitaalsvergelijking = saldo, rubrieken = saldo). De toets
 * tegen de rapportbedragen van echte aangiftes staat in prive/jaarrekening.spec.ts (alleen lokaal).
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { alleIds, bouw, kloon, regelMap, vergelijk } from './hulp'
import type { RapportDocument } from '../model'

const O = '5.meubelmakerij'
const inv2024 = voorbeeldInvoer(2024)
const inv2021 = voorbeeldInvoer(2021)

/** Sluitende controles op het model zelf. */
function controleer(doc: RapportDocument) {
  const r = regelMap(doc)
  const b = (id: string, k: 'A' | 'B' | 'C') => r.get(`${O}.${id}`)?.bedragen?.[k] ?? 0
  // Activa = passiva, begin en eind.
  for (const k of ['B', 'C'] as const) expect(b('2.1.totaal', k), `activa = passiva (${k})`).toBe(b('2.2.totaal', k))
  // Kapitaalsvergelijking = saldo fiscale winstberekening.
  const kv = b('1.1.eindvermogen', 'C') - b('1.1.beginvermogen', 'C') + b('1.1.onttrekkingen.totaal', 'C') + b('1.1.stortingen.totaal', 'C')
  expect(kv, 'kapitaalsvergelijking').toBe(b('1.1.fiscale-winstberekening', 'C'))
  // Winstberekening in rubrieken = saldo, en gelijk aan 3.1.1.
  const groepen = ['opbrengsten', 'inkoop', 'afschrijvingen', 'personeel', 'overige-kosten', 'financieel'].reduce((s, g) => s + b(`3.${g}.totaal`, 'C'), 0)
  expect(groepen, 'rubrieken').toBe(b('3.saldo', 'C'))
  expect(b('3.saldo', 'C')).toBe(r.get('3.1.1.onderneming.1')?.bedragen?.B)
  // Ondernemingsvermogen in de balans = eindvermogen in de kapitaalsvergelijking.
  expect(b('2.2.ondernemingsvermogen.totaal', 'C')).toBe(b('1.1.eindvermogen', 'C'))
  expect(b('2.2.ondernemingsvermogen.totaal', 'B')).toBe(b('1.1.beginvermogen', 'C'))
  // Geen controlemeldingen en geen niet-verklaarde verschillen.
  expect(doc.verantwoording.meldingen.filter((m) => m.ernst === 'actie')).toEqual([])
  expect(alleIds(doc).some((id) => id.includes('niet-verklaard'))).toBe(false)
}

describe('hoofdstuk 5 met jaarrekening', () => {
  it('2024: sluitend, met de bedragen uit de jaarrekening', () => {
    const doc = bouw(inv2024)
    vergelijk(doc, {
      [`${O}.1.1.eindvermogen`]: { C: 97450 },
      [`${O}.1.1.beginvermogen`]: { C: 61570 },
      [`${O}.1.1.onttrekking.1`]: { A: 61400 },
      [`${O}.1.1.onttrekking.4`]: { A: 44300 },
      [`${O}.1.1.onttrekkingen.som`]: { B: 118960 },
      [`${O}.1.1.storting.1`]: { B: 2500 },
      [`${O}.1.1.fiscale-winstberekening`]: { C: 152340 },
      [`${O}.2.1.vorderingen.totaal`]: { B: 17100, C: 21790 },
      [`${O}.2.1.liquideMiddelen`]: { B: 46320, C: 77020 },
      [`${O}.2.2.kortlopend.totaal`]: { B: 7430, C: 10210 },
      [`${O}.3.omzet`]: { C: 193900 },
      [`${O}.3.onderhandenWerk`]: { C: 700 },
      [`${O}.3.inkoop.totaal`]: { C: -18450 },
      [`${O}.3.financieel.totaal`]: { C: 410 },
      [`${O}.4.2.handelsdebiteuren`]: { A: 21540, B: 16850, C: 21540 },
      [`${O}.4.2.overigeVorderingen.1`]: { B: 250, C: 250 },
      [`${O}.5.1.omzetbelasting.totaal`]: { B: 5830, C: 8270 },
    })
    controleer(doc)
    const ids = alleIds(doc)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('2021: sluitend', () => {
    const doc = bouw(inv2021)
    vergelijk(doc, {
      [`${O}.1.1.eindvermogen`]: { C: 58280 },
      [`${O}.1.1.beginvermogen`]: { C: 30100 },
      [`${O}.1.1.fiscale-winstberekening`]: { C: 98100 },
      [`${O}.2.1.totaal`]: { B: 35500, C: 65030 },
      [`${O}.3.saldo`]: { C: 98100 },
      [`${O}.4.1.mva`]: { Z: 9600, A: 0, B: 2200, C: 4450 },
    })
    controleer(doc)
  })

  it('nummering met jaarrekening: 5.1 tot en met 5.6 zoals in het rapport', () => {
    const doc = bouw(inv2024)
    const h5 = doc.hoofdstukken.find((h) => h.titel.startsWith('Winstaangifte'))
    const titels = h5?.secties.flatMap((s) => [`${s.nummer} ${s.titel}`, ...s.secties.map((x) => `${x.nummer} ${x.titel}`)])
    expect(titels).toEqual([
      '5.1 Fiscale winstberekening door kapitaalsvergelijking',
      '5.1.1 Kapitaalsvergelijking',
      '5.2 Fiscale vermogensopstelling',
      '5.2.1 Activa',
      '5.2.2 Passiva',
      '5.3 Fiscale winstberekening',
      '5.4 Specificatie balans activa',
      '5.4.1 Materiële vaste activa',
      '5.4.2 Vorderingen',
      '5.5 Specificatie balans passiva',
      '5.5.1 Kortlopende schulden',
      '5.6 Algemene gegevens en specificaties',
      '5.6.1 Algemene gegevens',
      '5.6.2 Investeringsaftrek',
    ])
    expect(h5?.secties[2].kopKolommen).toEqual([{ kolom: 'C', regels: ['Fiscaal 2024'], stijl: 'datum' }])
    expect(h5?.secties[1].secties[0].kopKolommen?.map((k) => k.regels[0])).toEqual(['Fiscaal begin', 'Fiscaal eind'])
  })

  it('kapitaalsvergelijking die niet sluit: regel met het verschil en een melding', () => {
    const inv = kloon(inv2024)
    inv.personen[0].ondernemingen[0].jaarrekening!.onttrekkingen![0].bedrag += 100
    const doc = bouw(inv)
    expect(regelMap(doc).get(`${O}.1.1.niet-verklaard`)?.bedragen?.C).toBe(-100)
    expect(doc.verantwoording.meldingen.some((m) => m.ernst === 'actie' && m.tekst.includes('kapitaalsvergelijking sluit niet'))).toBe(true)
  })

  it('rubrieken die niet op het saldo aansluiten: regel met het verschil en een melding', () => {
    const inv = kloon(inv2024)
    inv.personen[0].ondernemingen[0].jaarrekening!.winstEnVerlies!.find((x) => x.rubriek === 'overig')!.bedrag += 50
    const doc = bouw(inv)
    expect(regelMap(doc).get(`${O}.3.niet-verklaard`)?.bedragen?.C).toBe(50)
    expect(doc.verantwoording.meldingen.some((m) => m.ernst === 'actie' && m.tekst.includes('rubrieken'))).toBe(true)
  })

  it('activaregister met de afschrijving in het saldo: de correctie staat als bekende regel en alles sluit', () => {
    const inv = kloon(inv2024)
    const o = inv.personen[0].ondernemingen[0]
    if (o.winstberekening.soort !== 'saldo') throw new Error('fixture heeft een saldo')
    o.winstberekening.afschrijvingenInSaldo = 1860
    o.activa = [{ omschrijving: 'Werkstation', aanschafdatum: '2024-01-01', aanschafwaarde: 5000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }]
    o.activaVolledig = true
    const doc = bouw(inv)
    const r = regelMap(doc)
    // Geboekt 1.860, fiscaal 5.000 / 5 = 1.000: het fiscale saldo is 860 hoger dan de geboekte cijfers.
    expect(r.get(`${O}.1.1.correctie-afschrijving`)?.bedragen?.C).toBe(860)
    expect(r.get(`${O}.1.1.fiscale-winstberekening`)?.bedragen?.C).toBe(152340 + 860)
    expect(r.has(`${O}.1.1.niet-verklaard`)).toBe(false)
    expect(r.get(`${O}.3.correctie-afschrijving`)?.bedragen?.C).toBe(860)
    expect(r.has(`${O}.3.niet-verklaard`)).toBe(false)
    expect(doc.verantwoording.meldingen.some((m) => m.ernst === 'actie' && (m.tekst.includes('kapitaalsvergelijking') || m.tekst.includes('rubrieken')))).toBe(false)
  })

  it('beginvermogen bekend, onttrekkingen niet: afgeleide regel voor privéonttrekkingen en -stortingen', () => {
    const inv = kloon(inv2024)
    const jr = inv.personen[0].ondernemingen[0].jaarrekening!
    delete jr.onttrekkingen
    delete jr.stortingen
    const doc = bouw(inv)
    const r = regelMap(doc)
    expect(r.get(`${O}.1.1.prive-afgeleid`)).toMatchObject({ label: 'Saldo privéonttrekkingen en -stortingen (afgeleid)', bedragen: { C: 118960 - 2500 } })
    expect(r.has(`${O}.1.1.onttrekkingen.totaal`)).toBe(false)
  })

  it('specificatie die niet aansluit op de balans geeft een melding', () => {
    const inv = kloon(inv2024)
    inv.personen[0].ondernemingen[0].jaarrekening!.specificaties![1].eind = 100
    const doc = bouw(inv)
    expect(doc.verantwoording.meldingen.some((m) => m.tekst.includes('sluit niet aan op de balans'))).toBe(true)
  })

  describe('5.4.1 en het activaregister', () => {
    const metRegister = (volledig: boolean | undefined, afschrijvingenInSaldo: number | null = 1860) => {
      const inv = kloon(inv2024)
      const o = inv.personen[0].ondernemingen[0]
      if (o.winstberekening.soort !== 'saldo') throw new Error('fixture heeft een saldo')
      if (afschrijvingenInSaldo !== null) o.winstberekening.afschrijvingenInSaldo = afschrijvingenInSaldo
      o.activa = [
        { omschrijving: 'Werkstation', aanschafdatum: '2024-01-01', aanschafwaarde: 5000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' },
        { omschrijving: 'Camera', aanschafdatum: '2022-07-01', aanschafwaarde: 3000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', boekwaardeBegin: 2100 },
      ]
      if (volledig !== undefined) o.activaVolledig = volledig
      return inv
    }

    it('telt het register niet mee, dan volgt 5.4.1 de balanspost en zegt de verantwoording waarom', () => {
      for (const [volledig, saldo] of [[undefined, 1860], [false, 1860], [true, null]] as const) {
        const doc = bouw(metRegister(volledig, saldo))
        const r = regelMap(doc)
        expect(r.get(`${O}.4.1.mva`)?.bedragen).toEqual({ Z: 14900, A: 0, B: 3180, C: 5750 })
        expect(alleIds(doc).some((id) => id.startsWith(`${O}.4.1.actief`) || id === `${O}.4.1.totaal`)).toBe(false)
        const reden = volledig === true ? 'de afschrijving in het saldo niet is ingevuld' : 'niet is aangegeven dat alle bedrijfsmiddelen erin staan'
        expect(doc.verantwoording.nietMeegenomen).toContain(`Meubelmakerij: het activaregister telt niet mee in de winst, omdat ${reden}. De specificatie van de materiële vaste activa volgt daarom de balans.`)
      }
    })

    it('telt het register mee: een regel per middel, het totaal en de aansluiting op de balans', () => {
      const doc = bouw(metRegister(true))
      const r = regelMap(doc)
      expect(r.get(`${O}.4.1.actief.1`)).toMatchObject({ label: 'Werkstation', bedragen: { Z: 5000, A: 0, B: 5000, C: 4000 } })
      expect(r.get(`${O}.4.1.actief.2`)).toMatchObject({ label: 'Camera', bedragen: { Z: 3000, A: 0, B: 2100, C: 1500 } })
      expect(r.get(`${O}.4.1.totaal`)).toMatchObject({ label: 'Totaal activaregister', soort: 'subtotaal', bedragen: { Z: 8000, A: 0, B: 7100, C: 5500 } })
      // De balans heeft 3.180 en 5.750: het verschil en de balanspost staan eronder, met een melding.
      expect(r.get(`${O}.4.1.verschil-balans`)?.bedragen).toEqual({ B: 3180 - 7100, C: 5750 - 5500 })
      expect(r.get(`${O}.4.1.balans`)).toMatchObject({ label: 'Materiële vaste activa volgens de balans', bedragen: { B: 3180, C: 5750 } })
      expect(r.has(`${O}.4.1.mva`)).toBe(false)
      const melding = doc.verantwoording.meldingen.find((m) => m.tekst.includes('activaregister (begin'))
      expect(melding?.ernst).toBe('let-op')
      expect(melding?.tekst).toBe(
        'Meubelmakerij: de fiscale boekwaarde volgens het activaregister (begin € 7.100, eind € 5.500) sluit niet aan op de materiële vaste activa in de balans (begin € 3.180, eind € 5.750). Staan er bedrijfsmiddelen niet in het register, of is de balans niet fiscaal afgeschreven, pas dan het register of de balans aan.',
      )
      expect(doc.verantwoording.nietMeegenomen.some((t) => t.includes('activaregister'))).toBe(false)
    })

    it('sluit het register aan op de balans, dan alleen het totaal', () => {
      const inv = metRegister(true)
      const jr = inv.personen[0].ondernemingen[0].jaarrekening!
      jr.begin!.materieleVasteActiva = 7100
      jr.eind!.materieleVasteActiva = 5500
      const doc = bouw(inv)
      const r = regelMap(doc)
      expect(r.get(`${O}.4.1.totaal`)?.bedragen).toMatchObject({ B: 7100, C: 5500 })
      expect(r.has(`${O}.4.1.verschil-balans`)).toBe(false)
      expect(r.has(`${O}.4.1.balans`)).toBe(false)
      expect(doc.verantwoording.meldingen.some((m) => m.tekst.includes('activaregister (begin'))).toBe(false)
    })

    it('zonder balans: het register met totaal, zonder aansluiting', () => {
      const inv = metRegister(true)
      const jr = inv.personen[0].ondernemingen[0].jaarrekening!
      delete jr.begin
      delete jr.eind
      const r = regelMap(bouw(inv))
      expect(r.get(`${O}.4.1.totaal`)?.bedragen).toMatchObject({ B: 7100, C: 5500 })
      expect(r.has(`${O}.4.1.verschil-balans`)).toBe(false)
    })
  })

  it('5.3 uitgesplitst: het register vervangt de geboekte afschrijving alleen als het meetelt', () => {
    const maak = (volledig: boolean): HuishoudenInvoer =>
      ({
        jaar: 2026,
        fiscaalPartner: false,
        kinderen: [],
        box3: { posities: [], schulden: [] },
        verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
        personen: [
          {
            id: 'A',
            geboortedatum: '1988-03-01',
            loon: [],
            inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
            ondernemingen: [
              {
                naam: 'Zaak',
                winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 15000, afschrijvingen: 1200 },
                uren: { onderneming: 0, urencriteriumGehaald: true },
                startjaar: 2015,
                activa: [{ omschrijving: 'Laptop', aanschafdatum: '2025-01-01', aanschafwaarde: 2000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }],
                activaVolledig: volledig,
              },
            ],
          },
        ],
      }) as unknown as HuishoudenInvoer
    const telt = regelMap(bouw(maak(true)))
    expect(telt.get('5.zaak.3.afschrijvingen')?.bedragen?.C).toBe(400)
    expect(telt.get('5.zaak.4.1.totaal')?.bedragen).toMatchObject({ Z: 2000, B: 1600, C: 1200 })
    const nietTelt = regelMap(bouw(maak(false)))
    expect(nietTelt.get('5.zaak.3.afschrijvingen')?.bedragen?.C).toBe(1200)
    expect(nietTelt.get('5.zaak.3.saldo')?.bedragen?.C).toBe(80000 - 15000 - 1200)
    expect([...nietTelt.keys()].some((id) => id.startsWith('5.zaak.4.1.'))).toBe(false)
  })

  it('oudedagsreserve aan het eind in de balans die afwijkt van de stand na de afname: een melding', () => {
    const inv = kloon(inv2024)
    const o = inv.personen[0].ondernemingen[0]
    const jr = o.jaarrekening!
    jr.begin!.oudedagsreserve = 9640
    jr.eind!.oudedagsreserve = 7140
    o.for = { stand: 9640 }
    const doc = bouw(inv)
    const melding = doc.verantwoording.meldingen.find((m) => m.tekst.includes('oudedagsreserve aan het eind'))
    expect(melding).toMatchObject({ ernst: 'let-op' })
    expect(melding?.tekst).toContain('in de balans (€ 7.140) wijkt af van de stand na de afname waarmee is gerekend (€ 9.640)')
    // Sluit de eindstand aan, dan geen melding.
    jr.eind!.oudedagsreserve = 9640
    expect(bouw(inv).verantwoording.meldingen.some((m) => m.tekst.includes('oudedagsreserve aan het eind'))).toBe(false)
  })

  it('verantwoording noemt de jaarrekening als bron en geen weggelaten balans', () => {
    const doc = bouw(inv2024)
    expect(doc.verantwoording.bronnen.some((b) => b.onderdeel.startsWith('Jaarrekening'))).toBe(true)
    expect(doc.verantwoording.nietMeegenomen.some((t) => t.includes('jaarrekening'))).toBe(false)
  })
})
