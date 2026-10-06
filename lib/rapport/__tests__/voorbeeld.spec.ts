/**
 * Het rapportmodel op het verzonnen voorbeeldhuishouden (lib/voorbeeld): de bedragen per regel als regressie, de
 * labels met rekenregels, de opmaak, de nummering en de verantwoording. Dezelfde toets tegen de echte aangiftes en
 * het rapport van de accountant staat in prive/fixtures.spec.ts (alleen lokaal).
 */
import { describe, expect, it } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { alleIds, alleSecties, bouw, regelMap, vergelijk, type Verwacht } from './hulp'

const O = '5.meubelmakerij'
const nummers = (doc: ReturnType<typeof bouw>) => alleSecties(doc).map((s) => `${s.nummer} ${s.titel}`)

/** Bedragen uit het rapport 2024 van persoon A (de engine op het voorbeeld). */
const RAPPORT_2024: Verwacht = {
  '2.1.belastbare-winst': { B: 127935 },
  '2.1.eigen-woning': { B: -6418 },
  '2.1.inkomensvoorziening': { B: -13260 },
  '2.1.drempel-box1': { C: 108257 },
  '2.1.drempel-box3': { C: 296 },
  '2.1.drempelinkomen': { C: 108553 },
  '2.1.verzamelinkomen': { C: 108553 },
  '2.1.totaal-belastbaar': { C: 108553 },
  '2.2.1.schijf-3': { B: 16205 },
  '2.2.1.tariefmaatregel': { B: 3735 },
  '2.2.1.box1-totaal': { C: 37324 },
  '2.2.1.box3-belasting': { B: 106 },
  '2.2.1.box3-bronbelasting': { B: -63 },
  '2.2.1.box3-totaal': { C: 43 },
  '2.2.1.berekend': { C: 47901 },
  '2.2.2.maximaal': { C: 0 },
  '2.2.2.verschuldigd': { C: 47901 },
  '2.2.3.dividendbelasting': { B: 38 },
  '2.2.3.voorheffingen': { C: -38 },
  '2.2.3.subtotaal': { C: 47863 },
  '2.2.4.betaald': { C: -43500 },
  '2.2.4.te-betalen': { C: 4363 },
  '2.3.belastbare-winst': { B: 127935 },
  '2.3.nog-niet-afgedragen': { C: 71628 },
  '2.3.voorlopig': { C: -3700 },
  '2.3.te-betalen': { C: 110 },
  '3.1.1.onderneming.1': { B: 152340 },
  '3.1.1.beperkt-aftrekbaar': { B: 228 },
  '3.1.1.investeringsregelingen': { B: -1240 },
  '3.1.1.totaal-correcties': { C: -1012 },
  '3.1.1.winst': { C: 151328 },
  '3.1.1.zelfstandigenaftrek': { B: 3750 },
  '3.1.1.na-aftrek': { C: 147578 },
  '3.1.1.mkb': { C: -19643 },
  '3.1.1.belastbare-winst': { C: 127935 },
  '3.1.2.woning': { N: 412000, B: 1442 },
  '3.1.2.saldo': { C: -6418 },
  '3.1.2.naar-partner': { C: 0 },
  '3.1.2.toegerekend': { C: -6418 },
  '3.1.3.lijfrente.premies': { A: 9800 },
  '3.1.3.jaarruimte.2022': { Z: 7070, A: 4911 },
  '3.1.3.jaarruimte.2021': { Z: 4889, A: 4889 },
  '3.1.3.aov.premies': { A: 3460 },
  '3.1.3.totaal': { C: -13260 },
  '3.2.1.bankNL.subtotaal': { B: 50900, C: 50200 },
  '3.2.1.bankBuitenland.subtotaal': { B: 9800, C: 5900 },
  '3.2.1.totaal': { B: 137650, C: 143480 },
  '3.2.2.drempel': { B: -7400, C: -7400 },
  '3.2.2.aftrekbaar': { B: 16600, C: 8850 },
  '3.2.3.vermogen': { B: 121050, C: 134630 },
  '3.2.3.heffingsvrij': { B: -114000 },
  '3.2.3.grondslag': { B: 7050 },
  '3.2.3.deel-partner': { B: 0 },
  '3.2.3.deel-eigen': { B: 7050 },
  '3.2.3.rendement.beleggingen': { Z: 74800, B: 4517 },
  '3.2.3.rendement.totaal': { B: 5085 },
  '3.2.3.aandeel': { B: 296 },
  '3.2.3.belastbaar': { C: 296 },
  '4.1.1.2024.inkomen': { A: 149800 },
  '4.1.1.2024.maximum': { A: 137800 },
  '4.1.1.2024.premiegrondslag': { A: 120255 },
  '4.1.1.2024.jaarruimte': { B: 36077 },
  '4.1.1.2023.for': { A: 2740 },
  '4.1.1.2023.for-correctie': { B: -2740 },
  '4.1.1.2023.jaarruimte': { B: 31810 },
  '4.1.1.2022.al-gebruikt': { B: -6500 },
  '4.1.1.2022.dit-jaar': { B: -4911 },
  '4.1.1.2022.openstaand': { C: 2159 },
  '4.1.1.2021.dit-jaar': { B: -4889 },
  '4.1.1.2021.openstaand': { C: 0 },
  '4.2.toegerekend': { C: 38 },
  '4.3.mkb': { B: 19643 },
  '4.3.eigen-woning': { B: 6418 },
  '4.3.grondslag': { C: 29811 },
  '4.3.beperking': { C: 3735 },
  '4.4.1.totaal': { B: 63, C: 420 },
  '4.4.1.land.us': { Z: 420, A: 63, C: 63 },
  [`${O}.1.1.eindvermogen`]: { C: 97450 },
  [`${O}.1.1.beginvermogen`]: { C: 61570 },
  [`${O}.1.1.onttrekkingen.totaal`]: { C: 118960 },
  [`${O}.1.1.stortingen.totaal`]: { C: -2500 },
  [`${O}.1.1.fiscale-winstberekening`]: { C: 152340 },
  [`${O}.1.1.winst`]: { C: 151328 },
  [`${O}.2.1.totaal`]: { B: 69000, C: 107660 },
  [`${O}.2.2.oudedagsreserve`]: { B: 9640, C: 9640 },
  [`${O}.2.2.exclusief-reserves`]: { B: 51930, C: 87810 },
  [`${O}.2.2.totaal`]: { B: 69000, C: 107660 },
  [`${O}.3.opbrengsten.totaal`]: { C: 194600 },
  [`${O}.3.overige-kosten.totaal`]: { C: -22360 },
  [`${O}.3.saldo`]: { C: 152340 },
  [`${O}.4.1.mva`]: { Z: 14900, A: 0, B: 3180, C: 5750 },
  [`${O}.6.2.middel.1`]: { A: 2950, B: 2950, C: 826 },
  [`${O}.6.2.totaal`]: { B: 4430, C: 1240 },
  '6.1.recht': { B: 3750 },
  '6.1.niet-benut': { C: 0 },
}

describe('voorbeeldrapport 2024, persoon A', () => {
  const doc = bouw(voorbeeldInvoer(2024), 'A')
  const regels = regelMap(doc)

  it('bedragen per regel', () => vergelijk(doc, RAPPORT_2024))

  it('premieregels per stuk naar beneden afgerond, het totaal uit de engine (één euro meer)', () => {
    const som = ['aow', 'anw', 'wlz'].reduce((s, k) => s + (regels.get(`2.2.1.premie-${k}`)?.bedragen?.B ?? 0), 0)
    expect(regels.get('2.2.1.premie-totaal')?.bedragen?.C).toBe(som + 1)
  })

  it('labels met rekenregels', () => {
    expect(regels.get('2.2.1.schijf-1')?.label).toBe('Belasting 1e schijf: 9,32% over 38.098')
    expect(regels.get('2.2.1.schijf-3')?.label).toBe('Belasting 3e schijf: 49,50% over 32.739')
    expect(regels.get('2.2.1.tariefmaatregel')?.label).toBe('Beperking tarief aftrekbare bedragen: 12,53% over 29.811')
    expect(regels.get('2.2.1.premie-aow')?.label).toBe('Premie AOW: 17,90% over 38.098')
    expect(regels.get('2.2.1.box3-belasting')?.label).toBe('Box 3 belasting: 36,00% over 296')
    expect(regels.get('2.3.nog-niet-afgedragen')?.label).toBe('Inkomen waarover nog geen Zvw-bijdrage is afgedragen (max. € 71.628)')
    // Het percentage waarmee is gerekend (afgekapt op twee decimalen): 4,20% x 7.050 = 296,10, afgerond 296.
    expect(regels.get('3.2.3.rendementspercentage')).toMatchObject({ label: 'Rendementspercentage: 5.085 / 121.050', percentages: { A: 0.042 } })
    expect(regels.get('3.2.3.aandeel')?.label).toBe('Aandeel rendement: 4,20% x 7.050')
    expect(regels.get(`${O}.1.1.beperkt-aftrekbaar`)?.label).toBe('Beperkt aftrekbare kosten: 20,00% van 1.140')
    expect(regels.get('3.2.3.rendement.bankNL')?.percentages?.A).toBeCloseTo(0.0144, 6)
    expect(regels.get(`${O}.6.2.middel.1`)?.teksten).toEqual({ soort: 'KIA', datum: '14-03-2024', aandeel: '100,00%' })
    expect(regels.get('4.4.1.positie.beleggingen')?.teksten).toEqual({ land: 'Verenigde Staten' })
  })

  it('opmaak: vet, strepen en dubbele strepen volgens de spec', () => {
    expect(regels.get('2.1.drempel-box1')).toMatchObject({ streepBoven: ['B'] })
    expect(regels.get('2.1.drempelinkomen')).toMatchObject({ vet: 'regel', streepBoven: ['C'], dubbelOnder: ['C'] })
    expect(regels.get('2.2.1.premie-inkomen')).toMatchObject({ dubbelOnder: ['A'] })
    expect(regels.get('2.2.1.premie-inkomen')?.vet).toBeUndefined()
    expect(regels.get('3.1.1.onderneming.1')).toMatchObject({ streepOnder: ['B'] })
    expect(regels.get('3.1.1.belastbare-winst')?.dubbelOnder).toBeUndefined()
    expect(regels.get('3.2.1.totaal')).toMatchObject({ vet: 'regel', streepBoven: ['B', 'C'], dubbelOnder: ['B', 'C'] })
    expect(regels.get('4.3.beperking')?.streepBoven).toBeUndefined()
  })

  it('driemaandenvraag: nee', () => {
    const vraag = doc.hoofdstukken.flatMap(function vind(s): Array<{ id: string; antwoord: string }> {
      return [...s.blokken.filter((b) => b.soort === 'vraag'), ...s.secties.flatMap(vind)] as Array<{ id: string; antwoord: string }>
    }).find((v) => v.id === '3.2.3.arbitrage')
    expect(vraag?.antwoord).toBe('nee')
  })

  it('nummering: met jaarrekening, bronbelasting in 4.4 en geen 3.3', () => {
    expect(nummers(doc)).toEqual([
      '1 Persoonlijke gegevens',
      '2 Inkomstenbelasting en premieheffing',
      '2.1 Drempel-/ verzamel-/ belastbaar inkomen',
      '2.2 Belastingberekening',
      '2.2.1 Verschuldigde inkomstenbelasting en premie volksverzekeringen',
      '2.2.2 Heffingskortingen',
      '2.2.3 Voorheffingen',
      '2.2.4 Voorlopige aanslagen en teruggaven',
      '2.3 Zorgverzekeringswet (Zvw)',
      '3 Belastbaar inkomen',
      '3.1 Toelichting belastbaar inkomen uit werk en woning (box 1)',
      '3.1.1 Winst uit onderneming',
      '3.1.2 Inkomsten uit eigen woning',
      '3.1.3 Uitgaven voor inkomensvoorziening',
      '3.1.4 Berekening belastbaar inkomen',
      '3.2 Toelichting belastbaar inkomen uit sparen en beleggen (box 3)',
      '3.2.1 Waarde van bezittingen',
      '3.2.2 Waarde van schulden',
      '3.2.3 Toelichting rendementsgrondslag',
      '4 Bijlagen',
      '4.1 Uitgaven voor inkomensvoorziening',
      '4.1.1 Premies voor lijfrente bij gebruik van de jaar- en reserveringsruimte',
      '4.2 Dividendbelasting',
      '4.3 Specificatie beperking tarief aftrekbare bedragen',
      '4.4 Bijzondere situaties',
      '4.4.1 Voorkoming dubbele belasting',
      '5 Winstaangifte 2024 van Meubelmakerij',
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
      '6 Ondernemersaftrek',
      '6.1 Niet-benutte zelfstandigenaftrek',
    ])
  })

  it('uitkomstenblok met de bedragen van de persoon zelf, daarna de partner en het huishouden', () => {
    const u = doc.verantwoording.uitkomsten
    expect(u[0]).toEqual({ label: 'Te betalen inkomstenbelasting', bedrag: 4363, afsluiting: 'enkel' })
    expect(u[1]).toMatchObject({ label: 'Te betalen inkomensafhankelijke bijdrage Zorgverzekeringswet', bedrag: 110 })
    expect(u[2]).toMatchObject({ label: 'Totaal te betalen bedrag', bedrag: 4473, afsluiting: 'dubbel' })
    expect(u.find((x) => x.label === 'Totaal te betalen bedrag Persoon B')?.bedrag).toBe(211)
    expect(u.find((x) => x.label === 'Totaal te betalen huishouden')?.bedrag).toBe(4473 + 211)
  })

  it('bronbelasting binnen het verdragstarief: geen verschil en geen melding over verrekening', () => {
    expect(doc.verantwoording.verschillen).toEqual([])
    expect(doc.verantwoording.meldingen.some((m) => m.tekst.includes('bronbelasting'))).toBe(false)
  })

  it('herkomst gevuld op elke regel met een bedrag', () => {
    for (const [id, r] of regels) {
      if (!r.bedragen) continue
      expect(r.herkomst, id).toBeTruthy()
    }
  })

  it('geen dubbele regel-id', () => {
    const ids = alleIds(doc)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('voorbeeldrapport 2021, persoon A', () => {
  const doc = bouw(voorbeeldInvoer(2021), 'A')
  const regels = regelMap(doc)

  it('bedragen per regel', () =>
    vergelijk(doc, {
      '2.1.belastbare-winst': { B: 77959 },
      '2.1.eigen-woning': { B: -7250 },
      '2.1.inkomensvoorziening': { B: -9220 },
      '2.1.drempel-box1': { C: 61489 },
      '2.1.drempelinkomen': { C: 61489 },
      '2.1.verzamel.pga-box1': { B: -2390 },
      '2.1.verzamel-box1': { C: 59099 },
      '2.2.1.tariefmaatregel': { B: 1273 },
      '3.1.4.pga': { C: -2390 },
      '3.1.4.belastbaar-box1': { C: 59099 },
      '3.2.1.totaal': { B: 68300 },
      '3.2.2.drempel': { B: -6400 },
      '3.2.2.aftrekbaar': { B: 11500 },
      '3.2.3.vermogen': { B: 56800 },
      '3.2.3.heffingsvrij': { B: -100000 },
      '3.2.3.grondslag': { B: 0 },
      '3.3.scholing.uitgaven': { B: 2640 },
      '3.3.scholing.drempel': { B: -250 },
      '3.3.scholing.aftrekbaar': { C: 2390 },
      '3.3.naar-partner': { C: 0 },
      '3.3.toegerekend': { C: 2390 },
      '3.3.totaal': { C: 2390 },
      '4.3.ondernemersaftrek': { B: 6670 },
      '4.3.pga': { B: 2390 },
      '4.3.buiten-toptarief': { B: -9408 },
      '4.3.grondslag': { C: 19593 },
      '4.3.beperking': { C: 1273 },
    }))

  it('box 3-regels vallen weg bij grondslag 0', () => {
    for (const id of ['2.1.drempel-box3', '2.1.verzamel-box3', '2.2.1.box3-totaal', '3.2.3.deel-eigen', '3.2.3.rendement.totaal', '3.2.3.voordeel']) {
      expect(regels.has(id), id).toBe(false)
    }
    expect(alleIds(doc)).not.toContain('3.2.3.arbitrage')
  })

  it('label 4.3: aftrekbare scholingsuitgaven en de rekenregel van 2021', () => {
    expect(regels.get('4.3.pga')?.label).toBe('Aftrekbare scholingsuitgaven')
    expect(regels.get('4.3.beperking')?.label).toBe('Beperking tarief aftrekbare bedragen: 6,50% over 19.593')
  })

  it('nummering: 3.3 persoonsgebonden aftrek, geen 4.4', () => {
    const titels = nummers(doc)
    expect(titels).toContain('3.3 Persoonsgebonden aftrek')
    expect(titels).toContain('4.2 Dividendbelasting')
    expect(titels).toContain('4.3 Specificatie beperking tarief aftrekbare bedragen')
    expect(titels.some((t) => t.startsWith('4.4'))).toBe(false)
    expect(titels).toContain('5 Winstaangifte 2021 van Meubelmakerij')
  })

  it('31 december ontbreekt in de invoer: geen kolom C in box 3', () => {
    expect(regels.get('3.2.1.totaal')?.bedragen?.C).toBeUndefined()
  })

  it('geen dubbele regel-id', () => {
    const ids = alleIds(doc)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('voorbeeldrapport van partner B', () => {
  it('2024: eigen woning en dividendbelasting naar A, eigen onderneming zonder jaarrekening', () => {
    const doc = bouw(voorbeeldInvoer(2024), 'B')
    vergelijk(doc, {
      '2.1.belastbare-winst': { B: 36869 },
      '2.1.inkomensvoorziening': { B: -2400 },
      '2.1.drempelinkomen': { C: 34469 },
      '2.2.4.betaald': { C: -1800 },
      '2.2.4.te-betalen': { C: 150 },
      '3.1.2.saldo': { C: -6418 },
      '3.1.2.naar-partner': { C: 6418 },
      '3.1.2.toegerekend': { C: 0 },
      '3.2.3.grondslag': { B: 7050 },
      // Het deel van de partner gaat eraf, zodat de kolom optelt: 7.050 - 7.050 = 0.
      '3.2.3.deel-partner': { B: -7050 },
      '3.2.3.deel-eigen': { B: 0 },
      '4.2.dividendbelasting': { C: 38 },
      '4.2.naar-partner': { C: -38 },
      '4.2.toegerekend': { C: 0 },
      '5.tekstbureau.1.1.fiscale-winstberekening': { C: 46280 },
      '5.tekstbureau.1.1.winst': { C: 46280 },
    })
    const titels = nummers(doc)
    expect(titels).toContain('5 Winstaangifte 2024 van Tekstbureau')
    expect(titels).toContain('5.2 Algemene gegevens en specificaties')
    expect(titels.some((t) => t.includes('Fiscale vermogensopstelling'))).toBe(false)
    expect(doc.verantwoording.uitkomsten[0]).toMatchObject({ label: 'Te betalen inkomstenbelasting', bedrag: 150 })
    expect(doc.verantwoording.nietMeegenomen.some((t) => t.startsWith('Tekstbureau: geen jaarrekening ingevoerd.'))).toBe(true)
    expect(doc.verantwoording.meldingen.some((m) => m.tekst.startsWith('Je zit net boven de 1.225 uur.'))).toBe(true)
    const ids = alleIds(doc)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('2021: persoonsgebonden aftrek van het huishouden naar de partner (A)', () => {
    const doc = bouw(voorbeeldInvoer(2021), 'B')
    vergelijk(doc, {
      '3.3.scholing.uitgaven': { B: 2640 },
      '3.3.scholing.drempel': { B: -250 },
      '3.3.scholing.aftrekbaar': { C: 2390 },
      '3.3.naar-partner': { C: -2390 },
      '3.3.toegerekend': { C: 0 },
      '3.3.totaal': { C: 0 },
      '2.1.drempel-box1': { C: 19786 },
      '2.1.verzamel-box1': { C: 19786 },
      '3.1.4.belastbaar-box1': { C: 19786 },
    })
    const regels = regelMap(doc)
    expect(regels.has('2.1.verzamel.pga-box1')).toBe(false)
    expect(regels.has('3.1.4.pga')).toBe(false)
    expect(doc.verantwoording.nietMeegenomen).toContain('Bijlage jaar- en reserveringsruimte: weggelaten, er is geen lijfrentepremie betaald.')
  })
})
