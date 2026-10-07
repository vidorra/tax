/**
 * Het CLI scripts/backup.ts op tijdelijke SQLite-bestanden: maak naar een bestand, bekijk, herstel in een nieuw en in
 * een gevuld bestand (met en zonder --overschrijf), ontsleutel naar een .db-bestand en maak --mail. Eén keer als
 * los proces (tsx) dat terugzet in de database die deze test, net als de draaiende app, open heeft. De uitvoer
 * bevat nooit een adres, sleutel of inhoud van rijen.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, getSqlite } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
import { zetResendFetch } from '@/lib/mail'

import { GEBRUIKER_MAIL, MB_TOKEN, nepResend, ONTVANGER, tabelInhoud, TOTP_GEHEIM, vulDatabase, zetBackupEnv } from './hulp'

const { voerUit } = await import('@/scripts/backup')

const uitvoer: string[] = []

async function cli(...argv: string[]): Promise<{ code: number; tekst: string }> {
  const regels: string[] = []
  const code = await voerUit(argv, (r) => regels.push(r))
  uitvoer.push(...regels)
  return { code, tekst: regels.join('\n') }
}

/** Voert `fn` uit met DATABASE_PATH op `pad`, en zet hem daarna terug. */
async function metDatabase<T>(pad: string, fn: () => Promise<T>): Promise<T> {
  const vorige = process.env.DATABASE_PATH
  process.env.DATABASE_PATH = pad
  try {
    return await fn()
  } finally {
    process.env.DATABASE_PATH = vorige
  }
}

function inhoudVan(pad: string): Record<string, unknown[]> {
  const db = new Database(pad, { readonly: true })
  try {
    return tabelInhoud(db, { zonderSessie: true })
  } finally {
    db.close()
  }
}

describe('CLI zonder database', () => {
  it('toont het gebruik bij een onbekend commando, een onbekende optie of een ontbrekend argument', async () => {
    const regels: string[] = []
    expect(await voerUit([], (r) => regels.push(r))).toBe(2)
    expect(await voerUit(['iets'], (r) => regels.push(r))).toBe(2)
    expect(await voerUit(['bekijk'], (r) => regels.push(r))).toBe(2)
    expect(await voerUit(['maak', '--uit'], (r) => regels.push(r))).toBe(2)
    expect(await voerUit(['herstel', 'x.ibcbak', '--schema-opnieuw'], (r) => regels.push(r))).toBe(2)
    const tekst = regels.join('\n')
    expect(tekst).toContain('npm run backup -- herstel <bestand> [--overschrijf]')
    expect(tekst).toContain('npm run backup -- ontsleutel <bestand> <uit.db>')
    expect(tekst).toContain('Onbekende optie: --schema-opnieuw')
  })
})

describe('CLI op een echte database', () => {
  const testDb = gebruikTijdelijkeDb()
  const sleutels: string[] = []

  beforeEach(() => {
    const sleutel = randomBytes(32).toString('base64')
    sleutels.push(sleutel)
    zetBackupEnv(sleutel)
    vulDatabase()
  })
  afterEach(() => {
    zetResendFetch(null)
    vi.restoreAllMocks()
  })

  async function maakBestand(): Promise<string> {
    const r = await cli('maak', '--uit', join(testDb.map, 'uit'))
    expect(r.code, r.tekst).toBe(0)
    return /naar (.*\.ibcbak)/.exec(r.tekst)![1]
  }

  it('maak, bekijk, herstel en ontsleutel', async () => {
    const gemaakt = await cli('maak', '--uit', join(testDb.map, 'uit'))
    expect(gemaakt.code).toBe(0)
    expect(gemaakt.tekst).toMatch(/Back-up geschreven naar .*\.ibcbak \(.+\)\./)
    const [naam] = readdirSync(join(testDb.map, 'uit'))
    const pad = join(testDb.map, 'uit', naam)
    expect(statSync(pad).mode & 0o777).toBe(0o600)
    expect(readFileSync(pad).includes(GEBRUIKER_MAIL)).toBe(false)

    const bekeken = await cli('bekijk', pad)
    expect(bekeken.code, bekeken.tekst).toBe(0)
    expect(bekeken.tekst).toContain('Formaatversie:  2')
    expect(bekeken.tekst).toContain('Versie app:     abc1234')
    expect(bekeken.tekst).toContain('Migraties:      0001_init.sql')
    expect(bekeken.tekst).toMatch(/Database: {7}[\d,.]+ kB \(SQLite\)/)
    expect(bekeken.tekst).toMatch(/dossier_years\s+2\n/)
    expect(bekeken.tekst).toMatch(/totaal\s+7 rijen in 8 tabellen/)
    expect(bekeken.tekst).toContain('Controle:       in orde')

    // Terugzetten in een nieuw bestand geeft dezelfde rijen en trekt alle sessies in.
    const doel = join(testDb.map, 'doel', 'ibcalculator.db')
    const hersteld = await metDatabase(doel, () => cli('herstel', pad))
    expect(hersteld.code, hersteld.tekst).toBe(0)
    expect(hersteld.tekst).toContain(`terugzetten in ${doel}`)
    expect(hersteld.tekst).toMatch(/Teruggezet:\n(.*\n)*\s+users\s+1\n/)
    expect(hersteld.tekst).toContain('Alle bestaande sessies zijn ingetrokken.')
    expect(inhoudVan(doel)).toEqual(tabelInhoud(getSqlite(), { zonderSessie: true }))
    const gen = new Database(doel, { readonly: true })
    try {
      for (const { g } of gen.prepare('SELECT sessie_generatie AS g FROM users').all() as Array<{ g: number }>) expect(g).toBeGreaterThanOrEqual(1_000_000_000)
    } finally {
      gen.close()
    }

    // Nog een keer zonder --overschrijf: geweigerd en niets gewijzigd. Met --overschrijf: weer gelijk.
    const wijzig = new Database(doel)
    wijzig.exec(`UPDATE dossier_years SET status = 'ingediend'`)
    wijzig.close()
    const geweigerd = await metDatabase(doel, () => cli('herstel', pad))
    expect(geweigerd.code).toBe(1)
    expect(geweigerd.tekst).toContain('De database bevat al gegevens')
    expect(geweigerd.tekst).toContain('--overschrijf')
    expect(inhoudVan(doel).dossier_years.map((r) => (r as { status: string }).status)).toEqual(['ingediend', 'ingediend'])
    expect((await metDatabase(doel, () => cli('herstel', pad, '--overschrijf'))).code).toBe(0)
    expect(inhoudVan(doel)).toEqual(tabelInhoud(getSqlite(), { zonderSessie: true }))

    // Ontsleutelen naar een .db-bestand, met waarschuwing; een bestaand doel wordt niet overschreven.
    const db = join(testDb.map, 'ontsleuteld.db')
    const ontsleuteld = await cli('ontsleutel', pad, db)
    expect(ontsleuteld.code).toBe(0)
    expect(ontsleuteld.tekst).toContain('gevoelige gegevens')
    expect(statSync(db).mode & 0o777).toBe(0o600)
    expect(readFileSync(db).subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
    expect(inhoudVan(db)).toEqual(tabelInhoud(getSqlite(), { zonderSessie: true }))
    expect((await cli('ontsleutel', pad, db)).code).toBe(2)

    // Een andere DOSSIER_KEY: duidelijke melding. Een bestand dat er niet is: gebruik.
    process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
    const ander = await cli('bekijk', pad)
    expect(ander.code).toBe(1)
    expect(ander.tekst).toContain('andere DOSSIER_KEY')
    expect((await cli('bekijk', join(testDb.map, 'bestaat-niet.ibcbak'))).code).toBe(2)
  })

  it('maak zonder databasebestand maakt er ook geen aan', async () => {
    const leeg = join(testDb.map, 'nergens', 'ibcalculator.db')
    const r = await metDatabase(leeg, () => cli('maak', '--uit', join(testDb.map, 'uit')))
    expect(r.code).toBe(2)
    expect(r.tekst).toContain(`Er is geen database op ${leeg}`)
    expect(existsSync(leeg)).toBe(false)
  })

  it('weigert als root een database van een andere gebruiker aan te raken', async () => {
    const pad = await maakBestand()
    vi.spyOn(process as unknown as { getuid: () => number }, 'getuid').mockReturnValue(0)
    for (const argv of [['herstel', pad, '--overschrijf'], ['maak']]) {
      const r = await cli(...argv)
      expect(r.code).toBe(2)
      expect(r.tekst).toContain('docker exec -u node')
    }
  })

  it('maak --mail mailt en legt een back-up op verzoek vast', async () => {
    const nep = nepResend()
    const r = await cli('maak', '--mail')
    expect(r.code, r.tekst).toBe(0)
    expect(r.tekst).toContain('Back-up gemaild naar b•••@example.nl')
    expect(nep.verzoeken).toHaveLength(1)
    expect(getSqlite().prepare(`SELECT soort, status FROM backups ORDER BY id DESC LIMIT 1`).get()).toEqual({ soort: 'handmatig', status: 'verstuurd' })

    delete process.env.BACKUP_MAIL_TO
    const niet = await cli('maak', '--mail')
    expect(niet.code).toBe(1)
    expect(niet.tekst).toContain('ontbreekt: BACKUP_MAIL_TO')
  })

  it('als los proces: terugzetten in de database die de app open heeft', async () => {
    const pad = await maakBestand()
    // De "app" gaat na de back-up verder en houdt de verbinding open.
    getSqlite().exec('DELETE FROM users')
    getDb().insert(users).values({ email: 'na-de-backup@example.nl', passwordHash: 'x' }).run()
    const app = getSqlite()

    const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx')
    const { code, tekst } = await new Promise<{ code: number | null; tekst: string }>((resolve) => {
      const p = spawn(tsx, ['scripts/backup.ts', 'herstel', pad, '--overschrijf'], { cwd: process.cwd(), env: { ...process.env, DATABASE_PATH: testDb.pad }, stdio: ['ignore', 'pipe', 'pipe'] })
      let uit = ''
      p.stdout.on('data', (d: Buffer) => (uit += d.toString()))
      p.stderr.on('data', (d: Buffer) => (uit += d.toString()))
      p.on('exit', (c) => resolve({ code: c, tekst: uit }))
    })
    uitvoer.push(tekst)
    expect(code, tekst).toBe(0)
    expect(tekst).toContain('Let op: in de database staan 1 account(s) die niet in de back-up zitten.')
    expect(tekst).toContain('Klaar.')
    expect(getSqlite()).toBe(app)
    expect((app.prepare('SELECT email FROM users').all() as Array<{ email: string }>).map((r) => r.email)).toEqual([GEBRUIKER_MAIL])
  }, 30_000)

  it('de uitvoer bevat geen adres, sleutel, token of inhoud van rijen', () => {
    const alles = uitvoer.join('\n')
    expect(alles.length).toBeGreaterThan(0)
    for (const nooit of [ONTVANGER, GEBRUIKER_MAIL, ...sleutels, TOTP_GEHEIM, MB_TOKEN, 'NL00TEST0123456789']) expect(alles).not.toContain(nooit)
  })
})
