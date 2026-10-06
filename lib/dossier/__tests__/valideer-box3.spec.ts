import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, VermogensPositie } from '@/lib/tax/types'
import { leegInvoer, valideerInvoer } from '..'

/** Invoer met één box 3-positie en één schuld; `pos` en `schuld` overschrijven velden (ook met ongeldige waarden). */
function invoer(pos: Record<string, unknown> = {}, schuld: Record<string, unknown> = {}): HuishoudenInvoer {
  const i = leegInvoer(2026)
  i.box3.posities = [{ id: 'p1', omschrijving: 'Beleggingsrekening', categorie: 'beleggingen', eigenaar: 'A', waardeBegin: 200000, waardeEind: 220000, ...pos } as VermogensPositie]
  i.box3.schulden = [{ id: 's1', omschrijving: 'Lening', eigenaar: 'A', waardeBegin: 10000, ...schuld }]
  return i
}

describe('valideerInvoer: box 3 voor het werkelijk rendement', () => {
  it('accepteert stortingen, opnames, opbrengsten, eigen gebruik en betaalde rente', () => {
    expect(valideerInvoer(invoer({ stortingen: 20000, onttrekkingen: 0, directeOpbrengsten: 3000 }, { betaaldeRente: 400 }))).toEqual([])
    expect(
      valideerInvoer(invoer({ categorie: 'onroerend', waardeBegin: 300000, waardeEind: 310000, directeOpbrengsten: 12000, woz: { begin: 300000, eind: 310000, dagenEigenGebruik: 30 } })),
    ).toEqual([])
  })

  it('staat negatieve directe opbrengsten toe (negatieve rente)', () => {
    expect(valideerInvoer(invoer({ categorie: 'bankNL', directeOpbrengsten: -25 }))).toEqual([])
  })

  it('weigert negatieve stortingen en opnames', () => {
    const fouten = valideerInvoer(invoer({ stortingen: -1, onttrekkingen: -30000 }))
    expect(fouten).toContain('box3.posities[0].stortingen: mag niet negatief zijn')
    expect(fouten).toContain('box3.posities[0].onttrekkingen: mag niet negatief zijn')
  })

  it('weigert tekst in plaats van een bedrag', () => {
    const fouten = valideerInvoer(invoer({ stortingen: '20000', directeOpbrengsten: '3000' }, { betaaldeRente: '800' }))
    expect(fouten).toEqual(
      expect.arrayContaining([
        'box3.posities[0].stortingen: moet een getal zijn',
        'box3.posities[0].directeOpbrengsten: moet een getal zijn',
        'box3.schulden[0].betaaldeRente: moet een getal zijn',
      ]),
    )
  })

  it('controleert de WOZ-gegevens en de dagen eigen gebruik', () => {
    const onroerend = { categorie: 'onroerend', waardeBegin: 300000, waardeEind: 300000 }
    expect(valideerInvoer(invoer({ ...onroerend, woz: 300000 }))).toContain('box3.posities[0].woz: moet een object zijn')
    expect(valideerInvoer(invoer({ ...onroerend, woz: { begin: 300000 } }))).toContain('box3.posities[0].woz.eind: verplicht getal ontbreekt')
    expect(valideerInvoer(invoer({ ...onroerend, woz: { begin: -1, eind: 300000 } }))).toContain('box3.posities[0].woz.begin: mag niet negatief zijn')
    for (const dagen of [367, -1, 12.5, '30']) {
      expect(valideerInvoer(invoer({ ...onroerend, woz: { begin: 300000, eind: 300000, dagenEigenGebruik: dagen } }))).toContain(
        'box3.posities[0].woz.dagenEigenGebruik: moet een heel aantal dagen zijn, van 0 tot en met 366',
      )
    }
    expect(valideerInvoer(invoer({ ...onroerend, woz: { begin: 300000, eind: 300000, dagenEigenGebruik: 366 } }))).toEqual([])
  })

  it('weigert negatieve betaalde rente en een ongeldige datum van een categoriewissel', () => {
    expect(valideerInvoer(invoer({}, { betaaldeRente: -5 }))).toContain('box3.schulden[0].betaaldeRente: mag niet negatief zijn')
    expect(valideerInvoer(invoer({ categoriewisselDatum: '31-12-2026' }))).toContain('box3.posities[0].categoriewisselDatum: moet een datum zijn (JJJJ-MM-DD)')
    expect(valideerInvoer(invoer({ categoriewisselDatum: '2026-12-31' }))).toEqual([])
  })
})
