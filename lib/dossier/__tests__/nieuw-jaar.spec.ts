/** Nieuw dossierjaar uit het vorige: wat meegaat en wat bij het vorige jaar blijft (jaarrekening en Moneybird-herkomst). */
import { describe, expect, it } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import type { HuishoudenInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

const BRON: NonNullable<OndernemingInvoer['bron']> = {
  soort: 'moneybird',
  koppelingId: '7',
  administratieId: '123',
  administratieNaam: 'Voorbeeldadministratie',
  jaar: 2024,
  geimporteerdOp: '2025-02-01T10:00:00.000Z',
}

function vorigJaar(): HuishoudenInvoer {
  const inv = voorbeeldInvoer(2024)
  const o = inv.personen[0].ondernemingen[0]
  o.bron = BRON
  o.jaarrekening = {
    begin: { liquideMiddelen: 1000 },
    eind: { liquideMiddelen: 2500, crediteuren: 300 },
    onttrekkingen: [{ omschrijving: 'Privé-opnamen', bedrag: 4000 }],
    winstEnVerlies: [{ rubriek: 'omzet', bedrag: 5800 }],
    omschrijvingActiviteiten: 'Ontwerp en maken van meubels',
    bron: 'moneybird',
  }
  return inv
}

describe('nieuw jaar: jaarrekening en herkomst', () => {
  it('de omschrijving van de activiteiten gaat mee met de eindbalans als beginbalans', () => {
    const n = nieuwJaarUitVorig(vorigJaar(), 2025)
    expect(n.personen[0].ondernemingen[0].jaarrekening).toEqual({
      begin: { liquideMiddelen: 2500, crediteuren: 300 },
      omschrijvingActiviteiten: 'Ontwerp en maken van meubels',
    })
    expect(valideerInvoer(n)).toEqual([])
  })

  it('de herkomst uit Moneybird hoort bij de cijfers van het vorige jaar en gaat niet mee', () => {
    const vorig = vorigJaar()
    const n = nieuwJaarUitVorig(vorig, 2025)
    expect(n.personen[0].ondernemingen[0]).not.toHaveProperty('bron')
    // Het vorige jaar houdt zijn herkomst.
    expect(vorig.personen[0].ondernemingen[0].bron).toEqual(BRON)
  })

  it('zonder jaarrekening en zonder herkomst verandert er niets', () => {
    const vorig = vorigJaar()
    delete vorig.personen[0].ondernemingen[0].bron
    delete vorig.personen[0].ondernemingen[0].jaarrekening
    const o = nieuwJaarUitVorig(vorig, 2025).personen[0].ondernemingen[0]
    expect(o).not.toHaveProperty('bron')
    expect(o).not.toHaveProperty('jaarrekening')
  })
})
