/**
 * Terugzetten van een back-up (herstel.ts) op echte, tijdelijke SQLite-bestanden: een nieuw of leeg doel, een gevuld
 * doel met en zonder overschrijven, terugzetten terwijl de app de database open heeft, wachten op een schrijver,
 * weigeren van een vreemde, kapotte of nieuwere database, latere migraties, een andere paginagrootte en het
 * intrekken van sessies.
 */
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { sessieNogGeldig } from '@/lib/auth/server'
import { getDb, getSqlite, openSqlite, type Sqlite } from '@/lib/db'
import { migreer, MIGRATIE_MAP } from '@/lib/db/migreer'
import { households, users } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'

import { HerstelFout, herstelBackup, openBackupDatabase, trekSessiesIn } from '../herstel'
import { maakSnapshot, WERKMAP_PREFIX } from '../snapshot'
import type { BackupInhoud } from '../types'
import { GEBRUIKER_MAIL, tabelInhoud, vulDatabase } from './hulp'

const testDb = gebruikTijdelijkeDb()
const stil = () => undefined

beforeEach(() => {
  process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
})

/** Een back-up van de testdatabase met het standaardhuishouden. */
async function backupMetGegevens(): Promise<BackupInhoud> {
  vulDatabase()
  return maakSnapshot(getSqlite(), { gitSha: 'abc1234' })
}

function metDb<T>(pad: string, fn: (db: Sqlite) => T): T {
  const db = new Database(pad, { fileMustExist: true })
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

function werkmappen(map: string): string[] {
  return readdirSync(map).filter((n) => n.startsWith(WERKMAP_PREFIX))
}

async function fout(p: Promise<unknown>): Promise<Error> {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  )
  if (!(e instanceof Error)) throw new Error('verwachtte een fout')
  return e
}

describe('herstelBackup', () => {
  it('zet een back-up terug in een nieuw bestand: dezelfde rijen, gemigreerd, op WAL en met ingetrokken sessies', async () => {
    const inhoud = await backupMetGegevens()
    const doel = join(testDb.map, 'nieuw', 'ibcalculator.db')
    const regels: string[] = []
    const r = await herstelBackup(inhoud, { doel, log: (l) => regels.push(l) })

    expect(r).toEqual({ rijen: inhoud.rijen, migratiesBackup: ['0001_init.sql', '0002_accounts.sql'], latereMigraties: 0, vervangen: false, verdwenenAccounts: 0 })
    expect(regels[0]).toBe('Teruggezet:')
    expect(regels.join('\n')).toMatch(/dossier_years\s+2\n/)
    metDb(doel, (db) => {
      expect(tabelInhoud(db, { zonderSessie: true })).toEqual(tabelInhoud(getSqlite(), { zonderSessie: true }))
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(db.prepare('SELECT naam FROM _migrations ORDER BY naam').all()).toEqual([{ naam: '0001_init.sql' }, { naam: '0002_accounts.sql' }])
      const { g } = db.prepare('SELECT sessie_generatie AS g FROM users').get() as { g: number }
      expect(g).toBeGreaterThanOrEqual(1_000_000_002)
      expect(Number.isSafeInteger(g)).toBe(true)
      // Een token van vóór de back-up (generatie 2) past niet meer.
      expect(sessieNogGeldig({ generatie: 2 }, { sessieGeneratie: g })).toBe(false)
    })
    expect(werkmappen(join(testDb.map, 'nieuw'))).toEqual([])
  })

  it('een leeg, gemigreerd bestand (zoals na de eerste deploy) telt als leeg', async () => {
    const inhoud = await backupMetGegevens()
    const doel = join(testDb.map, 'deploy', 'ibcalculator.db')
    migreer(doel, { log: stil })
    const r = await herstelBackup(inhoud, { doel })
    expect(r.vervangen).toBe(false)
    metDb(doel, (db) => expect((db.prepare('SELECT email FROM users').get() as { email: string }).email).toBe(GEBRUIKER_MAIL))
  })

  it('een gevulde database: zonder overschrijven geweigerd en ongewijzigd, met overschrijven vervangen', async () => {
    const inhoud = await backupMetGegevens()
    const doel = join(testDb.map, 'vol', 'ibcalculator.db')
    migreer(doel, { log: stil })
    const d = openSqlite(doel)
    d.prepare(`INSERT INTO users (email, password_hash, sessie_generatie) VALUES ('indringer@example.nl', 'x', 3)`).run()
    d.prepare(`INSERT INTO households (user_id, gegevens_enc) VALUES (1, 'v2.x')`).run()
    const voor = tabelInhoud(d)
    d.close()

    const geweigerd = await fout(herstelBackup(inhoud, { doel }))
    expect(geweigerd).toBeInstanceOf(HerstelFout)
    expect(geweigerd.message).toContain('De database bevat al gegevens (rijen in users, households)')
    expect(geweigerd.message).toContain('--overschrijf')
    metDb(doel, (db) => expect(tabelInhoud(db)).toEqual(voor))

    const regels: string[] = []
    const r = await herstelBackup(inhoud, { doel, overschrijf: true, log: (l) => regels.push(l) })
    expect(r).toMatchObject({ vervangen: true, verdwenenAccounts: 1 })
    expect(regels).toContain('Let op: in de database staan 1 account(s) die niet in de back-up zitten. Die verdwijnen.')
    expect(regels.join('\n')).not.toContain('indringer@example.nl')
    metDb(doel, (db) => expect(tabelInhoud(db, { zonderSessie: true })).toEqual(tabelInhoud(getSqlite(), { zonderSessie: true })))
  })

  it('terwijl de app de database open heeft: zelfde bestand, de app ziet meteen de teruggezette gegevens', async () => {
    const inhoud = await backupMetGegevens()
    // De "app" (getDb van dit proces) gaat verder: account weg, ander account erbij, en houdt de verbinding open.
    getSqlite().exec('DELETE FROM users')
    const nu = getDb().insert(users).values({ email: 'na-de-backup@example.nl', passwordHash: 'x', sessieGeneratie: 7 }).returning().get()
    const appVerbinding = getSqlite()
    const voorbereid = appVerbinding.prepare('SELECT email, sessie_generatie AS g FROM users ORDER BY id')
    const inode = statSync(testDb.pad).ino

    await herstelBackup(inhoud, { doel: testDb.pad, overschrijf: true })

    expect(getSqlite()).toBe(appVerbinding)
    expect(statSync(testDb.pad).ino).toBe(inode)
    const rijen = voorbereid.all() as Array<{ email: string; g: number }>
    expect(rijen.map((r) => r.email)).toEqual([GEBRUIKER_MAIL])
    expect(getDb().select().from(users).where(eq(users.email, 'na-de-backup@example.nl')).all()).toEqual([])
    expect(getSqlite().pragma('journal_mode', { simple: true })).toBe('wal')
    // Ook een token met hetzelfde account-id en de generatie van vóór het herstel past niet.
    expect(sessieNogGeldig({ generatie: nu.sessieGeneratie }, { sessieGeneratie: rijen[0].g })).toBe(false)
    // De app kan gewoon verder schrijven, met id's na die uit de back-up.
    const nieuw = getDb().insert(users).values({ email: 'daarna@example.nl', passwordHash: 'x' }).returning().get()
    expect(nieuw.id).toBeGreaterThan(nu.id)
    expect(getSqlite().pragma('integrity_check', { simple: true })).toBe('ok')
  })

  it('wacht als de app net schrijft, en geeft na de wachttijd op zonder iets te wijzigen', async () => {
    const inhoud = await backupMetGegevens()
    const doel = join(testDb.map, 'bezet', 'ibcalculator.db')
    migreer(doel, { log: stil })
    const schrijver = openSqlite(doel)
    try {
      schrijver.exec('BEGIN IMMEDIATE')
      schrijver.prepare(`INSERT INTO users (email, password_hash) VALUES ('bezig@example.nl', 'x')`).run()
      const e = await fout(herstelBackup(inhoud, { doel, wachtMs: 200 }))
      expect(e).toBeInstanceOf(HerstelFout)
      expect(e.message).toContain('bleef bezet')
      schrijver.exec('ROLLBACK')
      metDb(doel, (db) => expect(db.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 }))

      // Komt de schrijver tijdens het wachten klaar (en laat hij de database leeg), dan gaat het herstel door.
      schrijver.exec('BEGIN IMMEDIATE')
      setTimeout(() => schrijver.exec('ROLLBACK'), 150)
      await herstelBackup(inhoud, { doel, wachtMs: 5_000 })
      metDb(doel, (db) => expect(db.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 1 }))
    } finally {
      if (schrijver.inTransaction) schrijver.exec('ROLLBACK')
      schrijver.close()
    }
    expect(werkmappen(join(testDb.map, 'bezet'))).toEqual([])
  })

  it('weigert een database van een andere app, ook met overschrijven, zonder iets te wijzigen', async () => {
    const inhoud = await backupMetGegevens()
    const doel = join(testDb.map, 'vreemd.db')
    const v = new Database(doel)
    v.exec(`CREATE TABLE klanten (id INTEGER PRIMARY KEY, naam TEXT); INSERT INTO klanten VALUES (1, 'x')`)
    v.close()
    const voor = readFileSync(doel)
    for (const overschrijf of [false, true]) {
      const e = await fout(herstelBackup(inhoud, { doel, overschrijf }))
      expect(e).toBeInstanceOf(HerstelFout)
      expect(e.message).toContain('geen database van ibcalculator')
    }
    expect(readFileSync(doel).equals(voor)).toBe(true)
    expect(existsSync(`${doel}-wal`)).toBe(false)
  })

  it('weigert een bestand dat geen database is', async () => {
    const inhoud = await backupMetGegevens()
    const doel = join(testDb.map, 'tekst.db')
    writeFileSync(doel, 'dit is geen database '.repeat(400))
    const voor = readFileSync(doel)
    const e = await fout(herstelBackup(inhoud, { doel, overschrijf: true }))
    expect(e).toBeInstanceOf(HerstelFout)
    expect(e.message).toContain('niet als database kan openen')
    expect(readFileSync(doel).equals(voor)).toBe(true)
  })

  it('weigert een database met migraties die deze app niet kent', async () => {
    const inhoud = await backupMetGegevens()
    const doel = join(testDb.map, 'toekomst-doel.db')
    migreer(doel, { log: stil })
    metDb(doel, (db) => db.prepare(`INSERT INTO _migrations (naam) VALUES ('0099_toekomst.sql')`).run())
    const e = await fout(herstelBackup(inhoud, { doel, overschrijf: true }))
    expect(e).toBeInstanceOf(HerstelFout)
    expect(e.message).toContain('0099_toekomst.sql')
    expect(e.message).toContain('Werk de app bij')
  })

  it('weigert een back-up van een nieuwere app met een nette melding, en maakt dan geen databasebestand', async () => {
    vulDatabase()
    getSqlite().prepare(`INSERT INTO _migrations (naam) VALUES ('0099_toekomst.sql')`).run()
    const inhoud = await maakSnapshot(getSqlite())
    expect(inhoud.migraties).toEqual(['0001_init.sql', '0002_accounts.sql', '0099_toekomst.sql'])
    const doel = join(testDb.map, 'leeg', 'ibcalculator.db')
    const e = await fout(herstelBackup(inhoud, { doel }))
    expect(e).toBeInstanceOf(HerstelFout)
    expect(e.message).toContain('nieuwere versie van de app: migratie 0099_toekomst.sql')
    expect(e.message).not.toMatch(/Error:/)
    expect(existsSync(doel)).toBe(false)
    expect(werkmappen(join(testDb.map, 'leeg'))).toEqual([])
  })

  it('een oudere back-up krijgt na het terugzetten de latere migraties van deze app', async () => {
    const inhoud = await backupMetGegevens()
    const map = mkdtempSync(join(testDb.map, 'migraties-'))
    for (const m of ['0001_init.sql', '0002_accounts.sql']) copyFileSync(join(MIGRATIE_MAP, m), join(map, m))
    writeFileSync(join(map, '0098_later.sql'), `CREATE TABLE later_toegevoegd (id INTEGER PRIMARY KEY) STRICT;\nALTER TABLE users ADD COLUMN later TEXT NOT NULL DEFAULT 'ja';\n`)
    const doel = join(testDb.map, 'later', 'ibcalculator.db')
    migreer(doel, { map, log: stil })

    const regels: string[] = []
    const r = await herstelBackup(inhoud, { doel, migratieMap: map, log: (l) => regels.push(l) })
    expect(r.latereMigraties).toBe(1)
    expect(regels).toContain('  Migratie uitgevoerd: 0098_later.sql')
    metDb(doel, (db) => {
      expect((db.prepare('SELECT naam FROM _migrations ORDER BY naam').all() as Array<{ naam: string }>).map((x) => x.naam)).toEqual(['0001_init.sql', '0002_accounts.sql', '0098_later.sql'])
      expect(db.prepare('SELECT email, later FROM users').get()).toEqual({ email: GEBRUIKER_MAIL, later: 'ja' })
    })
  })

  it('past de kopie aan een doel met een andere paginagrootte aan (anders weigert SQLite bij WAL)', async () => {
    const inhoud = await backupMetGegevens()
    const doel = join(testDb.map, 'pagina', 'ibcalculator.db')
    mkdirSync(join(testDb.map, 'pagina'))
    const d = new Database(doel)
    d.pragma('page_size = 8192')
    d.pragma('journal_mode = WAL')
    d.close()
    migreer(doel, { log: stil })
    metDb(doel, (db) => expect(db.pragma('page_size', { simple: true })).toBe(8192))
    await herstelBackup(inhoud, { doel })
    metDb(doel, (db) => {
      expect(db.pragma('page_size', { simple: true })).toBe(8192)
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect((db.prepare('SELECT email FROM users').get() as { email: string }).email).toBe(GEBRUIKER_MAIL)
    })
  })

  it('weigert een beschadigd databasebestand in de back-up', async () => {
    const inhoud = await backupMetGegevens()
    const pagina = inhoud.database.readUInt16BE(16)
    const kapot = Buffer.from(inhoud.database)
    // De kop van een b-tree-pagina: een ongeldig paginatype.
    kapot[pagina * 2] = 0xff
    const doel = join(testDb.map, 'kapot', 'ibcalculator.db')
    const e = await fout(herstelBackup({ ...inhoud, database: kapot }, { doel }))
    expect(e).toBeInstanceOf(HerstelFout)
    expect(e.message).toMatch(/beschadigd|niet in orde/)
    expect(existsSync(doel)).toBe(false)
  })
})

describe('openBackupDatabase en trekSessiesIn', () => {
  it('in het geheugen (om te bekijken) schrijft niets naar schijf', async () => {
    const inhoud = await backupMetGegevens()
    const voor = readdirSync(testDb.map).sort()
    const b = openBackupDatabase(inhoud, null)
    try {
      expect(b.rijen).toEqual(inhoud.rijen)
      expect(b.migraties).toEqual(['0001_init.sql', '0002_accounts.sql'])
    } finally {
      b.opruimen()
    }
    expect(readdirSync(testDb.map).sort()).toEqual(voor)
  })

  it('geeft elk account een eigen, veel hogere sessiegeneratie', () => {
    for (const email of ['a@example.nl', 'b@example.nl', 'c@example.nl']) getDb().insert(users).values({ email, passwordHash: 'x', sessieGeneratie: 5 }).run()
    expect(trekSessiesIn(getSqlite())).toBe(3)
    const g = getDb().select({ g: users.sessieGeneratie }).from(users).all().map((r) => r.g)
    for (const x of g) expect(x).toBeGreaterThanOrEqual(1_000_000_005)
    expect(new Set(g).size).toBe(3)
    // Nog een keer: weer hoger.
    trekSessiesIn(getSqlite())
    const daarna = getDb().select({ g: users.sessieGeneratie }).from(users).all().map((r) => r.g)
    daarna.forEach((x, i) => expect(x).toBeGreaterThan(g[i]))
    expect(getDb().select().from(households).all()).toEqual([])
  })
})
