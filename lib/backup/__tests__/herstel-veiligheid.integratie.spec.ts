/**
 * Veiligheid en trouw van dump en herstel, uit de review van de back-up (echte Postgres, IB_TEST_DATABASE_URL):
 * jsonb en decimalen exact, zelfverwijzing over portiegrenzen, geen stille CASCADE, dump wacht op een migratie,
 * het herstelscript weigert een vreemde of nieuwere database en trekt sessies in, afgebroken runs.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client, type ClientBase } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LOCK } from '@/lib/db/locks'

import { herstelDump, HerstelFout, maakDump } from '../dump'
import type { BackupInhoud } from '../types'
import { metSchema, vulDatabase, zetBackupEnv } from './hulp'

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const PREFIX = `ib_veilig_${Date.now()}_${randomBytes(3).toString('hex')}`
const stil = () => undefined

/** Zoals de back-up echt reist: door JSON heen. */
const viaJson = (i: BackupInhoud): BackupInhoud => JSON.parse(JSON.stringify(i)) as BackupInhoud

describe.skipIf(!BASIS_URL)('dump en herstel: veiligheid en trouw', () => {
  let beheer: Client
  const schemas: string[] = []
  const clients: Client[] = []

  async function nieuw(naam: string, migreren = false): Promise<{ url: string; client: Client; schema: string }> {
    const schema = `${PREFIX}_${naam}`
    await beheer.query(`CREATE SCHEMA ${schema}`)
    schemas.push(schema)
    const url = metSchema(BASIS_URL!, schema)
    if (migreren) {
      const { migreer } = await import('@/scripts/migrate')
      await migreer(url, undefined, stil)
    }
    const client = new Client({ connectionString: url })
    await client.connect()
    clients.push(client)
    return { url, client, schema }
  }

  async function alsTekst(c: ClientBase, tabel: string): Promise<string[]> {
    const { rows } = await c.query<{ r: string }>(`SELECT _r::text AS r FROM "${tabel}" _r ORDER BY 1`)
    return rows.map((r) => r.r)
  }

  beforeAll(async () => {
    beheer = new Client({ connectionString: BASIS_URL })
    await beheer.connect()
  })

  afterAll(async () => {
    for (const c of clients) await c.end().catch(() => undefined)
    for (const s of schemas) await beheer.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`)
    await beheer.end()
  })

  it('jsonb (ook JSON-null in een NOT NULL-kolom), grote getallen in jsonb en de schaal van numeric komen exact terug', async () => {
    const a = await nieuw('json_a')
    const b = await nieuw('json_b')
    const ddl = `CREATE TABLE doc (
      id serial PRIMARY KEY,
      data jsonb NOT NULL DEFAULT '{}',
      ruw json,
      bedrag numeric(12,2) NOT NULL,
      tijd timestamptz NOT NULL
    )`
    await a.client.query(ddl)
    await b.client.query(ddl)
    await a.client.query(
      `INSERT INTO doc (data, ruw, bedrag, tijd) VALUES
        ('null', '{"b": 1, "a": 2, "b": 3}', 1.50, '2027-02-01 00:30:00.123456+01'),
        ('{"groot": 123456789012345678901234567890, "fractie": 0.1000000000000000055511151231257827}', NULL, -0.00, '1999-12-31 23:59:59+00'),
        ('[1, "twee", null, {"x": "é"}]', '[]', 9999999999.99, 'infinity')`,
    )
    const d = viaJson(await maakDump(a.client))
    expect(await herstelDump(b.client, d)).toEqual({ doc: 3 })
    expect(await alsTekst(b.client, 'doc')).toEqual(await alsTekst(a.client, 'doc'))
    const { rows } = await b.client.query<{ soort: string; bedrag: string }>(`SELECT jsonb_typeof(data) AS soort, bedrag::text FROM doc ORDER BY id`)
    expect(rows).toEqual([
      { soort: 'null', bedrag: '1.50' },
      { soort: 'object', bedrag: '0.00' },
      { soort: 'array', bedrag: '9999999999.99' },
    ])
  })

  it('een zelfverwijzing die vooruit wijst over de portiegrens van 500 rijen', async () => {
    const a = await nieuw('zelf_a')
    const b = await nieuw('zelf_b')
    const ddl = `CREATE TABLE knoop (id integer PRIMARY KEY, volgende integer REFERENCES knoop(id))`
    await a.client.query(ddl)
    await b.client.query(ddl)
    // Rij 1 verwijst naar rij 1200: die staat in een latere portie.
    await a.client.query(`INSERT INTO knoop SELECT g, NULL FROM generate_series(1, 1200) g`)
    await a.client.query(`UPDATE knoop SET volgende = 1201 - id`)
    const d = viaJson(await maakDump(a.client))
    expect(await herstelDump(b.client, d)).toEqual({ knoop: 1200 })
    expect(await alsTekst(b.client, 'knoop')).toEqual(await alsTekst(a.client, 'knoop'))
  })

  it('overschrijven weigert als CASCADE ook een tabel buiten de back-up zou legen, en wijzigt dan niets', async () => {
    const a = await nieuw('cascade_a')
    const b = await nieuw('cascade_b')
    await a.client.query(`CREATE TABLE ouder (id integer PRIMARY KEY)`)
    await a.client.query(`INSERT INTO ouder VALUES (1), (2)`)
    const d = viaJson(await maakDump(a.client))
    await b.client.query(`CREATE TABLE ouder (id integer PRIMARY KEY)`)
    await b.client.query(`CREATE TABLE later (id integer PRIMARY KEY, ouder_id integer REFERENCES ouder(id))`)
    await b.client.query(`INSERT INTO ouder VALUES (1)`)
    await b.client.query(`INSERT INTO later VALUES (10, 1)`)
    await expect(herstelDump(b.client, d, { overschrijf: true })).rejects.toThrow(HerstelFout)
    await expect(herstelDump(b.client, d, { overschrijf: true })).rejects.toThrow(/later/)
    expect(await alsTekst(b.client, 'later')).toEqual(['(10,1)'])
    expect(await alsTekst(b.client, 'ouder')).toEqual(['(1)'])
  })

  it('de haak naHerstel draait in dezelfde transactie; een fout erin draait alles terug', async () => {
    const a = await nieuw('haak_a')
    const b = await nieuw('haak_b')
    await a.client.query(`CREATE TABLE t (id integer PRIMARY KEY)`)
    await b.client.query(`CREATE TABLE t (id integer PRIMARY KEY)`)
    await a.client.query(`INSERT INTO t VALUES (1)`)
    const d = viaJson(await maakDump(a.client))
    await expect(
      herstelDump(b.client, d, {
        naHerstel: async () => {
          throw new Error('stop')
        },
      }),
    ).rejects.toThrow('stop')
    expect(await alsTekst(b.client, 't')).toEqual([])
  })

  it('een dump wacht op een lopende migratie (gedeelde lock tegenover exclusieve)', async () => {
    const a = await nieuw('lock_a')
    await a.client.query(`CREATE TABLE t (id integer PRIMARY KEY)`)
    const migratie = new Client({ connectionString: a.url })
    await migratie.connect()
    clients.push(migratie)
    await migratie.query('SELECT pg_advisory_lock($1)', [LOCK.migraties])
    let klaar = false
    const dump = maakDump(a.client).then((d) => {
      klaar = true
      return d
    })
    await new Promise((r) => setTimeout(r, 300))
    expect(klaar).toBe(false)
    await migratie.query(`ALTER TABLE t ADD COLUMN extra text`)
    await migratie.query('SELECT pg_advisory_unlock($1)', [LOCK.migraties])
    const d = await dump
    expect(d.tabellen[0].kolommen).toEqual(['id', 'extra'])
  })

  describe('herstelscript', () => {
    let map = ''
    let sleutel = ''
    const uitvoer = async (...argv: string[]) => {
      const { voerUit } = await import('@/scripts/backup')
      const regels: string[] = []
      const code = await voerUit(argv, (r) => regels.push(r))
      return { code, tekst: regels.join('\n') }
    }

    beforeAll(() => {
      map = mkdtempSync(join(tmpdir(), 'ib-veilig-'))
      sleutel = randomBytes(32).toString('base64')
    })
    afterAll(() => rmSync(map, { recursive: true, force: true }))

    async function maakBestand(): Promise<string> {
      const bron = await nieuw(`bron_${randomBytes(2).toString('hex')}`, true)
      zetBackupEnv(bron.url, sleutel)
      await vulDatabase(bron.client)
      delete (globalThis as Record<string, unknown>).__ibDb
      // Eigen map per back-up: twee back-ups in dezelfde minuut hebben dezelfde naam en het script overschrijft niets.
      const r = await uitvoer('maak', '--uit', mkdtempSync(join(map, 'b-')))
      expect(r.code).toBe(0)
      const pad = /naar (.*\.ibcbak)/.exec(r.tekst)?.[1]
      expect(pad).toBeTruthy()
      return pad!
    }

    it('weigert een database met tabellen van een andere app, zonder iets te wijzigen', async () => {
      const pad = await maakBestand()
      const vreemd = await nieuw('vreemd')
      await vreemd.client.query(`CREATE TABLE klanten (id integer PRIMARY KEY, naam text)`)
      await vreemd.client.query(`INSERT INTO klanten VALUES (1, 'x')`)
      zetBackupEnv(vreemd.url, sleutel)
      for (const extra of [[], ['--overschrijf'], ['--overschrijf', '--schema-opnieuw']]) {
        const r = await uitvoer('herstel', pad, ...extra)
        expect(r.code).toBe(1)
        expect(r.tekst).toContain('geen database van ibcalculator')
      }
      const { rows } = await vreemd.client.query<{ naam: string }>(
        `SELECT c.relname AS naam FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind = 'r'`,
        [vreemd.schema],
      )
      expect(rows.map((r) => r.naam)).toEqual(['klanten'])
    })

    it('een doel dat verder gemigreerd is: geweigerd, en met --schema-opnieuw opnieuw opgebouwd met ingetrokken sessies', async () => {
      const pad = await maakBestand()
      // Doel zoals na een deploy: alle migraties plus een latere, en iemand heeft de lege installatie geclaimd.
      const doel = await nieuw('nieuwer', true)
      await doel.client.query(`INSERT INTO _migrations (naam) VALUES ('0099_toekomst.sql')`)
      await doel.client.query(`INSERT INTO users (email, password_hash, sessie_generatie) VALUES ('indringer@example.nl', 'x', 3)`)
      zetBackupEnv(doel.url, sleutel)

      const zonder = await uitvoer('herstel', pad)
      expect(zonder.code).toBe(1)

      // 0099 staat niet op schijf en niet in de back-up: onbekend, dus geweigerd.
      const onbekend = await uitvoer('herstel', pad, '--overschrijf', '--schema-opnieuw')
      expect(onbekend.code).toBe(1)
      expect(onbekend.tekst).toContain('0099_toekomst.sql')

      // Een bekende migratie die nieuwer is dan de back-up: simuleer door hem uit de back-uplijst te halen.
      await doel.client.query(`DELETE FROM _migrations WHERE naam = '0099_toekomst.sql'`)
      const { readFileSync, writeFileSync } = await import('node:fs')
      const { ontsleutelBackup, versleutelBackup } = await import('../formaat')
      const inhoud = ontsleutelBackup(readFileSync(pad), Buffer.from(sleutel, 'base64'))
      const ouder = { ...inhoud, migraties: inhoud.migraties.filter((m) => m !== '0004_backups.sql') }
      const ouderPad = join(map, 'ouder.ibcbak')
      writeFileSync(ouderPad, versleutelBackup(ouder, Buffer.from(sleutel, 'base64')))

      const nieuwer = await uitvoer('herstel', ouderPad, '--overschrijf')
      expect(nieuwer.code).toBe(1)
      expect(nieuwer.tekst).toContain('--schema-opnieuw')
      expect((await doel.client.query(`SELECT email FROM users`)).rows).toEqual([{ email: 'indringer@example.nl' }])

      const opnieuw = await uitvoer('herstel', ouderPad, '--overschrijf', '--schema-opnieuw')
      expect(opnieuw.code, opnieuw.tekst).toBe(0)
      expect(opnieuw.tekst).toContain('account(s) die niet in de back-up zitten')
      expect(opnieuw.tekst).toContain('Alle bestaande sessies zijn ingetrokken.')
      const users = await doel.client.query<{ email: string; g: number }>(`SELECT email, sessie_generatie AS g FROM users ORDER BY id`)
      expect(users.rows.map((r) => r.email)).not.toContain('indringer@example.nl')
      for (const r of users.rows) expect(r.g).toBeGreaterThanOrEqual(1_000_000_000)
      const mig = await doel.client.query<{ naam: string }>(`SELECT naam FROM _migrations ORDER BY naam`)
      expect(mig.rows.map((r) => r.naam)).toContain('0004_backups.sql')
    })

    it('een back-up van een nieuwere app: nette melding zonder Engels voorvoegsel', async () => {
      const pad = await maakBestand()
      const { readFileSync, writeFileSync } = await import('node:fs')
      const { ontsleutelBackup, versleutelBackup } = await import('../formaat')
      const inhoud = ontsleutelBackup(readFileSync(pad), Buffer.from(sleutel, 'base64'))
      const toekomst = join(map, 'toekomst.ibcbak')
      writeFileSync(toekomst, versleutelBackup({ ...inhoud, migraties: [...inhoud.migraties, '0099_toekomst.sql'] }, Buffer.from(sleutel, 'base64')))
      const leeg = await nieuw('leeg_toekomst')
      zetBackupEnv(leeg.url, sleutel)
      const r = await uitvoer('herstel', toekomst)
      expect(r.code).toBe(1)
      expect(r.tekst).toContain('nieuwere versie van de app')
      expect(r.tekst).not.toMatch(/Error:/)
    })
  })

  it('markeerAfgebroken zet runs die langer dan een uur bezig zijn op mislukt', async () => {
    const x = await nieuw('runs', true)
    zetBackupEnv(x.url, randomBytes(32).toString('base64'))
    delete (globalThis as Record<string, unknown>).__ibDb
    await x.client.query(
      `INSERT INTO backups (soort, status, gestart_op) VALUES ('handmatig', 'bezig', now() - interval '2 hours'), ('handmatig', 'bezig', now())`,
    )
    const { markeerAfgebroken, laatsteRun } = await import('../runs')
    expect(await markeerAfgebroken()).toBe(1)
    const { rows } = await x.client.query<{ status: string; fout: string | null }>(`SELECT status, fout FROM backups ORDER BY id`)
    expect(rows[0]).toEqual({ status: 'mislukt', fout: 'Afgebroken, bijvoorbeeld door een herstart van de server.' })
    expect(rows[1].status).toBe('bezig')
    expect((await laatsteRun())?.status).toBe('bezig')
    const { getPool } = await import('@/lib/db')
    await getPool().end()
    delete (globalThis as Record<string, unknown>).__ibDb
  })
})
