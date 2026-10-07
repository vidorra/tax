/**
 * Ronde 2 (A5): de kaart "Bronbelasting terugvragen" op het overzicht leest per jaar de opgeslagen invoer en de
 * terugvraagstatus uit de aangiftestaat (lib/dossier/terugvragen-opslag.ts), op een echt SQLite-bestand per test
 * (lib/db/testdb.ts).
 */
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
import type { HuishoudenInvoer, VermogensPositie } from '@/lib/tax/types'

const degiro = (bronbelastingen: VermogensPositie['bronbelastingen']): VermogensPositie => ({
  id: 'degiro',
  omschrijving: 'DEGIRO',
  categorie: 'beleggingen',
  eigenaar: 'A',
  waardeBegin: 150000,
  bronbelastingen,
})

const invoer = (jaar: number, posities: VermogensPositie[]): HuishoudenInvoer => ({
  jaar,
  personen: [{ id: 'A', geboortedatum: '1985-05-05', ondernemingen: [], loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 } }],
  fiscaalPartner: false,
  kinderen: [],
  box3: { posities, schulden: [] },
  verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
})

describe('terugvragen over de jaren op een echte database', () => {
  const vorigeSleutel = process.env.DOSSIER_KEY
  beforeAll(() => {
    process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
  })
  afterAll(() => {
    if (vorigeSleutel === undefined) delete process.env.DOSSIER_KEY
    else process.env.DOSSIER_KEY = vorigeSleutel
  })
  gebruikTijdelijkeDb()

  it('telt open verzoeken van alle jaren, laat Aangevraagd en kleine bedragen weg', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const staat = await import('@/lib/dossier/aangiftestaat-opslag')
    const { laadTerugvragen } = await import('@/lib/dossier/terugvragen-opslag')
    const { getDb } = await import('@/lib/db')
    const schema = await import('@/lib/db/schema')
    const u = getDb().insert(schema.users).values({ email: 'a5@example.nl', passwordHash: 'x', totpEnabled: true }).returning().get()!
    const h = await opslag.huishoudenVan(u.id)

    expect(await laadTerugvragen(h, '2026-10-05')).toBeNull()

    const ch = { id: 'bb-ch', land: 'CH', soort: 'dividend' as const, brutoInkomsten: 5000, bedrag: 1750 }
    const fr = { id: 'bb-fr', land: 'FR', soort: 'dividend' as const, brutoInkomsten: 100, bedrag: 25 }
    await opslag.maakJaar(h, invoer(2025, [degiro([ch, fr])]))
    await opslag.maakJaar(h, invoer(2026, [degiro([ch])]))

    const open = await laadTerugvragen(h, '2026-10-05')
    expect(open).toEqual({ aantal: 2, bedrag: 2000, eerste: { datum: '2028-12-31', landNaam: 'Zwitserland', jaar: 2025 }, jaar: 2025 })

    await staat.wijzigAangifteStaat(h, 2025, [{ soort: 'terugvraag', sleutel: 'degiro/bb-ch', waarde: { status: 'aangevraagd', op: '2026-10-05T10:00:00.000Z' } }])
    expect(await laadTerugvragen(h, '2026-10-05')).toEqual({ aantal: 1, bedrag: 1000, eerste: { datum: '2029-12-31', landNaam: 'Zwitserland', jaar: 2026 }, jaar: 2026 })

    await staat.wijzigAangifteStaat(h, 2026, [{ soort: 'terugvraag', sleutel: 'degiro/bb-ch', waarde: { status: 'laten', op: '2026-10-05T10:00:00.000Z' } }])
    expect(await laadTerugvragen(h, '2026-10-05')).toBeNull()
  })
})
