/**
 * Ronde 2 (A5): de kaart "Bronbelasting terugvragen" op het overzicht leest per jaar de opgeslagen invoer en de
 * terugvraagstatus uit de aangiftestaat (lib/dossier/terugvragen-opslag.ts), tegen een echte Postgres. Draait alleen
 * met IB_TEST_DATABASE_URL, in een eigen schema dat aan het eind wordt verwijderd.
 */
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, VermogensPositie } from '@/lib/tax/types'

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const SCHEMA = `ib_test_a5_${Date.now()}_${randomBytes(3).toString('hex')}`

function metSchema(url: string): string {
  const u = new URL(url)
  u.searchParams.set('options', `-c search_path=${SCHEMA}`)
  return u.toString()
}

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

describe.skipIf(!BASIS_URL)('terugvragen over de jaren op een echte database', () => {
  let url = ''
  let beheer: Client

  beforeAll(async () => {
    url = metSchema(BASIS_URL!)
    beheer = new Client({ connectionString: BASIS_URL })
    await beheer.connect()
    await beheer.query(`CREATE SCHEMA ${SCHEMA}`)
    process.env.DATABASE_URL = url
    process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
    delete (globalThis as Record<string, unknown>).__ibDb
    const { migreer } = await import('@/scripts/migrate')
    await migreer(url, undefined, () => undefined)
  })

  afterAll(async () => {
    const { getPool } = await import('@/lib/db')
    await getPool().end().catch(() => undefined)
    delete (globalThis as Record<string, unknown>).__ibDb
    await beheer.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await beheer.end()
  })

  it('telt open verzoeken van alle jaren, laat Aangevraagd en kleine bedragen weg', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const staat = await import('@/lib/dossier/aangiftestaat-opslag')
    const { laadTerugvragen } = await import('@/lib/dossier/terugvragen-opslag')
    const { getDb } = await import('@/lib/db')
    const schema = await import('@/lib/db/schema')
    const [u] = await getDb().insert(schema.users).values({ email: 'a5@example.nl', passwordHash: 'x', totpEnabled: true }).returning()
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
