/**
 * Integratietests tegen een echte Postgres. Draaien alleen met IB_TEST_DATABASE_URL, bijvoorbeeld
 * een wegwerpcluster: initdb -D /tmp/pg && pg_ctl -D /tmp/pg -o "-p 55439" start.
 * Alles gebeurt in een eigen schema dat aan het eind wordt verwijderd.
 */
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import type { HuishoudenInvoer } from '@/lib/tax/types'

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const SCHEMA = `ib_test_${Date.now()}_${randomBytes(3).toString('hex')}`

function metSchema(url: string): string {
  const u = new URL(url)
  u.searchParams.set('options', `-c search_path=${SCHEMA}`)
  return u.toString()
}

describe.skipIf(!BASIS_URL)('dossier op een echte database', () => {
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
  })

  afterAll(async () => {
    const { getPool } = await import('@/lib/db')
    await getPool().end().catch(() => undefined)
    delete (globalThis as Record<string, unknown>).__ibDb
    await beheer.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await beheer.end()
  })

  it('migreert idempotent, ook bij twee gelijktijdige starts', async () => {
    const { migreer } = await import('@/scripts/migrate')
    const stil = () => undefined
    const [a, b] = await Promise.all([migreer(url, undefined, stil), migreer(url, undefined, stil)])
    expect(a + b).toBeGreaterThan(0)
    expect(Math.min(a, b)).toBe(0)
    expect(await migreer(url, undefined, stil)).toBe(0)
  })

  it('twee gelijktijdige installaties leveren één account op; na 2FA is setup dicht', async () => {
    const { maakGebruiker, activeerTotp, setupAfgerond } = await import('@/lib/auth/gebruiker')
    const { getDb } = await import('@/lib/db')
    const { users } = await import('@/lib/db/schema')
    const [x, y] = await Promise.all([maakGebruiker('een@example.nl', 'wachtwoord-van-12'), maakGebruiker('twee@example.nl', 'wachtwoord-van-12')])
    expect(x && y).toBeTruthy()
    const rijen = await getDb().select().from(users)
    expect(rijen).toHaveLength(1)
    await activeerTotp(rijen[0].id)
    expect(await setupAfgerond()).toBe(true)
    expect(await maakGebruiker('derde@example.nl', 'wachtwoord-van-12')).toBeNull()
    expect(await getDb().select().from(users)).toHaveLength(1)
  })

  it('uitloggen verhoogt de sessiegeneratie', async () => {
    const { eersteGebruiker, verhoogSessieGeneratie, gebruikerOpId } = await import('@/lib/auth/gebruiker')
    const u = (await eersteGebruiker())!
    expect(u.sessieGeneratie).toBe(0)
    await verhoogSessieGeneratie(u.id)
    expect((await gebruikerOpId(u.id))!.sessieGeneratie).toBe(1)
  })

  it('gelijktijdige eerste verzoeken maken één huishouden', async () => {
    const { huishoudenVan } = await import('@/lib/dossier/opslag')
    const { getDb } = await import('@/lib/db')
    const { users, households } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [u] = await getDb().insert(users).values({ email: 'race@example.nl', passwordHash: 'x' }).returning()
    const ids = await Promise.all(Array.from({ length: 6 }, () => huishoudenVan(u.id)))
    expect(new Set(ids).size).toBe(1)
    expect(await getDb().select().from(households).where(eq(households.userId, u.id))).toHaveLength(1)
  })

  it('scheidt huishoudens (geen IDOR) en verwijder-alles wist alleen de eigen rijen', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const { getDb } = await import('@/lib/db')
    const schema = await import('@/lib/db/schema')
    const { eq, inArray } = await import('drizzle-orm')
    const db = getDb()
    const [u1] = await db.insert(schema.users).values({ email: 'u1@example.nl', passwordHash: 'x', totpEnabled: true }).returning()
    const [u2] = await db.insert(schema.users).values({ email: 'u2@example.nl', passwordHash: 'x', totpEnabled: true }).returning()
    const h1 = await opslag.huishoudenVan(u1.id)
    const h2 = await opslag.huishoudenVan(u2.id)
    const invoer = voorbeeldInvoer(2024)
    await opslag.maakJaar(h1, invoer)
    await opslag.maakJaar(h2, invoer)
    await opslag.bewaarJaar(h1, 2024, { invoer, status: 'concept', variant: null })
    await opslag.bewaarAccountant(h1, 2024, { A: { winst: 1 } })
    await opslag.bewaarAccountant(h2, 2024, { A: { winst: 2 } })

    // Huishouden 2 ziet alleen de eigen gegevens.
    expect((await opslag.laadAccountant(h2, 2024))!.regels).toEqual({ A: { winst: 2 } })
    expect(await opslag.laadJaar(h2, 2025)).toBeNull()
    expect(await opslag.verwijderJaar(h2, 2025)).toBe(false)

    const jaarIds = async (h: number) => (await db.select({ id: schema.dossierYears.id }).from(schema.dossierYears).where(eq(schema.dossierYears.householdId, h))).map((r) => r.id)
    const telRijen = async (h: number) => {
      const ids = await jaarIds(h)
      return {
        huishoudens: (await db.select().from(schema.households).where(eq(schema.households.id, h))).length,
        jaren: ids.length,
        snapshots: ids.length ? (await db.select().from(schema.snapshots).where(inArray(schema.snapshots.dossierYearId, ids))).length : 0,
        accountant: ids.length ? (await db.select().from(schema.accountantDocs).where(inArray(schema.accountantDocs.dossierYearId, ids))).length : 0,
      }
    }
    expect(await telRijen(h1)).toEqual({ huishoudens: 1, jaren: 1, snapshots: 2, accountant: 1 })
    const ids1 = await jaarIds(h1)

    await opslag.verwijderAlles(u1.id, false)
    expect(await telRijen(h1)).toEqual({ huishoudens: 0, jaren: 0, snapshots: 0, accountant: 0 })
    expect(await db.select().from(schema.snapshots).where(inArray(schema.snapshots.dossierYearId, ids1))).toHaveLength(0)
    expect(await db.select().from(schema.accountantDocs).where(inArray(schema.accountantDocs.dossierYearId, ids1))).toHaveLength(0)
    expect(await db.select().from(schema.users).where(eq(schema.users.id, u1.id))).toHaveLength(1)
    // Het andere huishouden blijft intact.
    expect(await telRijen(h2)).toEqual({ huishoudens: 1, jaren: 1, snapshots: 1, accountant: 1 })

    await opslag.verwijderAlles(u1.id, true)
    expect(await db.select().from(schema.users).where(eq(schema.users.id, u1.id))).toHaveLength(0)
  })

  it('een versleutelde invoer werkt niet in de rij van een ander huishouden (AAD)', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const { getDb } = await import('@/lib/db')
    const schema = await import('@/lib/db/schema')
    const { and, eq } = await import('drizzle-orm')
    const db = getDb()
    const [a] = await db.insert(schema.users).values({ email: 'aad-a@example.nl', passwordHash: 'x', totpEnabled: true }).returning()
    const [b] = await db.insert(schema.users).values({ email: 'aad-b@example.nl', passwordHash: 'x', totpEnabled: true }).returning()
    const ha = await opslag.huishoudenVan(a.id)
    const hb = await opslag.huishoudenVan(b.id)
    const geheim = { ...(voorbeeldInvoer(2024)) }
    geheim.personen = geheim.personen.map((p) => ({ ...p, naam: p.id === 'A' ? 'Alleen van A' : p.naam }))
    await opslag.maakJaar(ha, geheim)
    await opslag.maakJaar(hb, voorbeeldInvoer(2024))
    // Iemand met schrijftoegang tot de database (maar zonder DOSSIER_KEY) kopieert de rij van A naar B.
    const [rijA] = await db.select().from(schema.dossierYears).where(and(eq(schema.dossierYears.householdId, ha), eq(schema.dossierYears.jaar, 2024)))
    await db.update(schema.dossierYears).set({ invoerEnc: rijA.invoerEnc }).where(and(eq(schema.dossierYears.householdId, hb), eq(schema.dossierYears.jaar, 2024)))
    await expect(opslag.laadJaar(hb, 2024)).rejects.toThrow(/Ontsleutelen mislukt/)
    // A zelf leest gewoon.
    expect((await opslag.laadJaar(ha, 2024))!.invoer.personen[0].naam).toBe('Alleen van A')
  })

  it('leest een oude v1-rij en herschrijft die bij opslaan als v2', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const { versleutel } = await import('@/lib/crypto')
    const { getDb } = await import('@/lib/db')
    const schema = await import('@/lib/db/schema')
    const { and, eq } = await import('drizzle-orm')
    const db = getDb()
    const [u] = await db.insert(schema.users).values({ email: 'legacy@example.nl', passwordHash: 'x', totpEnabled: true }).returning()
    const h = await opslag.huishoudenVan(u.id)
    const invoer = voorbeeldInvoer(2024)
    await opslag.maakJaar(h, invoer)
    const waar = and(eq(schema.dossierYears.householdId, h), eq(schema.dossierYears.jaar, 2024))
    await db.update(schema.dossierYears).set({ invoerEnc: versleutel(invoer) }).where(waar)
    expect((await opslag.laadJaar(h, 2024))!.invoer.jaar).toBe(2024)
    await opslag.bewaarJaar(h, 2024, { invoer, status: 'concept', variant: null })
    const [rij] = await db.select().from(schema.dossierYears).where(waar)
    expect(rij.invoerEnc.startsWith('v2.')).toBe(true)
  })

  it('slaat de invoer versleuteld op', async () => {
    const { getDb } = await import('@/lib/db')
    const schema = await import('@/lib/db/schema')
    const rijen = await getDb().select().from(schema.dossierYears)
    for (const r of rijen) {
      expect(r.invoerEnc.startsWith('v2.')).toBe(true)
      expect(r.invoerEnc).not.toContain('152340')
    }
  })
})
