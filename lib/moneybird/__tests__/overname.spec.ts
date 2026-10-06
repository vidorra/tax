import { describe, expect, it } from 'vitest'
import { forControle, neemOver } from '../overname'
import type { MbJaarImport } from '../types'
import type { OndernemingInvoer } from '../../tax/types'
import { berekenHuishouden } from '../../tax/engine'

const imp: MbJaarImport = {
  koppelingId: '7',
  administratie: { id: '123', naam: 'Meubelmakerij' },
  jaar: 2026,
  opgehaaldOp: '2027-02-01T10:00:00.000Z',
  regels: [],
  totalen: { omzet: 120000, kosten: 14000, afschrijvingen: 1500, beperktAftrekbaar: 900, autokosten: 3000, financieel: 200, nettoWinstMoneybird: 100800, nettoWinstIndeling: 100800, verschil: 0 },
  balans: { ondernemingsvermogenBegin: 150000, ondernemingsvermogenEinde: 180000, forStand: 17460, forStandBegin: 17460, onderhandenWerkBegin: null, onderhandenWerkEind: null },
  investeringen: [{ omschrijving: 'Laptop', datum: '2026-03-01', bedrag: 3200, regeling: 'kia' }],
  desinvesteringen: [],
  activa: [],
  opdrachtgevers: [{ naam: 'Klant A', omzet: 80000, uurtarief: 95 }],
  uren: { totaal: 1100, perContact: { 'Klant A': 842 } },
  waarschuwingen: [],
}

describe('neemOver', () => {
  it('nieuwe onderneming: uitgesplitste winst, standaard urencriterium gehaald, herkomst vastgelegd', () => {
    const o = neemOver(undefined, imp)
    expect(o.winstberekening).toEqual({ soort: 'uitgesplitst', omzet: 120000, kosten: 17000, afschrijvingen: 1500, financieleBatenLasten: 200 })
    expect(o.beperktAftrekbaar).toBe(900)
    expect(o.uren.urencriteriumGehaald).toBe(true)
    expect(o.for).toEqual({ stand: 17460, ondernemingsvermogenEinde: 180000 })
    expect(o.bron?.administratieId).toBe('123')
    expect(o.naam).toBe('Meubelmakerij')
    expect(o.startjaar).toBeLessThan(imp.jaar - 5)
  })
  it('met een auto van de zaak gaan de autokosten naar de auto', () => {
    const bestaand: OndernemingInvoer = {
      naam: 'X', winstberekening: { soort: 'saldo', saldo: 1 }, uren: { onderneming: 0 }, startjaar: 2012,
      auto: { cataloguswaarde: 40000, datumEersteToelating: '2024-05-01', nulEmissie: true, autokosten: 0 },
      activa: [{ omschrijving: 'oud', aanschafdatum: '2022-01-01', aanschafwaarde: 1000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }],
    }
    const o = neemOver(bestaand, imp)
    expect(o.auto?.autokosten).toBe(3000)
    expect(o.winstberekening.soort === 'uitgesplitst' && o.winstberekening.kosten).toBe(14000)
    // Een eigen regel zonder bron telt als met de hand toegevoegd en blijft staan.
    expect(o.activa).toEqual(bestaand.activa)
    expect(o.startjaar).toBe(2012)
  })
  it('uren uit Moneybird alleen op verzoek', () => {
    expect(neemOver(undefined, imp, { uren: true }).uren).toEqual({ onderneming: 1100, urencriteriumGehaald: undefined })
  })
  it('engine: winst gelijk aan de netto winst volgens de indeling', () => {
    const o = neemOver(undefined, imp)
    const r = berekenHuishouden({
      jaar: 2026, fiscaalPartner: false, kinderen: [],
      personen: [{ id: 'A', geboortedatum: '1988-06-15', ondernemingen: [o], loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 } }],
      box3: { posities: [], schulden: [] }, verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
    }, { zonderMarginaleDruk: true })
    const ond = r.personen[0].ondernemingen[0]
    // saldo = netto winst Moneybird; winst = saldo + 20% van 900 (180) − KIA 28% × 3.200 (896)
    expect(ond.saldo).toBe(100800)
    expect(ond.winst).toBe(100800 + 180 - 896)
    expect(ond.urencriteriumGehaald).toBe(true)
  })
})

describe('oudedagsreserve bij de overname', () => {
  const metFor = (forStandBegin: number | null, forStand: number | null): MbJaarImport => ({ ...imp, balans: { ...imp.balans, forStandBegin, forStand } })
  const doorgerold: OndernemingInvoer = { naam: 'Meubelmakerij', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 0 }, startjaar: 2015, for: { stand: 17460 } }

  it('de stand op 1 januari komt van de beginbalans, niet van de eindbalans (geen dubbele afname)', () => {
    // In Moneybird is in 2026 3.000 afgenomen en geboekt: begin 17.460, eind 14.460.
    const o = neemOver(doorgerold, metFor(17460, 14460))
    expect(o.for).toEqual({ stand: 17460, ondernemingsvermogenEinde: 180000 })
    // Ook een andere beginstand in Moneybird gaat voor op de doorgerolde stand.
    expect(neemOver(doorgerold, metFor(17000, 14460)).for?.stand).toBe(17000)
  })

  it('zonder FOR op de beginbalans blijft een bestaande stand staan; zonder bestaande stand komt er geen', () => {
    expect(neemOver(doorgerold, metFor(null, 14460)).for).toEqual({ stand: 17460, ondernemingsvermogenEinde: 180000 })
    expect(neemOver(undefined, metFor(null, 14460)).for).toBeUndefined()
    // De keuze voor een vrijwillige afname blijft staan.
    const metAfname = { ...doorgerold, for: { stand: 17460, vrijwilligeAfname: 3000 } }
    expect(neemOver(metAfname, metFor(17460, 14460)).for?.vrijwilligeAfname).toBe(3000)
  })

  it('zonder de balans over te nemen blijft de oudedagsreserve zoals hij was', () => {
    expect(neemOver(doorgerold, metFor(17000, 14460), { balans: false }).for).toEqual({ stand: 17460 })
  })

  it('forControle: begin min de vrijwillige afname tegenover de eindbalans', () => {
    expect(forControle(metFor(17460, 14460), 3000)).toEqual({ begin: 17460, eind: 14460, daling: 3000, sluitAan: true })
    expect(forControle(metFor(17460, 14460))).toEqual({ begin: 17460, eind: 14460, daling: 3000, sluitAan: false })
    expect(forControle(metFor(17460, 17460))).toMatchObject({ daling: 0, sluitAan: true })
    expect(forControle(metFor(null, 14460), 3000)).toEqual({ begin: null, eind: 14460, daling: null, sluitAan: null })
  })
})

