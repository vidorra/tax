/**
 * Het CLI scripts/backup.ts tegen een echte Postgres (IB_TEST_DATABASE_URL): maak naar een bestand, bekijk,
 * herstel in een leeg schema (met en zonder --overschrijf), ontsleutel en maak --mail. De uitvoer bevat
 * nooit een adres, sleutel of inhoud van rijen.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { zetResendFetch } from '@/lib/mail'

import { GEBRUIKER_MAIL, MB_TOKEN, metSchema, nepResend, ONTVANGER, tabelInhoud, TOTP_GEHEIM, vulDatabase, zetBackupEnv } from './hulp'

const { voerUit } = await import('@/scripts/backup')

describe('CLI zonder database', () => {
  it('toont het gebruik bij een onbekend commando of een ontbrekend argument', async () => {
    const regels: string[] = []
    expect(await voerUit([], (r) => regels.push(r))).toBe(2)
    expect(await voerUit(['iets'], (r) => regels.push(r))).toBe(2)
    expect(await voerUit(['bekijk'], (r) => regels.push(r))).toBe(2)
    expect(await voerUit(['maak', '--uit'], (r) => regels.push(r))).toBe(2)
    expect(regels.join('\n')).toContain('npm run backup -- herstel <bestand> [--overschrijf] [--schema-opnieuw]')
  })
})

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const SCHEMA = `ib_cli_${Date.now()}_${randomBytes(3).toString('hex')}`
const DOEL = `${SCHEMA}_doel`

describe.skipIf(!BASIS_URL)('CLI op een echte database', () => {
  let url = ''
  let doelUrl = ''
  let sleutel = ''
  let map = ''
  let beheer: Client
  let bron: Client
  const uitvoer: string[] = []

  async function cli(...argv: string[]): Promise<{ code: number; tekst: string }> {
    const regels: string[] = []
    const code = await voerUit(argv, (r) => regels.push(r))
    uitvoer.push(...regels)
    return { code, tekst: regels.join('\n') }
  }

  beforeAll(async () => {
    url = metSchema(BASIS_URL!, SCHEMA)
    doelUrl = metSchema(BASIS_URL!, DOEL)
    sleutel = randomBytes(32).toString('base64')
    map = mkdtempSync(join(tmpdir(), 'ib-backup-cli-'))
    beheer = new Client({ connectionString: BASIS_URL })
    await beheer.connect()
    await beheer.query(`CREATE SCHEMA ${SCHEMA}`)
    await beheer.query(`CREATE SCHEMA ${DOEL}`)
    zetBackupEnv(url, sleutel)
    delete (globalThis as Record<string, unknown>).__ibDb
    const { migreer } = await import('@/scripts/migrate')
    await migreer(url, undefined, () => undefined)
    bron = new Client({ connectionString: url })
    await bron.connect()
    await vulDatabase(bron)
  })
  beforeEach(() => zetBackupEnv(url, sleutel))
  afterEach(() => zetResendFetch(null))

  afterAll(async () => {
    delete (globalThis as Record<string, unknown>).__ibDb
    await bron?.end().catch(() => undefined)
    await beheer.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await beheer.query(`DROP SCHEMA IF EXISTS ${DOEL} CASCADE`)
    await beheer.end()
    rmSync(map, { recursive: true, force: true })
  })

  it('maak, bekijk, herstel en ontsleutel', async () => {
    const gemaakt = await cli('maak', '--uit', map)
    expect(gemaakt.code).toBe(0)
    expect(gemaakt.tekst).toMatch(/Back-up geschreven naar .*\.ibcbak \(.+\)\./)
    const [naam] = readdirSync(map)
    const pad = join(map, naam)
    expect(statSync(pad).mode & 0o777).toBe(0o600)
    expect(readFileSync(pad).includes(GEBRUIKER_MAIL)).toBe(false)

    const bekeken = await cli('bekijk', pad)
    expect(bekeken.code).toBe(0)
    expect(bekeken.tekst).toContain('Versie app:     abc1234')
    expect(bekeken.tekst).toMatch(/dossier_years\s+2\n/)
    expect(bekeken.tekst).toMatch(/totaal\s+7 rijen in 8 tabellen/)

    // Herstellen in een leeg schema geeft dezelfde rijen.
    process.env.DATABASE_URL = doelUrl
    const hersteld = await cli('herstel', pad)
    expect(hersteld.code).toBe(0)
    expect(hersteld.tekst).toContain('Teruggezet:')
    const doel = new Client({ connectionString: doelUrl })
    await doel.connect()
    try {
      expect(await tabelInhoud(doel, { zonderSessie: true })).toEqual(await tabelInhoud(bron, { zonderSessie: true }))
      // Alle sessies zijn ingetrokken: de generatie is willekeurig hoog, dus geen eerder uitgegeven token past nog.
      expect(hersteld.tekst).toContain('Alle bestaande sessies zijn ingetrokken.')
      const gen = await doel.query<{ g: number }>(`SELECT sessie_generatie AS g FROM users`)
      for (const { g } of gen.rows) expect(g).toBeGreaterThanOrEqual(1_000_000_000)
      const { rows } = await doel.query<{ naam: string }>(`SELECT naam FROM _migrations ORDER BY naam`)
      expect(rows.map((r) => r.naam)).toEqual(readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort())

      // Nog een keer zonder --overschrijf: geweigerd en niets gewijzigd. Met --overschrijf: weer gelijk.
      await doel.query(`UPDATE dossier_years SET status = 'ingediend'`)
      const geweigerd = await cli('herstel', pad)
      expect(geweigerd.code).toBe(1)
      expect(geweigerd.tekst).toContain('De doeldatabase is niet leeg')
      expect((await doel.query(`SELECT DISTINCT status FROM dossier_years`)).rows).toEqual([{ status: 'ingediend' }])
      expect((await cli('herstel', pad, '--overschrijf')).code).toBe(0)
      expect(await tabelInhoud(doel, { zonderSessie: true })).toEqual(await tabelInhoud(bron, { zonderSessie: true }))
    } finally {
      await doel.end()
    }

    // Ontsleutelen naar JSON, met waarschuwing; een bestaand doel wordt niet overschreven.
    const json = join(map, 'inhoud.json')
    const ontsleuteld = await cli('ontsleutel', pad, json)
    expect(ontsleuteld.code).toBe(0)
    expect(ontsleuteld.tekst).toContain('gevoelige gegevens')
    expect(statSync(json).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(json, 'utf8'))).toMatchObject({ formaat: 'ibcalculator-backup', versie: 1 })
    expect((await cli('ontsleutel', pad, json)).code).toBe(2)

    // Een andere DOSSIER_KEY: duidelijke melding.
    process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
    const ander = await cli('bekijk', pad)
    expect(ander.code).toBe(1)
    expect(ander.tekst).toContain('andere DOSSIER_KEY')
    expect((await cli('bekijk', join(map, 'bestaat-niet.ibcbak'))).code).toBe(2)
  })

  it('maak --mail mailt en legt een back-up op verzoek vast', async () => {
    const nep = nepResend()
    const r = await cli('maak', '--mail')
    expect(r.code).toBe(0)
    expect(r.tekst).toContain('Back-up gemaild naar b•••@example.nl')
    expect(nep.verzoeken).toHaveLength(1)
    const { rows } = await bron.query(`SELECT soort, status FROM backups ORDER BY id DESC LIMIT 1`)
    expect(rows[0]).toEqual({ soort: 'handmatig', status: 'verstuurd' })

    delete process.env.BACKUP_MAIL_TO
    const niet = await cli('maak', '--mail')
    expect(niet.code).toBe(1)
    expect(niet.tekst).toContain('ontbreekt: BACKUP_MAIL_TO')
  })

  it('de uitvoer bevat geen adres, sleutel, token of inhoud van rijen', () => {
    const alles = uitvoer.join('\n')
    expect(alles.length).toBeGreaterThan(0)
    for (const nooit of [ONTVANGER, GEBRUIKER_MAIL, sleutel, TOTP_GEHEIM, MB_TOKEN, 'ib@127.0.0.1']) expect(alles).not.toContain(nooit)
  })
})
