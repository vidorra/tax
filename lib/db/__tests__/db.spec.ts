/**
 * De databaselaag op een echt SQLite-bestand: lui openen, instellingen, schrijf() en lees(), tijdstippen,
 * booleans, JSON, foreign keys, STRICT-tabellen en het herkennen van fouten. Elke test een eigen bestand.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { eq, lt } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { databasemapSchrijfbaar, dbFoutSoort, dbGeconfigureerd, dbPad, getDb, getSqlite, leegWal, lees, openSqlite, probeerLeegWal, schrijf, sluitDb } from '@/lib/db'
import { backups, households, leesTijdstip, users } from '@/lib/db/schema'
import { gebruikTijdelijkeDb, openTijdelijkeDb } from '@/lib/db/testdb'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const maakGebruiker = (email = 'een@example.nl') => getDb().insert(users).values({ email, passwordHash: 'x' }).returning().get()

describe('openen en instellingen', () => {
  const opruimen: Array<() => void> = []
  afterEach(() => {
    while (opruimen.length) opruimen.pop()!()
  })

  it('opent pas bij de eerste aanroep, maakt de map aan en zet WAL, foreign keys, synchronous, busy_timeout en secure_delete', () => {
    const map = mkdtempSync(join(tmpdir(), 'ib-db-'))
    const vorige = process.env.DATABASE_PATH
    opruimen.push(() => {
      sluitDb()
      if (vorige === undefined) delete process.env.DATABASE_PATH
      else process.env.DATABASE_PATH = vorige
      rmSync(map, { recursive: true, force: true })
    })
    sluitDb()
    const pad = join(map, 'nog', 'niet', 'ib.db')
    process.env.DATABASE_PATH = pad
    expect(dbPad()).toBe(pad)
    expect(dbGeconfigureerd()).toBe(true)
    expect(existsSync(pad)).toBe(false)

    const sqlite = getSqlite()
    expect(existsSync(pad)).toBe(true)
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(sqlite.pragma('synchronous', { simple: true })).toBe(1)
    expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect(sqlite.pragma('secure_delete', { simple: true })).toBe(1)
    expect(getSqlite()).toBe(sqlite)
  })

  it('opent opnieuw na sluitDb() en volgt een gewijzigd DATABASE_PATH', () => {
    const a = openTijdelijkeDb()
    opruimen.push(() => a.opruimen())
    maakGebruiker()
    const eerste = getSqlite()
    sluitDb()
    expect(eerste.open).toBe(false)
    expect(getDb().select().from(users).all()).toHaveLength(1)

    const b = openTijdelijkeDb()
    opruimen.push(() => b.opruimen())
    expect(getSqlite().name).toBe(b.pad)
    expect(getDb().select().from(users).all()).toHaveLength(0)
  })

  it('dbPad: standaard data/ibcalculator.db in de werkmap, een relatief DATABASE_PATH vanaf de werkmap', () => {
    expect(dbPad({})).toBe(join(process.cwd(), 'data', 'ibcalculator.db'))
    expect(dbPad({ DATABASE_PATH: '  ' })).toBe(join(process.cwd(), 'data', 'ibcalculator.db'))
    expect(dbPad({ DATABASE_PATH: 'tmp/x.db' })).toBe(resolve('tmp/x.db'))
    expect(dbPad({ DATABASE_PATH: '/app/data/ibcalculator.db' })).toBe('/app/data/ibcalculator.db')
  })

  it('databasemapSchrijfbaar: bestaand bestand, nog aan te maken map, een map als pad en een map zonder schrijfrecht', () => {
    const map = mkdtempSync(join(tmpdir(), 'ib-db-'))
    opruimen.push(() => {
      chmodSync(join(map, 'dicht'), 0o700)
      rmSync(map, { recursive: true, force: true })
    })
    writeFileSync(join(map, 'ib.db'), '')
    expect(databasemapSchrijfbaar(join(map, 'ib.db'))).toBe(true)
    expect(databasemapSchrijfbaar(join(map, 'a', 'b', 'ib.db'))).toBe(true)
    expect(databasemapSchrijfbaar(map)).toBe(false)
    expect(databasemapSchrijfbaar(join(map, 'ib.db', 'onder-een-bestand.db'))).toBe(false)
    mkdirSync(join(map, 'dicht'))
    chmodSync(join(map, 'dicht'), 0o500)
    // Als root mag alles; dan zegt deze controle niets.
    if (process.getuid?.() !== 0) expect(databasemapSchrijfbaar(join(map, 'dicht', 'ib.db'))).toBe(false)
  })
})

describe('schrijf() en lees()', () => {
  const db = gebruikTijdelijkeDb()

  it('legt vast en geeft de uitkomst terug', () => {
    const id = schrijf((tx) => tx.insert(users).values({ email: 'a@example.nl', passwordHash: 'x' }).returning({ id: users.id }).get()!.id)
    expect(id).toBe(1)
    expect(getDb().select().from(users).all()).toHaveLength(1)
    expect(db.pad).toMatch(/ibcalculator\.db$/)
  })

  it('rolt alles terug bij een fout', () => {
    expect(() =>
      schrijf((tx) => {
        tx.insert(users).values({ email: 'a@example.nl', passwordHash: 'x' }).run()
        throw new Error('stop')
      }),
    ).toThrow('stop')
    expect(getDb().select().from(users).all()).toHaveLength(0)
    expect(getSqlite().inTransaction).toBe(false)
  })

  it('een schrijf() binnen een schrijf() is een savepoint: alleen het binnenste rolt terug', () => {
    schrijf((tx) => {
      tx.insert(users).values({ email: 'buiten@example.nl', passwordHash: 'x' }).run()
      expect(() =>
        schrijf((binnen) => {
          binnen.insert(users).values({ email: 'binnen@example.nl', passwordHash: 'x' }).run()
          throw new Error('binnen mislukt')
        }),
      ).toThrow('binnen mislukt')
    })
    expect(getDb().select({ email: users.email }).from(users).all()).toEqual([{ email: 'buiten@example.nl' }])
  })

  it('neemt de schrijflock bij de start (BEGIN IMMEDIATE); een andere verbinding kan dan niet schrijven, wel lezen', () => {
    maakGebruiker()
    const ander = openSqlite(db.pad, { busyTimeoutMs: 0 })
    try {
      schrijf(() => {
        // Nog niets geschreven, toch al de lock: een ander proces kan er niet meer tussen.
        expect(() => ander.prepare('BEGIN IMMEDIATE').run()).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }))
        expect(ander.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 1 })
      })
      ander.prepare('BEGIN IMMEDIATE').run()
      ander.prepare('ROLLBACK').run()
    } finally {
      ander.close()
    }
  })

  it('weigert een async functie en rolt terug', async () => {
    let fout: unknown
    try {
      // @ts-expect-error schrijf() accepteert geen functie die een Promise teruggeeft
      schrijf(async (tx) => {
        tx.insert(users).values({ email: 'async@example.nl', passwordHash: 'x' }).run()
      })
    } catch (e) {
      fout = e
    }
    expect(fout).toBeInstanceOf(TypeError)
    expect(String(fout)).toMatch(/synchrone functie/)
    expect(getDb().select().from(users).all()).toHaveLength(0)
    // @ts-expect-error lees() ook niet
    expect(() => lees(async () => 1)).toThrow(TypeError)
  })

  it('lees() ziet één moment, ook als een ander proces tussendoor schrijft; schrijf() erbinnen kan niet', () => {
    maakGebruiker()
    const ander = openSqlite(db.pad)
    try {
      const [voor, na] = lees((tx) => {
        const voor = tx.select().from(users).all().length
        ander.prepare(`INSERT INTO users (email, password_hash) VALUES ('ander@example.nl', 'x')`).run()
        const na = tx.select().from(users).all().length
        expect(() => schrijf(() => undefined)).toThrow(/schrijf\(\) binnen lees\(\)/)
        return [voor, na]
      })
      expect([voor, na]).toEqual([1, 1])
      expect(getDb().select().from(users).all()).toHaveLength(2)
      // Na de fout in lees() werkt schrijf() weer gewoon.
      schrijf((tx) => tx.update(users).set({ totpEnabled: true }).run())
    } finally {
      ander.close()
    }
  })

  it('await op een query werkt buiten schrijf() gewoon', async () => {
    await getDb().insert(users).values({ email: 'await@example.nl', passwordHash: 'x' })
    const rijen = await getDb().select().from(users).where(eq(users.email, 'await@example.nl'))
    expect(rijen).toHaveLength(1)
  })
})

describe('kolomtypen', () => {
  gebruikTijdelijkeDb()

  it('tijdstippen: ISO-tekst in UTC in de database, Date in de code, standaard het moment van invoegen', () => {
    const voor = Date.now()
    const u = maakGebruiker()
    expect(u.createdAt).toBeInstanceOf(Date)
    expect(u.createdAt.getTime()).toBeGreaterThanOrEqual(voor - 5)
    expect(u.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 5)
    const ruw = getSqlite().prepare('SELECT created_at FROM users').get() as { created_at: string }
    expect(ruw.created_at).toMatch(ISO)

    const moment = new Date('2026-02-01T08:15:30.250Z')
    const h = getDb().insert(households).values({ userId: u.id, gegevensEnc: 'x', updatedAt: moment }).returning().get()
    expect(h.updatedAt.toISOString()).toBe('2026-02-01T08:15:30.250Z')
    expect((getSqlite().prepare('SELECT updated_at FROM households').get() as { updated_at: string }).updated_at).toBe('2026-02-01T08:15:30.250Z')
    expect(getDb().select().from(households).where(lt(households.updatedAt, new Date('2026-02-01T08:15:30.251Z'))).all()).toHaveLength(1)
    expect(getDb().select().from(households).where(lt(households.updatedAt, moment)).all()).toHaveLength(0)
  })

  it('leesTijdstip: een tijd zonder zone telt als UTC; onzin geeft een fout', () => {
    expect(leesTijdstip('2026-08-01 06:00:00').toISOString()).toBe('2026-08-01T06:00:00.000Z')
    expect(leesTijdstip('2026-08-01T06:00:00.5').toISOString()).toBe('2026-08-01T06:00:00.500Z')
    expect(leesTijdstip('2026-08-01T06:00:00.000Z').toISOString()).toBe('2026-08-01T06:00:00.000Z')
    expect(() => leesTijdstip('gisteren')).toThrow()
  })

  it('booleans als 0/1, JSON als tekst', () => {
    const u = maakGebruiker()
    expect(u.totpEnabled).toBe(false)
    getDb().update(users).set({ totpEnabled: true }).where(eq(users.id, u.id)).run()
    expect((getSqlite().prepare('SELECT totp_enabled FROM users').get() as { totp_enabled: number }).totp_enabled).toBe(1)
    expect(getDb().select().from(users).get()!.totpEnabled).toBe(true)

    const b = getDb().insert(backups).values({ soort: 'gepland', periode: '2026-08', status: 'verstuurd', rijen: { users: 1, households: 0 } }).returning().get()
    expect(b.rijen).toEqual({ users: 1, households: 0 })
    expect((getSqlite().prepare('SELECT rijen FROM backups').get() as { rijen: string }).rijen).toBe('{"users":1,"households":0}')
  })

  it('foreign keys met cascade, STRICT-typen en CHECK-constraints werken', () => {
    const u = maakGebruiker()
    getDb().insert(households).values({ userId: u.id, gegevensEnc: 'x' }).run()
    expect(() => getDb().insert(households).values({ userId: 999, gegevensEnc: 'x' }).run()).toThrow(/FOREIGN KEY/)
    getDb().delete(users).where(eq(users.id, u.id)).run()
    expect(getDb().select().from(households).all()).toHaveLength(0)

    expect(() => getSqlite().prepare(`INSERT INTO users (email, password_hash, sessie_generatie) VALUES ('s@example.nl', 'x', 'veel')`).run()).toThrow(/cannot store TEXT value in INTEGER column/)
    expect(() => getSqlite().prepare(`INSERT INTO users (email, password_hash, totp_enabled) VALUES ('t@example.nl', 'x', 2)`).run()).toThrow(/CHECK constraint failed/)
    expect(() => getDb().insert(backups).values({ soort: 'handmatig', periode: '2026-08', status: 'bezig' }).run()).toThrow(/CHECK constraint failed/)
    getDb().insert(backups).values({ soort: 'gepland', periode: '2026-02', status: 'bezig' }).run()
    expect(() => getDb().insert(backups).values({ soort: 'gepland', periode: '2026-02', status: 'bezig' }).run()).toThrow(/UNIQUE/)
  })
})

describe('verwijderen', () => {
  const db = gebruikTijdelijkeDb()

  it('overschrijft verwijderde rijen in het bestand (secure_delete)', () => {
    const merk = 'VERWIJDERD-MERK-'.repeat(8)
    const u = maakGebruiker()
    getDb().insert(households).values({ userId: u.id, gegevensEnc: merk }).run()
    getSqlite().pragma('wal_checkpoint(TRUNCATE)')
    expect(readFileSync(db.pad).includes(merk)).toBe(true)
    getDb().delete(households).run()
    getSqlite().pragma('wal_checkpoint(TRUNCATE)')
    expect(readFileSync(db.pad).includes(merk)).toBe(false)
  })

  it('een gewone checkpoint laat verwijderde rijen in -wal staan; leegWal() haalt ze eruit', async () => {
    const merk = 'WAL-MERK-'.repeat(8)
    const u = maakGebruiker()
    getDb().insert(households).values({ userId: u.id, gegevensEnc: merk }).run()
    getDb().delete(households).run()
    getSqlite().pragma('wal_checkpoint(PASSIVE)')
    expect(readFileSync(`${db.pad}-wal`).includes(merk)).toBe(true)
    expect(await leegWal()).toBe(true)
    expect(statSync(`${db.pad}-wal`).size).toBe(0)
    expect(readFileSync(db.pad).includes(merk)).toBe(false)
  })

  it('leegWal() wacht niet op een ander proces dat leest, maar probeert het opnieuw tot het lukt', async () => {
    maakGebruiker()
    const ander = openSqlite(db.pad)
    try {
      ander.prepare('BEGIN').run()
      ander.prepare('SELECT count(*) AS n FROM users').get()
      const start = Date.now()
      expect(probeerLeegWal()).toBe(false)
      // busy_timeout is 5 seconden, maar de poging wacht niet en zet hem daarna terug.
      expect(Date.now() - start).toBeLessThan(1_000)
      expect(getSqlite().pragma('busy_timeout', { simple: true })).toBe(5000)
      expect(await leegWal({ pogingen: 3, pauzeMs: 5 })).toBe(false)
      setTimeout(() => ander.prepare('COMMIT').run(), 100)
      expect(await leegWal({ pogingen: 20, pauzeMs: 20 })).toBe(true)
      expect(statSync(`${db.pad}-wal`).size).toBe(0)
    } finally {
      ander.close()
    }
  })
})

describe('dbFoutSoort', () => {
  const db = gebruikTijdelijkeDb()

  const fout = (f: () => unknown): unknown => {
    try {
      f()
    } catch (e) {
      return e
    }
    throw new Error('geen fout')
  }

  it('herkent ontbrekend schema, uniek, constraint, bezet en niet bereikbaar, ook verpakt in cause', () => {
    maakGebruiker()
    expect(dbFoutSoort(fout(() => getSqlite().prepare('SELECT * FROM bestaat_niet').all()))).toBe('schema-ontbreekt')
    expect(dbFoutSoort(fout(() => getSqlite().prepare('SELECT bestaat_niet FROM users').all()))).toBe('schema-ontbreekt')
    const uniek = fout(() => maakGebruiker())
    expect(dbFoutSoort(uniek)).toBe('uniek')
    expect(dbFoutSoort(new Error('Failed query', { cause: uniek }))).toBe('uniek')
    expect(dbFoutSoort(fout(() => getSqlite().prepare(`INSERT INTO users (email, password_hash, totp_enabled) VALUES ('c@example.nl', 'x', 5)`).run()))).toBe('constraint')

    const ander = openSqlite(db.pad, { busyTimeoutMs: 0 })
    try {
      schrijf(() => {
        expect(dbFoutSoort(fout(() => ander.prepare('BEGIN IMMEDIATE').run()))).toBe('bezet')
      })
    } finally {
      ander.close()
    }

    expect(dbFoutSoort(Object.assign(new Error('geen toegang'), { code: 'EACCES' }))).toBe('niet-bereikbaar')
    const geenDb = join(db.map, 'geen.db')
    writeFileSync(geenDb, 'dit is geen sqlite-bestand, maar wel lang genoeg om als kop gelezen te worden '.repeat(2))
    expect(dbFoutSoort(fout(() => openSqlite(geenDb)))).toBe('niet-bereikbaar')
    expect(dbFoutSoort(new Error('iets anders'))).toBeNull()
    expect(dbFoutSoort(null)).toBeNull()
  })
})
