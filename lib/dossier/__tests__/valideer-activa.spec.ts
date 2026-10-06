/** Vormcontrole van het activaregister en de afschrijving in het saldo (G02). */
import { describe, expect, it } from 'vitest'
import { valideerInvoer } from '../valideer'
import { leegInvoer, leegOnderneming } from '../leeg'
import type { ActiefInvoer, HuishoudenInvoer, OndernemingInvoer } from '../../tax/types'

function metOnderneming(o: OndernemingInvoer): HuishoudenInvoer {
  const d = leegInvoer(2026)
  d.personen[0].ondernemingen = [o]
  return d
}

const laptop: ActiefInvoer = { omschrijving: 'Laptop', aanschafdatum: '2025-07-15', aanschafwaarde: 2000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }

function metActief(a: Record<string, unknown>, wb?: OndernemingInvoer['winstberekening']): unknown {
  const o = { ...leegOnderneming(2026), activa: [a as unknown as ActiefInvoer] }
  if (wb) o.winstberekening = wb
  return metOnderneming(o)
}

const pad = 'personen[0].ondernemingen[0]'

describe('valideerInvoer: activaregister', () => {
  it('een volledig actief met alle nieuwe velden is geldig', () => {
    const volledig: ActiefInvoer = {
      ...laptop,
      soort: 'gebouw',
      woz: 250000,
      boekwaardeBegin: 1800,
      verkocht: { datum: '2026-06-30', verkoopprijs: 900 },
      willekeurigBedrag: 500,
      investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: 0.28 },
      bron: 'moneybird',
    }
    expect(valideerInvoer(metActief(volledig as unknown as Record<string, unknown>, { soort: 'saldo', saldo: 50000, afschrijvingenInSaldo: 1200 }))).toEqual([])
  })

  it('onbekende soort en bron, negatieve bedragen en een levensduur van nul', () => {
    const f = valideerInvoer(metActief({ ...laptop, soort: 'machine', bron: 'excel', aanschafwaarde: -10, woz: -1, levensduurJaren: 0 }))
    expect(f).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${pad}.activa[0].soort: onbekende waarde`),
        expect.stringContaining(`${pad}.activa[0].bron: onbekende waarde`),
        `${pad}.activa[0].aanschafwaarde: mag niet negatief zijn`,
        `${pad}.activa[0].woz: mag niet negatief zijn`,
        `${pad}.activa[0].levensduurJaren: moet minstens 1 jaar zijn`,
      ]),
    )
  })

  it('verkoop: datum en prijs verplicht, niet vóór de aanschaf', () => {
    expect(valideerInvoer(metActief({ ...laptop, verkocht: 'ja' }))).toContain(`${pad}.activa[0].verkocht: moet een object zijn`)
    expect(valideerInvoer(metActief({ ...laptop, verkocht: { verkoopprijs: 100 } }))).toContain(`${pad}.activa[0].verkocht.datum: datum ontbreekt`)
    expect(valideerInvoer(metActief({ ...laptop, verkocht: { datum: '2024-01-01', verkoopprijs: 100 } }))).toContain(`${pad}.activa[0].verkocht.datum: ligt vóór de aanschafdatum`)
    expect(valideerInvoer(metActief({ ...laptop, verkocht: { datum: '2026-03-01', verkoopprijs: -5 } }))).toContain(`${pad}.activa[0].verkocht.verkoopprijs: mag niet negatief zijn`)
  })

  it('investeringsaftrek: regeling, jaartal en een percentage als fractie', () => {
    const f = valideerInvoer(metActief({ ...laptop, investeringsaftrek: { regeling: 'geen', jaar: 25, genotenPct: 28 } }))
    expect(f).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${pad}.activa[0].investeringsaftrek.regeling: onbekende waarde`),
        `${pad}.activa[0].investeringsaftrek.jaar: moet een jaartal zijn`,
        `${pad}.activa[0].investeringsaftrek.genotenPct: moet een fractie tussen 0 en 1 zijn`,
      ]),
    )
    expect(valideerInvoer(metActief({ ...laptop, investeringsaftrek: { regeling: 'kia' } }))).toEqual(
      expect.arrayContaining([`${pad}.activa[0].investeringsaftrek.jaar: verplicht getal ontbreekt`, `${pad}.activa[0].investeringsaftrek.genotenPct: verplicht getal ontbreekt`]),
    )
  })

  it('afschrijving in het saldo: een getal, niet negatief', () => {
    expect(valideerInvoer(metActief(laptop as unknown as Record<string, unknown>, { soort: 'saldo', saldo: 1, afschrijvingenInSaldo: 'veel' as unknown as number }))).toContain(
      `${pad}.winstberekening.afschrijvingenInSaldo: moet een getal zijn`,
    )
    expect(valideerInvoer(metActief(laptop as unknown as Record<string, unknown>, { soort: 'saldo', saldo: 1, afschrijvingenInSaldo: -3 }))).toContain(
      `${pad}.winstberekening.afschrijvingenInSaldo: mag niet negatief zijn`,
    )
  })
})

describe('valideerInvoer: desinvesteringen en de velden van de herstelronde (bevinding 16)', () => {
  const metDesinvestering = (d: Record<string, unknown>) => metOnderneming({ ...leegOnderneming(2026), desinvesteringen: [d as never] })

  it('een desinvestering zonder omschrijving komt niet meer door (de engine liep daarop vast)', () => {
    // r7-drempel-validatie.ts, geval b.
    expect(valideerInvoer(metDesinvestering({ verkoopprijs: 3000, investeringsjaar: 2024, genotenPct: 0.28 }))).toContain(`${pad}.desinvesteringen[0].omschrijving: verplichte tekst ontbreekt`)
    expect(valideerInvoer(metDesinvestering({ omschrijving: 'Camera', verkoopprijs: 3000, investeringsjaar: 2024, genotenPct: 0.28, genotenAftrek: 900 }))).toEqual([])
  })

  it('verkoopprijs en genoten aftrek niet negatief, het investeringsjaar een heel jaartal', () => {
    const f = valideerInvoer(metDesinvestering({ omschrijving: 'Camera', verkoopprijs: -1, investeringsjaar: 2024.5, genotenPct: 0.28, genotenAftrek: -2 }))
    expect(f).toEqual(
      expect.arrayContaining([
        `${pad}.desinvesteringen[0].verkoopprijs: mag niet negatief zijn`,
        `${pad}.desinvesteringen[0].genotenAftrek: mag niet negatief zijn`,
        `${pad}.desinvesteringen[0].investeringsjaar: moet een heel jaartal zijn`,
      ]),
    )
    expect(valideerInvoer(metDesinvestering({ omschrijving: 'Camera', verkoopprijs: 1, investeringsjaar: 24, genotenPct: 0 }))).toContain(`${pad}.desinvesteringen[0].investeringsjaar: moet een heel jaartal zijn`)
  })

  it('activaVolledig, overigeVerkopen en doorrolUitgesloten', () => {
    const goed: OndernemingInvoer = { ...leegOnderneming(2026), activaVolledig: true, overigeVerkopen: 1200, doorrolUitgesloten: ['inv:2025:0', 'act:2025:12'], activa: [{ ...laptop, herkomst: 'act:2025:3' }] }
    expect(valideerInvoer(metOnderneming(goed))).toEqual([])
    const fout = { ...leegOnderneming(2026), activaVolledig: 'ja', overigeVerkopen: -5, doorrolUitgesloten: ['laptop', 3], activa: [{ ...laptop, herkomst: 'x' }] } as unknown as OndernemingInvoer
    expect(valideerInvoer(metOnderneming(fout))).toEqual(
      expect.arrayContaining([
        `${pad}.activaVolledig: moet ja of nee (true/false) zijn`,
        `${pad}.overigeVerkopen: mag niet negatief zijn`,
        `${pad}.doorrolUitgesloten[0]: moet 'inv:<jaar>:<nummer>' of 'act:<jaar>:<nummer>' zijn`,
        `${pad}.doorrolUitgesloten[1]: moet 'inv:<jaar>:<nummer>' of 'act:<jaar>:<nummer>' zijn`,
        `${pad}.activa[0].herkomst: moet 'inv:<jaar>:<nummer>' of 'act:<jaar>:<nummer>' zijn`,
      ]),
    )
    expect(valideerInvoer(metOnderneming({ ...leegOnderneming(2026), doorrolUitgesloten: 'inv:2025:0' } as unknown as OndernemingInvoer))).toContain(`${pad}.doorrolUitgesloten: moet een lijst zijn`)
  })
})
