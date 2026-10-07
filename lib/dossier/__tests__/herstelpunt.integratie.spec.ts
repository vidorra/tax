/**
 * Review ronde 2, bevindingen 14, 15 en 20 (per test een eigen SQLite-bestand, zie lib/db/testdb.ts):
 * - Vervangen met een concept uit het bestand zet een Ingediend jaar niet terug: het blijft Ingediend, de indiendatum
 *   blijft staan en het jaar is "gewijzigd na indienen".
 * - Het overzicht krijgt het geldige herstelpunt (`actiefHerstelpunt`), ook zonder de state van de import.
 * - Na 30 dagen is het herstelpunt weg, ook zonder nieuwe import (`ruimVerlopenHerstelpuntenOp`, `actiefHerstelpunt`).
 */
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb, getSqlite } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { leegInvoer } from '@/lib/dossier/leeg'

const DAG_MS = 24 * 60 * 60 * 1000

function invoer(jaar: number, omschrijving: string): HuishoudenInvoer {
  const i = leegInvoer(jaar)
  i.personen[0].geboortedatum = '1988-03-14'
  i.box3.posities = [{ id: 'p-1', omschrijving, categorie: 'bankNL', eigenaar: 'A', waardeBegin: 80_000 }]
  return i
}

/** Ruwe rij van een jaar, zoals hij in het bestand staat (tijdstip als ISO-tekst, boolean als 0/1). */
function ruweJaarRij(householdId: number, jaar: number) {
  return getSqlite().prepare('SELECT status, ingediend_op, gewijzigd_na_indienen FROM dossier_years WHERE household_id = ? AND jaar = ?').get(householdId, jaar) as {
    status: string
    ingediend_op: string | null
    gewijzigd_na_indienen: number
  }
}

/** Zet het moment van de herstelpunten van een huishouden `dagen` terug. */
function verouder(householdId: number, dagen: number) {
  getSqlite().prepare('UPDATE herstelpunten SET aangemaakt = ? WHERE household_id = ?').run(new Date(Date.now() - dagen * DAG_MS).toISOString(), householdId)
}

describe('herstelpunt en status bij de JSON-import, op een echte database', () => {
  const vorigeSleutel = process.env.DOSSIER_KEY
  beforeAll(() => {
    process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
  })
  afterAll(() => {
    if (vorigeSleutel === undefined) delete process.env.DOSSIER_KEY
    else process.env.DOSSIER_KEY = vorigeSleutel
  })
  gebruikTijdelijkeDb()

  async function huishouden(email: string): Promise<{ userId: number; householdId: number }> {
    const { huishoudenVan } = await import('@/lib/dossier/opslag')
    const u = getDb().insert(users).values({ email, passwordHash: 'x', totpEnabled: true }).returning().get()!
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
    const ingediendOp = ruweJaarRij(ctx.householdId, 2024).ingediend_op
    expect(ingediendOp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    const r = await importeerJson(
      ctx,
      controleerVerzoek({ formaat: 'ibcalculator-jaar', versie: 1, jaren: [{ jaar: 2024, actie: 'vervangen', invoer: invoer(2024, 'Uit een oude export'), status: 'concept' }] }),
      { nu: new Date('2026-10-05T10:00:00Z') },
    )
    expect(r.meldingen).toEqual(['2024 is vervangen; de vorige versie is bewaard. Het blijft op Ingediend staan, want je had het al ingediend.'])
    const na = ruweJaarRij(ctx.householdId, 2024)
    expect(na.status).toBe('ingediend')
    expect(na.ingediend_op).toBe(ingediendOp)
    expect(na.gewijzigd_na_indienen).toBe(1)

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
    verouder(een.householdId, 45)

    // Het overzicht toont een verlopen herstelpunt niet en ruimt het meteen op.
    expect(await actiefHerstelpunt(een.householdId)).toBeNull()
    expect(await telHerstelpunten(een.householdId)).toBe(0)
    expect(await actiefHerstelpunt(twee.householdId)).not.toBeNull()

    // Ook de opruiming zonder overzicht (paginaContext, back-up) haalt alleen verlopen herstelpunten weg.
    verouder(twee.householdId, 31)
    await ruimVerlopenHerstelpuntenOp()
    expect(await telHerstelpunten(twee.householdId)).toBe(0)
  })
})
