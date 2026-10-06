/**
 * Review ronde 2, bevindingen 14, 15 en 20 (met IB_TEST_DATABASE_URL, eigen schema, aan het eind weg):
 * - Vervangen met een concept uit het bestand zet een Ingediend jaar niet terug: het blijft Ingediend, de indiendatum
 *   blijft staan en het jaar is "gewijzigd na indienen".
 * - Het overzicht krijgt het geldige herstelpunt (`actiefHerstelpunt`), ook zonder de state van de import.
 * - Na 30 dagen is het herstelpunt weg, ook zonder nieuwe import (`ruimVerlopenHerstelpuntenOp`, `actiefHerstelpunt`).
 */
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { leegInvoer } from '@/lib/dossier/leeg'

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const SCHEMA = `ib_herstel_${Date.now()}_${randomBytes(3).toString('hex')}`

function invoer(jaar: number, omschrijving: string): HuishoudenInvoer {
  const i = leegInvoer(jaar)
  i.personen[0].geboortedatum = '1988-03-14'
  i.box3.posities = [{ id: 'p-1', omschrijving, categorie: 'bankNL', eigenaar: 'A', waardeBegin: 80_000 }]
  return i
}

describe.skipIf(!BASIS_URL)('herstelpunt en status bij de JSON-import, op een echte database', () => {
  let url = ''
  let sleutel = ''
  let beheer: Client
  let envKopie: NodeJS.ProcessEnv

  beforeAll(async () => {
    envKopie = { ...process.env }
    const u = new URL(BASIS_URL!)
    u.searchParams.set('options', `-c search_path=${SCHEMA}`)
    url = u.toString()
    sleutel = randomBytes(32).toString('base64')
    beheer = new Client({ connectionString: BASIS_URL })
    await beheer.connect()
    await beheer.query(`CREATE SCHEMA ${SCHEMA}`)
    delete (globalThis as Record<string, unknown>).__ibDb
    process.env.DATABASE_URL = url
    process.env.DOSSIER_KEY = sleutel
    const { migreer } = await import('@/scripts/migrate')
    await migreer(url, undefined, () => undefined)
  })
  beforeEach(() => {
    process.env.DATABASE_URL = url
    process.env.DOSSIER_KEY = sleutel
  })
  afterAll(async () => {
    const { getPool } = await import('@/lib/db')
    await getPool().end().catch(() => undefined)
    delete (globalThis as Record<string, unknown>).__ibDb
    await beheer.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await beheer.end()
    process.env = envKopie
  })

  async function huishouden(email: string): Promise<{ userId: number; householdId: number }> {
    const { getDb } = await import('@/lib/db')
    const { users } = await import('@/lib/db/schema')
    const { huishoudenVan } = await import('@/lib/dossier/opslag')
    const [u] = await getDb().insert(users).values({ email, passwordHash: 'x', totpEnabled: true }).returning()
    return { userId: u.id, householdId: await huishoudenVan(u.id) }
  }

  it('Vervangen met een concept laat een Ingediend jaar op Ingediend staan, met de indiendatum', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const { controleerVerzoek, importeerJson, actiefHerstelpunt } = await import('@/lib/dossier/import-opslag')
    const ctx = await huishouden('status@example.nl')
    await opslag.maakJaar(ctx.householdId, invoer(2024, 'Spaarrekening'))
    await opslag.bewaarJaar(ctx.householdId, 2024, { invoer: invoer(2024, 'Spaarrekening'), status: 'ingediend', variant: null })
    const voor = (await opslag.lijstJaren(ctx.householdId)).find((j) => j.jaar === 2024)!
    expect(voor.status).toBe('ingediend')
    const ingediendOp = await beheer.query(`SELECT ingediend_op FROM ${SCHEMA}.dossier_years WHERE household_id = $1 AND jaar = 2024`, [ctx.householdId])

    const r = await importeerJson(
      ctx,
      controleerVerzoek({ formaat: 'ibcalculator-jaar', versie: 1, jaren: [{ jaar: 2024, actie: 'vervangen', invoer: invoer(2024, 'Uit een oude export'), status: 'concept' }] }),
      { nu: new Date('2026-10-05T10:00:00Z') },
    )
    expect(r.meldingen).toEqual(['2024 is vervangen; de vorige versie is bewaard. Het blijft op Ingediend staan, want je had het al ingediend.'])
    const na = await beheer.query(`SELECT status, ingediend_op, gewijzigd_na_indienen FROM ${SCHEMA}.dossier_years WHERE household_id = $1 AND jaar = 2024`, [ctx.householdId])
    expect(na.rows[0].status).toBe('ingediend')
    expect(new Date(na.rows[0].ingediend_op).getTime()).toBe(new Date(ingediendOp.rows[0].ingediend_op).getTime())
    expect(na.rows[0].gewijzigd_na_indienen).toBe(true)

    // Het overzicht kent het herstelpunt ook zonder de state van de import (na herladen).
    const actief = await actiefHerstelpunt(ctx.householdId, { nu: new Date('2026-10-20T10:00:00Z') })
    expect(actief).toEqual({ herstelpuntId: r.herstelpuntId, aangemaakt: '2026-10-05', tot: '2026-11-04', toegevoegd: [], vervangen: [2024], gegevens: false })
  })

  it('na 30 dagen is het herstelpunt weg, ook zonder nieuwe import', async () => {
    const { controleerVerzoek, importeerJson, actiefHerstelpunt, ruimVerlopenHerstelpuntenOp, telHerstelpunten } = await import('@/lib/dossier/import-opslag')
    const een = await huishouden('oud1@example.nl')
    const twee = await huishouden('oud2@example.nl')
    const v = (jaar: number) => controleerVerzoek({ formaat: 'ibcalculator-jaar', versie: 1, jaren: [{ jaar, actie: 'toevoegen', invoer: invoer(jaar, 'Rekening') }] })
    await importeerJson(een, v(2025))
    await importeerJson(twee, v(2025))
    await beheer.query(`UPDATE ${SCHEMA}.herstelpunten SET aangemaakt = now() - interval '45 days' WHERE household_id = $1`, [een.householdId])

    // Het overzicht toont een verlopen herstelpunt niet en ruimt het meteen op.
    expect(await actiefHerstelpunt(een.householdId)).toBeNull()
    expect(await telHerstelpunten(een.householdId)).toBe(0)
    expect(await actiefHerstelpunt(twee.householdId)).not.toBeNull()

    // Ook de opruiming zonder overzicht (paginaContext, back-up) haalt alleen verlopen herstelpunten weg.
    await beheer.query(`UPDATE ${SCHEMA}.herstelpunten SET aangemaakt = now() - interval '31 days' WHERE household_id = $1`, [twee.householdId])
    await ruimVerlopenHerstelpuntenOp()
    expect(await telHerstelpunten(twee.householdId)).toBe(0)
  })
})
