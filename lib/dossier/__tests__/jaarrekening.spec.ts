/**
 * Jaarrekening per onderneming (OndernemingInvoer.jaarrekening): totalen en controles, validatie in
 * valideerInvoer en de overdracht naar een nieuw jaar. Bedragen van het verzonnen voorbeeldhuishouden 2024.
 */
import { describe, expect, it } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import type { HuishoudenInvoer, JaarrekeningInvoer } from '@/lib/tax/types'
import {
  BALANS_POSTEN,
  WV_RUBRIEKEN,
  balansTotalen,
  heeftBalans,
  jaarrekeningVoorNieuwJaar,
  kapitaalsvergelijking,
  schoonJaarrekening,
  sluitAan,
  specificatieVerschillen,
  wvTotalen,
} from '../jaarrekening'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

const JR_2024: JaarrekeningInvoer = {
  begin: { materieleVasteActiva: 3180, voorraden: 2400, handelsdebiteuren: 16850, overigeVorderingen: 250, liquideMiddelen: 46320, oudedagsreserve: 9640, crediteuren: 1120, omzetbelasting: 5830, overigeKortlopendeSchulden: 480 },
  eind: { materieleVasteActiva: 5750, voorraden: 3100, handelsdebiteuren: 21540, overigeVorderingen: 250, liquideMiddelen: 77020, oudedagsreserve: 9640, crediteuren: 1460, omzetbelasting: 8270, overigeKortlopendeSchulden: 480 },
  specificaties: [
    { post: 'overigeVorderingen', omschrijving: 'Vooruitbetaalde bedragen', begin: 70, eind: 0 },
    { post: 'overigeVorderingen', omschrijving: 'Borg', begin: 180, eind: 250 },
    { post: 'omzetbelasting', omschrijving: 'Over dit boekjaar', begin: 0, eind: 8270 },
    { post: 'omzetbelasting', omschrijving: 'Over vorig boekjaar', begin: 5830, eind: 0 },
  ],
  mva: { aanschafwaarde: 14900, restwaarde: 0 },
  onttrekkingen: [
    { omschrijving: 'Privé-opnamen', bedrag: 61400 },
    { omschrijving: 'Inleg pensioen', bedrag: 9800 },
    { omschrijving: 'AOV', bedrag: 3460 },
    { omschrijving: 'Inkomstenbelasting en Zvw', bedrag: 44300 },
  ],
  stortingen: [{ omschrijving: 'Storting', bedrag: 2500 }],
  winstEnVerlies: [
    { rubriek: 'omzet', bedrag: 193900 },
    { rubriek: 'onderhandenWerk', bedrag: 700 },
    { rubriek: 'inkoop', bedrag: 18450 },
    { rubriek: 'afschrijvingen', bedrag: 1860 },
    { rubriek: 'auto', bedrag: 5240 },
    { rubriek: 'huisvesting', bedrag: 9600 },
    { rubriek: 'beperktAftrekbaar', bedrag: 1140 },
    { rubriek: 'overig', bedrag: 6380 },
    { rubriek: 'financieleBaten', bedrag: 410 },
  ],
  omschrijvingActiviteiten: 'Advies en ontwikkeling',
  bron: 'handmatig',
}

const SALDO_2024 = 152340

function metJaarrekening(jr: unknown): HuishoudenInvoer {
  const inv = voorbeeldInvoer(2024)
  ;(inv.personen[0].ondernemingen[0] as unknown as Record<string, unknown>).jaarrekening = jr
  return inv
}

describe('totalen en controles', () => {
  it('balans 2024: activa, ondernemingsvermogen en kortlopende schulden zoals in het rapport', () => {
    expect(balansTotalen(JR_2024.begin)).toEqual({
      activa: 69000,
      vreemdVermogen: 7430,
      kortlopendeSchulden: 7430,
      ondernemingsvermogen: 61570,
      oudedagsreserve: 9640,
      exclusiefOudedagsreserve: 51930,
    })
    expect(balansTotalen(JR_2024.eind)).toMatchObject({ activa: 107660, kortlopendeSchulden: 10210, ondernemingsvermogen: 97450, exclusiefOudedagsreserve: 87810 })
    expect(balansTotalen(undefined)).toMatchObject({ activa: 0, ondernemingsvermogen: 0 })
  })

  it('voorzieningen en langlopende schulden tellen als vreemd vermogen, niet als kortlopend', () => {
    const t = balansTotalen({ liquideMiddelen: 1000, voorzieningen: 100, langlopendeSchulden: 200, crediteuren: 50 })
    expect(t).toMatchObject({ vreemdVermogen: 350, kortlopendeSchulden: 50, ondernemingsvermogen: 650 })
  })

  it('kapitaalsvergelijking en winst-en-verliesrekening sluiten aan op het saldo', () => {
    const kv = kapitaalsvergelijking(JR_2024)!
    expect(kv).toEqual({ eindvermogen: 97450, beginvermogen: 61570, onttrekkingen: 118960, stortingen: 2500, winst: SALDO_2024 })
    expect(wvTotalen(JR_2024.winstEnVerlies)).toEqual({ opbrengsten: 194600, kosten: 42670, financieel: 410, saldo: SALDO_2024 })
    expect(wvTotalen([{ rubriek: 'financieleLasten', bedrag: 97 }]).saldo).toBe(-97)
    expect(sluitAan(kv.winst, SALDO_2024)).toBe(true)
    expect(sluitAan(SALDO_2024 + 1, SALDO_2024)).toBe(false)
    expect(sluitAan(SALDO_2024 + 0.4, SALDO_2024)).toBe(true)
  })

  it('zonder begin- of eindbalans geen kapitaalsvergelijking', () => {
    expect(kapitaalsvergelijking({ eind: JR_2024.eind })).toBeNull()
    expect(kapitaalsvergelijking({ begin: {}, eind: JR_2024.eind })).toBeNull()
    expect(kapitaalsvergelijking(undefined)).toBeNull()
  })

  it('specificaties: alleen een melding als ze niet optellen tot de ingevulde balanspost', () => {
    expect(specificatieVerschillen(JR_2024)).toEqual([])
    const fout = kloon(JR_2024)
    fout.specificaties![1].eind = 100
    expect(specificatieVerschillen(fout)).toEqual([{ post: 'overigeVorderingen', peildatum: 'eind', specificatie: 100, balans: 250 }])
    expect(specificatieVerschillen({ specificaties: JR_2024.specificaties })).toEqual([])
  })

  it('heeftBalans: 0 is ingevuld, leeg niet', () => {
    expect(heeftBalans({ voorraden: 0 })).toBe(true)
    expect(heeftBalans({})).toBe(false)
    expect(heeftBalans(undefined)).toBe(false)
  })

  it('alle posten en rubrieken uit het contract staan in de lijsten', () => {
    expect(BALANS_POSTEN).toHaveLength(11)
    expect(new Set(BALANS_POSTEN).size).toBe(11)
    expect(WV_RUBRIEKEN).toHaveLength(13)
  })
})

describe('schoonJaarrekening', () => {
  it('haalt lege delen weg zonder nullen toe te voegen', () => {
    expect(schoonJaarrekening({ begin: { voorraden: undefined }, eind: {}, specificaties: [], onttrekkingen: [], stortingen: [], winstEnVerlies: [], omschrijvingActiviteiten: '  ', bron: 'handmatig' })).toBeUndefined()
    expect(schoonJaarrekening(undefined)).toBeUndefined()
    expect(schoonJaarrekening({ eind: { liquideMiddelen: 0, voorraden: undefined }, onttrekkingen: [] })).toEqual({ eind: { liquideMiddelen: 0 } })
    expect(schoonJaarrekening({ omschrijvingActiviteiten: 'Advies', bron: 'moneybird' })).toEqual({ omschrijvingActiviteiten: 'Advies', bron: 'moneybird' })
    expect(schoonJaarrekening(JR_2024)).toEqual(JR_2024)
  })
})

describe('validatie in valideerInvoer', () => {
  it('accepteert een volledige jaarrekening, een lege en geen', () => {
    expect(valideerInvoer(metJaarrekening(JR_2024))).toEqual([])
    expect(valideerInvoer(metJaarrekening({}))).toEqual([])
    expect(valideerInvoer(metJaarrekening(undefined))).toEqual([])
    expect(valideerInvoer(metJaarrekening({ eind: { liquideMiddelen: -250 }, bron: 'moneybird' }))).toEqual([])
  })

  it('weigert een andere vorm, onbekende posten en rubrieken', () => {
    const pad = 'personen[0].ondernemingen[0].jaarrekening'
    const fouten = (jr: unknown) => valideerInvoer(metJaarrekening(jr)).join('\n')
    expect(fouten('balans')).toContain(`${pad}: moet een object zijn`)
    expect(fouten({ ...JR_2024, ondernemingsvermogen: 1 })).toContain(`${pad}.ondernemingsvermogen: onbekend veld`)
    expect(fouten({ begin: { kas: 1 } })).toContain(`${pad}.begin.kas: onbekende balanspost`)
    expect(fouten({ eind: [1, 2] })).toContain(`${pad}.eind: moet een object zijn`)
    expect(fouten({ eind: { liquideMiddelen: '100' } })).toContain(`${pad}.eind.liquideMiddelen: moet een getal zijn`)
    expect(fouten({ eind: { liquideMiddelen: null } })).toContain(`${pad}.eind.liquideMiddelen: moet een getal zijn`)
    expect(fouten({ eind: { liquideMiddelen: 2e9 } })).toContain(`${pad}.eind.liquideMiddelen: bedrag buiten het redelijke bereik`)
    expect(fouten({ specificaties: [{ post: 'kas', omschrijving: 'x', begin: 1, eind: 1 }] })).toContain(`${pad}.specificaties[0].post: onbekende balanspost`)
    expect(fouten({ specificaties: [{ post: 'voorraden', omschrijving: 'x', begin: 1 }] })).toContain(`${pad}.specificaties[0].eind: verplicht bedrag ontbreekt`)
    expect(fouten({ specificaties: [{ post: 'voorraden', omschrijving: 'x', begin: 1, eind: 1, rekening: 'NL00' }] })).toContain(`${pad}.specificaties[0].rekening: onbekend veld`)
    expect(fouten({ mva: { aanschafwaarde: -1, restwaarde: 0 } })).toContain(`${pad}.mva.aanschafwaarde: mag niet negatief zijn`)
    expect(fouten({ mva: { aanschafwaarde: 100 } })).toContain(`${pad}.mva.restwaarde: verplicht bedrag ontbreekt`)
    expect(fouten({ onttrekkingen: [{ bedrag: 1 }] })).toContain(`${pad}.onttrekkingen[0].omschrijving: verplichte tekst ontbreekt`)
    expect(fouten({ stortingen: [{ omschrijving: 'x'.repeat(201), bedrag: 1 }] })).toContain(`${pad}.stortingen[0].omschrijving: tekst is langer dan 200 tekens`)
    expect(fouten({ onttrekkingen: Array.from({ length: 51 }, () => ({ omschrijving: 'x', bedrag: 1 })) })).toContain(`${pad}.onttrekkingen: maximaal 50 regels`)
    expect(fouten({ onttrekkingen: { omschrijving: 'x', bedrag: 1 } })).toContain(`${pad}.onttrekkingen: moet een lijst zijn`)
    expect(fouten({ winstEnVerlies: [{ rubriek: 'omzet', bedrag: 1 }, { rubriek: 'omzet', bedrag: 2 }] })).toContain(`${pad}.winstEnVerlies[1].rubriek: rubriek omzet komt twee keer voor`)
    expect(fouten({ winstEnVerlies: [{ rubriek: 'subsidie', bedrag: 1 }] })).toContain(`${pad}.winstEnVerlies[0].rubriek: onbekende rubriek`)
    expect(fouten({ omschrijvingActiviteiten: 'x'.repeat(1001) })).toContain(`${pad}.omschrijvingActiviteiten: tekst is langer dan 1000 tekens`)
    expect(fouten({ omschrijvingActiviteiten: 12 })).toContain(`${pad}.omschrijvingActiviteiten: moet tekst zijn`)
    expect(fouten({ bron: 'exact' })).toContain(`${pad}.bron: moet 'moneybird' of 'handmatig' zijn`)
  })
})

describe('nieuw jaar', () => {
  it('de eindbalans wordt de beginbalans en de omschrijving van de activiteiten blijft; de rest blijft bij het vorige jaar', () => {
    const vorig = metJaarrekening(JR_2024)
    const n = nieuwJaarUitVorig(vorig, 2025)
    expect(n.personen[0].ondernemingen[0].jaarrekening).toEqual({ begin: JR_2024.eind, omschrijvingActiviteiten: 'Advies en ontwikkeling' })
    expect(valideerInvoer(n)).toEqual([])
    // Origineel ongewijzigd en geen gedeelde verwijzing.
    expect(vorig.personen[0].ondernemingen[0].jaarrekening).toEqual(JR_2024)
    n.personen[0].ondernemingen[0].jaarrekening!.begin!.liquideMiddelen = 1
    expect(vorig.personen[0].ondernemingen[0].jaarrekening!.eind!.liquideMiddelen).toBe(77020)
  })

  it('zonder eindbalans gaat alleen de omschrijving van de activiteiten mee', () => {
    const { eind: _e, ...zonderEind } = JR_2024
    expect(nieuwJaarUitVorig(metJaarrekening(zonderEind), 2025).personen[0].ondernemingen[0].jaarrekening).toEqual({ omschrijvingActiviteiten: 'Advies en ontwikkeling' })
    const { omschrijvingActiviteiten: _o, ...zonderEindEnOmschrijving } = zonderEind
    expect(nieuwJaarUitVorig(metJaarrekening(zonderEindEnOmschrijving), 2025).personen[0].ondernemingen[0].jaarrekening).toBeUndefined()
    expect(nieuwJaarUitVorig(metJaarrekening({ eind: {}, omschrijvingActiviteiten: '   ' }), 2025).personen[0].ondernemingen[0]).not.toHaveProperty('jaarrekening')
    expect(nieuwJaarUitVorig(metJaarrekening({ eind: {} }), 2025).personen[0].ondernemingen[0]).not.toHaveProperty('jaarrekening')
    expect(nieuwJaarUitVorig(metJaarrekening(undefined), 2025).personen[0].ondernemingen[0]).not.toHaveProperty('jaarrekening')
    expect(jaarrekeningVoorNieuwJaar({ eind: { voorraden: 0 } })).toEqual({ begin: { voorraden: 0 } })
  })
})
