/**
 * De snapshot van het SQLite-bestand (snapshot.ts) op een echte, tijdelijke database: inhoud en metadata, een
 * zelfstandig en gecontroleerd bestand, geen administratie van back-ups, één consistent moment naast een andere
 * schrijver, opruimen van tijdelijke bestanden en het herkennen van een bezet doel bij de backup-API.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { getDb, getSqlite, openSqlite } from '@/lib/db'
import { backups, users } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'

import { kopieerDatabase, maakSnapshot, ruimVerlopenWerkmappenOp, SnapshotFout, WERKMAP_PREFIX, WERKMAP_VERLOPEN_MS } from '../snapshot'
import { GEBRUIKER_MAIL, tabelInhoud, TABELLEN, vulDatabase } from './hulp'

const testDb = gebruikTijdelijkeDb()

function zetSleutel(): void {
  process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
}

/** Opent de bytes van een snapshot als database (in het geheugen). */
function open(database: Buffer): Database.Database {
  return new Database(database)
}

describe('maakSnapshot', () => {
  it('kopieert alle tabellen met precies dezelfde rijen, zonder de administratie van back-ups', async () => {
    zetSleutel()
    vulDatabase()
    getDb().insert(backups).values([
      { soort: 'gepland', periode: '2026-08', status: 'verstuurd' },
      { soort: 'handmatig', status: 'mislukt', fout: 'x' },
    ]).run()

    const s = await maakSnapshot(getSqlite(), { gitSha: 'abc1234', nu: new Date('2027-02-01T03:00:00.000Z') })
    expect(s).toMatchObject({ formaat: 'ibcalculator-backup', versie: 2, gitSha: 'abc1234', gemaaktOp: '2027-02-01T03:00:00.000Z', migraties: ['0001_init.sql', '0002_accounts.sql'] })
    expect(s.rijen).toEqual({ users: 1, households: 1, dossier_years: 2, snapshots: 1, accountant_docs: 1, aangifte_staat: 0, herstelpunten: 0, koppelingen: 1, uitnodigingen: 0 })
    expect(Object.keys(s.rijen)).toEqual([...TABELLEN])

    const kopie = open(s.database)
    try {
      expect(tabelInhoud(kopie)).toEqual(tabelInhoud())
      expect(kopie.prepare('SELECT count(*) AS n FROM backups').get()).toEqual({ n: 0 })
      expect(kopie.prepare(`SELECT name FROM sqlite_sequence WHERE name = 'backups'`).all()).toEqual([])
      expect(kopie.prepare('SELECT naam FROM _migrations ORDER BY naam').all()).toEqual([{ naam: '0001_init.sql' }, { naam: '0002_accounts.sql' }])
      expect(kopie.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      kopie.close()
    }
    // De bron houdt zijn administratie.
    expect(getDb().select().from(backups).all()).toHaveLength(2)
    // Zonder gitSha en tijdstip: null en nu.
    const zonder = await maakSnapshot(getSqlite())
    expect(zonder.gitSha).toBeNull()
    expect(Math.abs(Date.parse(zonder.gemaaktOp) - Date.now())).toBeLessThan(5_000)
  })

  it('geeft een zelfstandig bestand: legacy-journal in de kop, geen -wal nodig, ook al staat de bron op WAL', async () => {
    zetSleutel()
    vulDatabase()
    expect(getSqlite().pragma('journal_mode', { simple: true })).toBe('wal')
    const s = await maakSnapshot(getSqlite())
    expect(s.database.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\u0000')
    // Bytes 18 en 19: 1 = rollback-journal, 2 = WAL.
    expect([s.database[18], s.database[19]]).toEqual([1, 1])
    const pad = join(testDb.map, 'los.db')
    writeFileSync(pad, s.database)
    const los = new Database(pad, { readonly: true })
    try {
      expect(los.pragma('journal_mode', { simple: true })).toBe('delete')
      expect((los.prepare('SELECT email FROM users').get() as { email: string }).email).toBe(GEBRUIKER_MAIL)
    } finally {
      los.close()
    }
  })

  it('autoincrement gaat mee: een verwijderd id komt na terugzetten niet terug', async () => {
    const een = getDb().insert(users).values({ email: 'een@example.nl', passwordHash: 'x' }).returning().get()
    const twee = getDb().insert(users).values({ email: 'twee@example.nl', passwordHash: 'x' }).returning().get()
    getSqlite().prepare('DELETE FROM users WHERE id = ?').run(twee.id)
    const kopie = open((await maakSnapshot(getSqlite())).database)
    try {
      const nieuw = kopie.prepare(`INSERT INTO users (email, password_hash) VALUES ('drie@example.nl', 'x') RETURNING id`).get() as { id: number }
      expect(nieuw.id).toBeGreaterThan(twee.id)
      expect(een.id).toBeLessThan(twee.id)
    } finally {
      kopie.close()
    }
  })

  it('ziet een open schrijftransactie van een andere verbinding niet, en wacht er ook niet op', async () => {
    vulDatabase()
    const ander = openSqlite(testDb.pad)
    try {
      ander.exec('BEGIN IMMEDIATE')
      ander.prepare(`INSERT INTO users (email, password_hash) VALUES ('tussendoor@example.nl', 'x')`).run()
      const tijdens = await maakSnapshot(getSqlite())
      expect(tijdens.rijen.users).toBe(1)
      expect(tijdens.database.includes('tussendoor@example.nl')).toBe(false)
      ander.exec('COMMIT')
      expect((await maakSnapshot(getSqlite())).rijen.users).toBe(2)
    } finally {
      if (ander.inTransaction) ander.exec('ROLLBACK')
      ander.close()
    }
  })

  it('verwijderde rijen staan niet meer in het bestand (VACUUM)', async () => {
    getDb().insert(users).values({ email: 'verwijderd-uniek@example.nl', passwordHash: 'x' }).run()
    getSqlite().exec(`DELETE FROM users`)
    // Zonder secure_delete zou de tekst in een vrije pagina kunnen blijven staan; de snapshot doet VACUUM.
    const s = await maakSnapshot(getSqlite())
    expect(s.database.includes('verwijderd-uniek@example.nl')).toBe(false)
  })

  it('ruimt de tijdelijke map op, ook bij een fout', async () => {
    await maakSnapshot(getSqlite())
    expect(readdirSync(testDb.map).filter((n) => n.startsWith(WERKMAP_PREFIX))).toEqual([])

    // Een database zonder migraties: SnapshotFout, en ook dan geen tijdelijke map.
    const leeg = join(testDb.map, 'leeg', 'ib.db')
    const db = openSqlite(leeg)
    try {
      await expect(maakSnapshot(db)).rejects.toThrow(SnapshotFout)
      await expect(maakSnapshot(db)).rejects.toThrow(/db:migrate/)
    } finally {
      db.close()
    }
    expect(readdirSync(join(testDb.map, 'leeg')).filter((n) => n.startsWith(WERKMAP_PREFIX))).toEqual([])
  })

  it('ruimt achtergebleven werkmappen van meer dan een uur op, en laat recente en andere mappen staan', () => {
    const oud = join(testDb.map, `${WERKMAP_PREFIX}snapshot-oud`)
    const recent = join(testDb.map, `${WERKMAP_PREFIX}herstel-recent`)
    const anders = join(testDb.map, 'backups-oud')
    for (const m of [oud, recent, anders]) mkdirSync(m)
    writeFileSync(join(oud, 'snapshot.db'), 'x')
    const lang = (Date.now() - WERKMAP_VERLOPEN_MS - 60_000) / 1000
    utimesSync(oud, lang, lang)
    utimesSync(anders, lang, lang)
    expect(ruimVerlopenWerkmappenOp(testDb.map)).toBe(1)
    expect(existsSync(oud)).toBe(false)
    expect(existsSync(recent)).toBe(true)
    expect(existsSync(anders)).toBe(true)
  })

  it('weigert een database die niet in orde is (verwijzing naar een rij die niet bestaat)', async () => {
    vulDatabase()
    getSqlite().pragma('foreign_keys = OFF')
    try {
      getSqlite().exec('DELETE FROM users')
    } finally {
      getSqlite().pragma('foreign_keys = ON')
    }
    const fout = await maakSnapshot(getSqlite()).catch((e: unknown) => e)
    expect(fout).toBeInstanceOf(SnapshotFout)
    expect((fout as Error).message).toMatch(/niet in orde: .*households/)
    expect((fout as Error).message).not.toContain(GEBRUIKER_MAIL)
  })
})

describe('kopieerDatabase', () => {
  it('herkent een bezet doel (backup() eindigt dan zonder fout en zonder kopie) en probeert opnieuw', async () => {
    vulDatabase()
    const doel = join(testDb.map, 'doel.db')
    const d = openSqlite(doel)
    d.exec(`CREATE TABLE t (x INTEGER) STRICT; INSERT INTO t VALUES (1)`)
    const blokkeer = openSqlite(doel)
    try {
      blokkeer.exec('BEGIN IMMEDIATE')
      blokkeer.exec('INSERT INTO t VALUES (2)')
      // Rechtstreeks met better-sqlite3: lijkt gelukt, maar er is niets gekopieerd.
      const ruw = await getSqlite().backup(doel)
      expect(ruw.totalPages).toBe(0)
      // kopieerDatabase wacht en geeft na de wachttijd een fout met SQLITE_BUSY; het doel is niet gewijzigd.
      await expect(kopieerDatabase(getSqlite(), doel, { wachtMs: 150 })).rejects.toMatchObject({ code: 'SQLITE_BUSY' })
      // Komt de lock vrij tijdens het wachten, dan lukt het alsnog.
      setTimeout(() => blokkeer.exec('COMMIT'), 100)
      await kopieerDatabase(getSqlite(), doel, { wachtMs: 5_000 })
      expect(d.prepare(`SELECT name FROM sqlite_master WHERE name = 't'`).get()).toBeUndefined()
      expect((d.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n).toBe(1)
      expect(d.pragma('journal_mode', { simple: true })).toBe('wal')
    } finally {
      if (blokkeer.inTransaction) blokkeer.exec('ROLLBACK')
      blokkeer.close()
      d.close()
    }
  })
})
