/**
 * Integratietests van de back-upadministratie (tabel backups) tegen een echte Postgres. Draaien alleen met
 * IB_TEST_DATABASE_URL. Alles gebeurt in een eigen schema dat aan het eind wordt verwijderd.
 */
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const SCHEMA = `ib_runs_${Date.now()}_${randomBytes(3).toString('hex')}`

function metSchema(url: string): string {
  const u = new URL(url)
  u.searchParams.set('options', `-c search_path=${SCHEMA}`)
  return u.toString()
}

describe.skipIf(!BASIS_URL)('back-upadministratie op een echte database', () => {
  let beheer: Client
  let db: Client

  /** Zet de start van een run terug in de tijd, alsof hij langer geleden begon. */
  async function terug(id: number, interval: string): Promise<void> {
    await db.query(`UPDATE backups SET gestart_op = gestart_op - $2::interval WHERE id = $1`, [id, interval])
  }

  beforeAll(async () => {
    const url = metSchema(BASIS_URL!)
    beheer = new Client({ connectionString: BASIS_URL })
    await beheer.connect()
    await beheer.query(`CREATE SCHEMA ${SCHEMA}`)
    process.env.DATABASE_URL = url
    delete (globalThis as Record<string, unknown>).__ibDb
    const { migreer } = await import('@/scripts/migrate')
    await migreer(url, undefined, () => undefined)
    db = new Client({ connectionString: url })
    await db.connect()
  })

  afterAll(async () => {
    const { getPool } = await import('@/lib/db')
    await getPool().end().catch(() => undefined)
    delete (globalThis as Record<string, unknown>).__ibDb
    await db.end().catch(() => undefined)
    await beheer.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await beheer.end()
  })

  describe('geplande runs', () => {
    it('vijf gelijktijdige claims op dezelfde periode leveren precies één claim op', async () => {
      const { claimGepland } = await import('../runs')
      const uitkomsten = await Promise.all(Array.from({ length: 5 }, () => claimGepland('2027-02')))
      const claims = uitkomsten.filter((u) => u !== null)
      expect(claims).toHaveLength(1)
      expect(claims[0]!.poging).toBe(1)
      const { rows } = await db.query(`SELECT soort, periode, status, pogingen FROM backups WHERE periode = '2027-02'`)
      expect(rows).toEqual([{ soort: 'gepland', periode: '2027-02', status: 'bezig', pogingen: 1 }])
      // Zolang hij bezig is, claimt niemand anders.
      expect(await claimGepland('2027-02')).toBeNull()
    })

    it('na een mislukte poging pas opnieuw na de wachttijd, met oplopende pogingen', async () => {
      const { claimGepland, rondAf } = await import('../runs')
      const { wachttijdUren } = await import('../planning')
      const { rows } = await db.query<{ id: number }>(`SELECT id FROM backups WHERE periode = '2027-02'`)
      const id = rows[0].id

      await rondAf(id, { status: 'mislukt', fout: 'Mailserver weigerde de verbinding. ' + 'x'.repeat(400) })
      const fout = (await db.query<{ fout: string; afgerond_op: Date | null }>(`SELECT fout, afgerond_op FROM backups WHERE id = $1`, [id])).rows[0]
      expect(fout.fout).toHaveLength(300)
      expect(fout.afgerond_op).not.toBeNull()
      expect(await claimGepland('2027-02')).toBeNull()

      expect(wachttijdUren(1)).toBe(1)
      await terug(id, '2 hours')
      expect(await claimGepland('2027-02')).toEqual({ id, poging: 2 })
      const na = (await db.query(`SELECT status, fout, afgerond_op FROM backups WHERE id = $1`, [id])).rows[0]
      expect(na).toEqual({ status: 'bezig', fout: null, afgerond_op: null })

      // Na poging 2 is de wachttijd 2 uur: na 90 minuten nog niet, na ruim 2 uur wel.
      expect(wachttijdUren(2)).toBe(2)
      await rondAf(id, { status: 'mislukt', fout: 'opnieuw mis' })
      await terug(id, '90 minutes')
      expect(await claimGepland('2027-02')).toBeNull()
      await terug(id, '31 minutes')
      expect(await claimGepland('2027-02')).toEqual({ id, poging: 3 })
    })

    it('na heel veel pogingen blijft de wachttijd 24 uur en loopt de berekening niet over', async () => {
      const { claimGepland, rondAf } = await import('../runs')
      const eerste = (await claimGepland('2030-08'))!
      await rondAf(eerste.id, { status: 'mislukt', fout: 'mis' })
      await db.query(`UPDATE backups SET pogingen = 1000 WHERE id = $1`, [eerste.id])
      await terug(eerste.id, '23 hours')
      expect(await claimGepland('2030-08')).toBeNull()
      await terug(eerste.id, '2 hours')
      expect(await claimGepland('2030-08')).toEqual({ id: eerste.id, poging: 1001 })
    })

    it('een run die langer dan een uur bezig is, mag opnieuw', async () => {
      const { claimGepland } = await import('../runs')
      const eerste = (await claimGepland('2027-08'))!
      expect(eerste.poging).toBe(1)
      await terug(eerste.id, '59 minutes')
      expect(await claimGepland('2027-08')).toBeNull()
      await terug(eerste.id, '2 minutes')
      expect(await claimGepland('2027-08')).toEqual({ id: eerste.id, poging: 2 })
    })

    it('verstuurd en te-groot worden nooit meer geclaimd, ook niet veel later', async () => {
      const { claimGepland, rondAf, gedanePeriodes } = await import('../runs')
      const v = (await claimGepland('2028-02'))!
      await rondAf(v.id, { status: 'verstuurd', bytes: 12345, sha256: 'a'.repeat(64), rijen: { users: 1, households: 1 } })
      const g = (await claimGepland('2028-08'))!
      await rondAf(g.id, { status: 'te-groot', bytes: 30_000_000, sha256: 'b'.repeat(64), rijen: { users: 1 } })
      await terug(v.id, '400 days')
      await terug(g.id, '400 days')
      expect(await claimGepland('2028-02')).toBeNull()
      expect(await claimGepland('2028-08')).toBeNull()

      const gedaan = await gedanePeriodes()
      expect(gedaan).toEqual(new Set(['2028-02', '2028-08']))
    })

    it('rondAf verandert een run die al klaar is niet meer', async () => {
      const { claimGepland, rondAf } = await import('../runs')
      const r = (await claimGepland('2029-02'))!
      await rondAf(r.id, { status: 'verstuurd', bytes: 10 })
      await rondAf(r.id, { status: 'mislukt', fout: 'te laat' })
      const { rows } = await db.query(`SELECT status, fout, bytes FROM backups WHERE id = $1`, [r.id])
      expect(rows[0]).toEqual({ status: 'verstuurd', fout: null, bytes: 10 })
    })

    it('weigert een periode in de verkeerde vorm en de database bewaakt soort en periode', async () => {
      const { claimGepland } = await import('../runs')
      await expect(claimGepland('2027-2')).rejects.toThrow(/JJJJ-MM/)
      await expect(db.query(`INSERT INTO backups (soort, status) VALUES ('gepland', 'bezig')`)).rejects.toThrow(/backups_periode_bij_gepland/)
      await expect(db.query(`INSERT INTO backups (soort, periode, status) VALUES ('handmatig', '2027-02', 'bezig')`)).rejects.toThrow(/backups_periode_bij_gepland/)
      await expect(db.query(`INSERT INTO backups (soort, status) VALUES ('handmatig', 'klaar')`)).rejects.toThrow(/check/)
    })
  })

  describe('status lezen', () => {
    it('laatsteRun en laatsteGeslaagd geven nette BackupRun-objecten', async () => {
      const { laatsteRun, laatsteGeslaagd } = await import('../runs')
      await db.query(`DELETE FROM backups`)
      expect(await laatsteRun()).toBeNull()
      expect(await laatsteGeslaagd()).toBeNull()

      await db.query(`INSERT INTO backups (soort, periode, status, pogingen, gestart_op, afgerond_op, bytes, sha256, rijen) VALUES
        ('gepland', '2027-02', 'verstuurd', 2, '2027-02-01 03:00:00+01', '2027-02-01 03:00:05.5+01', 2048, 'abc', '{"users": 1, "households": 2}')`)
      await db.query(`INSERT INTO backups (soort, status, gestart_op, fout) VALUES ('handmatig', 'mislukt', '2027-03-01 10:00:00+01', 'Mailen mislukt')`)

      expect(await laatsteRun()).toEqual({
        id: expect.any(Number),
        soort: 'handmatig',
        periode: null,
        status: 'mislukt',
        pogingen: 1,
        gestartOp: '2027-03-01T09:00:00.000Z',
        afgerondOp: null,
        bytes: null,
        sha256: null,
        rijen: null,
        fout: 'Mailen mislukt',
      })
      expect(await laatsteGeslaagd()).toEqual({
        id: expect.any(Number),
        soort: 'gepland',
        periode: '2027-02',
        status: 'verstuurd',
        pogingen: 2,
        gestartOp: '2027-02-01T02:00:00.000Z',
        afgerondOp: '2027-02-01T02:00:05.500Z',
        bytes: 2048,
        sha256: 'abc',
        rijen: { users: 1, households: 2 },
        fout: null,
      })
    })
  })

  describe('handmatige runs', () => {
    beforeEach(async () => {
      await db.query(`DELETE FROM backups`)
    })

    it('weigert bezig zolang een run van de laatste 10 minuten loopt, ook een geplande', async () => {
      const { startHandmatig, claimGepland, rondAf } = await import('../runs')
      const gepland = (await claimGepland('2031-02'))!
      expect(await startHandmatig()).toEqual({ geweigerd: 'bezig' })
      // Langer dan 10 minuten bezig telt niet meer als blokkade.
      await terug(gepland.id, '11 minutes')
      const eerste = await startHandmatig()
      expect(eerste).toEqual({ id: expect.any(Number) })
      expect(await startHandmatig()).toEqual({ geweigerd: 'bezig' })
      await rondAf((eerste as { id: number }).id, { status: 'verstuurd' })
      expect(await startHandmatig()).toEqual({ id: expect.any(Number) })
    })

    it('gelijktijdige aanroepen starten er precies één', async () => {
      const { startHandmatig } = await import('../runs')
      const uitkomsten = await Promise.all(Array.from({ length: 5 }, () => startHandmatig()))
      expect(uitkomsten.filter((u) => 'id' in u)).toHaveLength(1)
      expect(uitkomsten.filter((u) => 'geweigerd' in u && u.geweigerd === 'bezig')).toHaveLength(4)
      expect((await db.query(`SELECT count(*)::int AS n FROM backups`)).rows[0].n).toBe(1)
    })

    it('weigert te-vaak bij drie handmatige runs in het afgelopen uur, ook bij gelijktijdige aanroepen', async () => {
      const { startHandmatig, rondAf } = await import('../runs')
      // Twee eerdere runs dit uur, waarvan één mislukt: die tellen allebei mee.
      await db.query(`INSERT INTO backups (soort, status, gestart_op) VALUES
        ('handmatig', 'verstuurd', now() - interval '50 minutes'), ('handmatig', 'mislukt', now() - interval '20 minutes'),
        ('handmatig', 'verstuurd', now() - interval '61 minutes')`)

      const uitkomsten = await Promise.all(Array.from({ length: 5 }, () => startHandmatig()))
      const gestart = uitkomsten.filter((u): u is { id: number } => 'id' in u)
      expect(gestart).toHaveLength(1)
      await rondAf(gestart[0].id, { status: 'verstuurd' })

      expect(await startHandmatig()).toEqual({ geweigerd: 'te-vaak' })
      const nogmaals = await Promise.all(Array.from({ length: 5 }, () => startHandmatig()))
      expect(nogmaals).toEqual(Array.from({ length: 5 }, () => ({ geweigerd: 'te-vaak' })))
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM backups WHERE soort = 'handmatig' AND gestart_op > now() - interval '1 hour'`)
      expect(rows[0].n).toBe(3)

      // Als de oudste run uit het uur valt, mag het weer.
      await db.query(`UPDATE backups SET gestart_op = gestart_op - interval '15 minutes' WHERE gestart_op < now() - interval '45 minutes'`)
      expect(await startHandmatig()).toEqual({ id: expect.any(Number) })
    })
  })
})
