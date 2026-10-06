/**
 * Integratietests van dump en herstel tegen een echte Postgres. Draaien alleen met IB_TEST_DATABASE_URL,
 * bijvoorbeeld een wegwerpcluster: initdb -D /tmp/pg && pg_ctl -D /tmp/pg -o "-p 55481" start.
 * Elke database in de test is een eigen schema dat aan het eind wordt verwijderd.
 */
import { randomBytes } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client, type ClientBase } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { BackupInhoud } from '../types'

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const PREFIX = `ib_dump_${Date.now()}_${randomBytes(3).toString('hex')}`
const stil = () => undefined

function urlVoor(schema: string): string {
  const u = new URL(BASIS_URL!)
  u.searchParams.set('options', `-c search_path=${schema}`)
  return u.toString()
}

/** Zoals de back-up echt reist: als JSON-tekst (daarna gzip en versleuteling). */
function viaJson(inhoud: BackupInhoud): BackupInhoud {
  return JSON.parse(JSON.stringify(inhoud)) as BackupInhoud
}

const LASTIGE_TEKST = 'Zoë’s “bakkerij” ☕🍰 \'enkel\' "dubbel" C:\\pad\\naar\\map \\x00 regel1\nregel2\r\n\ttab é ñ 漢字 😀'

describe.skipIf(!BASIS_URL)('dump en herstel op een echte database', () => {
  let beheer: Client
  const schemas: string[] = []
  const clients: Client[] = []

  async function nieuweDatabase(naam: string, migraties?: string[] | null): Promise<{ schema: string; url: string; client: Client }> {
    const schema = `${PREFIX}_${naam}`
    await beheer.query(`CREATE SCHEMA ${schema}`)
    schemas.push(schema)
    const url = urlVoor(schema)
    if (migraties !== null) {
      const { migreer } = await import('@/scripts/migrate')
      await migreer(url, undefined, stil, migraties ? { alleen: migraties } : {})
    }
    const client = new Client({ connectionString: url })
    await client.connect()
    clients.push(client)
    return { schema, url, client }
  }

  /** Alle rijen van een tabel als Postgres-tekst, zodat microseconden, tijdzones en precisie exact vergeleken worden. */
  async function rijenAlsTekst(client: ClientBase, tabel: string): Promise<string[]> {
    const { rows } = await client.query<{ r: string }>(`SELECT _r::text AS r FROM "${tabel}" _r ORDER BY 1`)
    return rows.map((x) => x.r)
  }

  async function vulBron(c: ClientBase): Promise<void> {
    await c.query(`INSERT INTO users (email, password_hash, totp_secret, totp_enabled, sessie_generatie, created_at) VALUES
      ('anna@example.nl', '$2b$12$abcdefghijklmnopqrstuuv0123456789ABCDEFGHIJKLMNOPQRS', 'JBSWY3DPEHPK3PXP', true, 3, '2025-08-14 08:15:30.123456+02'),
      ('weg@example.nl', '$2b$12$weg', '', false, 0, '2025-08-01 00:00:00+02'),
      ('partner+test@example.nl', '$2b$12$xyz\\/"''', 'KRSXG5CTMVRXEZLU', true, 0, '2026-01-01 23:59:59.999999+01')`)
    // Een gat in de ids: na herstel moet de sequence toch achter het hoogste id staan.
    await c.query(`DELETE FROM users WHERE email = 'weg@example.nl'`)
    await c.query(
      `INSERT INTO households (user_id, naam, gegevens_enc, created_at, updated_at) VALUES
        ((SELECT id FROM users WHERE email = 'anna@example.nl'), $1, 'v2.aaa.bbb.ccc', '2025-08-14 08:15:30.000001+02', now()),
        ((SELECT id FROM users WHERE email = 'partner+test@example.nl'), 'Huishouden', 'v2.ddd.eee.fff', now(), now())`,
      [LASTIGE_TEKST],
    )
    await c.query(
      `INSERT INTO dossier_years (household_id, jaar, variant, invoer_enc, status, versie, updated_at)
       SELECT h.id, j.jaar, j.variant, 'v2.' || h.id || '.' || j.jaar, j.status, j.versie, '2026-10-04 16:57:00.654321+02'
         FROM households h CROSS JOIN (VALUES (2024, NULL, 'ingediend', 4), (2025, 'voorstel-a', 'concept', 1), (2026, $1, 'gecontroleerd', 2)) AS j(jaar, variant, status, versie)`,
      [LASTIGE_TEKST],
    )
    await c.query(
      `INSERT INTO snapshots (dossier_year_id, params_hash, uitkomst_enc, created_at)
       SELECT d.id, 'sha256:' || md5(d.id::text), 'v2.snap.' || d.id, '2026-03-01 12:00:00.000500+01' FROM dossier_years d`,
    )
    await c.query(`INSERT INTO accountant_docs (dossier_year_id, regels_enc) SELECT id, 'v2.acc.' || id FROM dossier_years WHERE jaar = 2024`)
    await c.query(
      `INSERT INTO koppelingen (household_id, soort, label, token_enc, administratie_id, administratie_naam, indeling_enc, laatst_gebruikt) VALUES
        ((SELECT min(id) FROM households), 'moneybird', $1, 'v2.token.geheim', '123456789012345678', 'Mijn bedrijf B.V.', 'v2.indeling', '2026-09-30 10:11:12.131415+02'),
        ((SELECT min(id) FROM households), 'moneybird-env', 'Uit de omgeving', '', NULL, NULL, NULL, NULL)`,
      [LASTIGE_TEKST],
    )
    await c.query(`INSERT INTO backups (soort, periode, status) VALUES ('gepland', '2026-08', 'verstuurd'), ('handmatig', NULL, 'mislukt')`)
  }

  let bron: { schema: string; url: string; client: Client }
  let dump: BackupInhoud
  const TABELLEN = ['users', 'households', 'dossier_years', 'snapshots', 'accountant_docs', 'koppelingen', 'aangifte_staat', 'herstelpunten']

  beforeAll(async () => {
    beheer = new Client({ connectionString: BASIS_URL })
    await beheer.connect()
    bron = await nieuweDatabase('bron')
    await vulBron(bron.client)
  })

  afterAll(async () => {
    for (const c of clients) await c.end().catch(() => undefined)
    for (const s of schemas) await beheer.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`)
    await beheer.end()
  })

  it('dumpt alle tabellen behalve backups en _migrations, ouders vóór kinderen', async () => {
    const { maakDump, telRijen } = await import('../dump')
    dump = await maakDump(bron.client, { gitSha: 'abc1234' })
    expect(dump.formaat).toBe('ibcalculator-backup')
    expect(dump.versie).toBe(1)
    expect(dump.gitSha).toBe('abc1234')
    expect(Number.isNaN(Date.parse(dump.gemaaktOp))).toBe(false)
    expect(dump.migraties).toEqual(['0001_init.sql', '0002_sessie_generatie.sql', '0003_koppelingen.sql', '0004_backups.sql', '0005_aangiftestaat.sql', '0006_ingediend.sql'])

    const namen = dump.tabellen.map((t) => t.naam)
    expect(namen).not.toContain('backups')
    expect(namen).not.toContain('_migrations')
    expect([...namen].sort()).toEqual([...TABELLEN].sort())
    const voor = (a: string, b: string) => expect(namen.indexOf(a)).toBeLessThan(namen.indexOf(b))
    voor('users', 'households')
    voor('households', 'dossier_years')
    voor('households', 'koppelingen')
    voor('dossier_years', 'snapshots')
    voor('dossier_years', 'accountant_docs')

    expect(telRijen(dump)).toEqual({ users: 2, households: 2, dossier_years: 6, snapshots: 6, accountant_docs: 2, koppelingen: 2, aangifte_staat: 0, herstelpunten: 0 })
    const users = dump.tabellen.find((t) => t.naam === 'users')!
    expect(users.kolommen).toEqual(['id', 'email', 'password_hash', 'totp_secret', 'totp_enabled', 'created_at', 'sessie_generatie'])
    expect(users.rijen.map((r) => r.totp_secret)).toEqual(['JBSWY3DPEHPK3PXP', 'KRSXG5CTMVRXEZLU'])
    // Rijen op volgorde van de primaire sleutel; elke waarde in de tekstvorm van Postgres.
    expect(users.rijen.map((r) => r.id)).toEqual(['1', '3'])

    const vast = await maakDump(bron.client, { nu: new Date('2027-02-01T03:00:00.000Z') })
    expect(vast.gemaaktOp).toBe('2027-02-01T03:00:00.000Z')
    expect(vast.gitSha).toBeNull()
  })

  it('herstelt in een lege database precies dezelfde rijen, en nieuwe ids komen boven het maximum', async () => {
    const { herstelDump } = await import('../dump')
    const doel = await nieuweDatabase('doel', dump.migraties)
    const telling = await herstelDump(doel.client, viaJson(dump))
    expect(telling).toEqual({ users: 2, households: 2, dossier_years: 6, snapshots: 6, accountant_docs: 2, koppelingen: 2, aangifte_staat: 0, herstelpunten: 0 })

    for (const t of TABELLEN) expect(await rijenAlsTekst(doel.client, t), t).toEqual(await rijenAlsTekst(bron.client, t))
    const { rows: mig } = await doel.client.query<{ naam: string }>('SELECT naam FROM _migrations ORDER BY naam')
    expect(mig.map((r) => r.naam)).toEqual(dump.migraties)
    expect((await doel.client.query('SELECT count(*)::int AS n FROM backups')).rows[0].n).toBe(0)

    for (const t of TABELLEN) {
      const { rows } = await doel.client.query<{ max: number; volgende: number }>(
        `SELECT (SELECT max(id) FROM "${t}") AS max, nextval(pg_get_serial_sequence('"${t}"', 'id'))::int AS volgende`,
      )
      // Lege tabellen (aangifte_staat, herstelpunten) hebben geen maximum.
      if (rows[0].max !== null) expect(rows[0].volgende, t).toBeGreaterThan(rows[0].max)
    }
    const { rows } = await doel.client.query<{ id: number }>(`INSERT INTO users (email, password_hash) VALUES ('nieuw@example.nl', 'x') RETURNING id`)
    expect(rows[0].id).toBeGreaterThan(3)
  })

  it('weigert een niet-lege database zonder overschrijven en vervangt alles met overschrijven', async () => {
    const { herstelDump, HerstelFout } = await import('../dump')
    const doel = await nieuweDatabase('vol', dump.migraties)
    await doel.client.query(`INSERT INTO users (email, password_hash) VALUES ('al-hier@example.nl', 'x')`)

    const fout = await herstelDump(doel.client, viaJson(dump)).catch((e: unknown) => e)
    expect(fout).toBeInstanceOf(HerstelFout)
    expect((fout as Error).message).toMatch(/^De doeldatabase is niet leeg/)
    expect(await rijenAlsTekst(doel.client, 'users')).toHaveLength(1)
    expect(await rijenAlsTekst(doel.client, 'households')).toHaveLength(0)

    await herstelDump(doel.client, viaJson(dump), { overschrijf: true })
    for (const t of TABELLEN) expect(await rijenAlsTekst(doel.client, t), t).toEqual(await rijenAlsTekst(bron.client, t))

    // Twee keer overschrijven is ook goed, en de sequences staan weer goed.
    await herstelDump(doel.client, viaJson(dump), { overschrijf: true })
    for (const t of TABELLEN) expect(await rijenAlsTekst(doel.client, t), t).toEqual(await rijenAlsTekst(bron.client, t))
    const { rows } = await doel.client.query<{ id: number }>(`INSERT INTO users (email, password_hash) VALUES ('nieuw@example.nl', 'x') RETURNING id`)
    expect(rows[0].id).toBe(4)
  })

  it('weigert herstel als een tabel of kolom in de doeldatabase ontbreekt', async () => {
    const { herstelDump, HerstelFout } = await import('../dump')
    const oud = await nieuweDatabase('oud', ['0001_init.sql', '0002_sessie_generatie.sql'])
    const zonderTabel = await herstelDump(oud.client, viaJson(dump)).catch((e: unknown) => e)
    expect(zonderTabel).toBeInstanceOf(HerstelFout)
    // De eerste ontbrekende tabel in de volgorde van de dump (sinds ronde 2 staat aangifte_staat vóór koppelingen).
    expect((zonderTabel as Error).message).toMatch(/^Tabel (aangifte_staat|koppelingen|herstelpunten) bestaat niet; migreer eerst tot de migraties uit de back-up\.$/)

    // Alle tabellen bestaan, maar 0002 (kolom sessie_generatie) ontbreekt.
    const zonderKolom = await nieuweDatabase('kolom', ['0001_init.sql', '0003_koppelingen.sql', '0004_backups.sql', '0005_aangiftestaat.sql', '0006_ingediend.sql'])
    const fout = await herstelDump(zonderKolom.client, viaJson(dump)).catch((e: unknown) => e)
    expect(fout).toBeInstanceOf(HerstelFout)
    expect((fout as Error).message).toMatch(/Kolom sessie_generatie van tabel users bestaat niet/)
    // Niets half ingevoegd.
    expect(await rijenAlsTekst(zonderKolom.client, 'users')).toHaveLength(0)
  })

  it('migreert met alleen precies de gevraagde migraties en weigert een onbekende', async () => {
    const { migreer } = await import('@/scripts/migrate')
    const db = await nieuweDatabase('alleen', ['0001_init.sql'])
    const { rows } = await db.client.query<{ naam: string }>('SELECT naam FROM _migrations ORDER BY naam')
    expect(rows.map((r) => r.naam)).toEqual(['0001_init.sql'])
    await expect(migreer(db.url, undefined, stil, { alleen: ['0001_init.sql', '9999_uit_de_toekomst.sql'] })).rejects.toThrow(
      'Deze back-up komt van een nieuwere versie van de app: migratie 9999_uit_de_toekomst.sql ontbreekt.',
    )
    // Zonder alleen werkt alles zoals altijd.
    // Alle migraties op schijf behalve 0001.
    expect(await migreer(db.url, undefined, stil)).toBe(readdirSync(join(process.cwd(), 'migrations')).filter((f) => f.endsWith('.sql')).length - 1)
  })

  it('zet bigint, numeric, money en arrays exact terug, slaat berekende kolommen over en sorteert op verwijzingen', async () => {
    const { maakDump, herstelDump } = await import('../dump')
    const ddl = `
      CREATE TABLE z_ouder (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        baas bigint REFERENCES z_ouder(id),
        groot bigint,
        exact numeric,
        geld money,
        lijst bigint[],
        kommagetal double precision,
        ruw bytea,
        json_veld jsonb,
        dubbel text GENERATED ALWAYS AS (groot::text || '!') STORED
      );
      CREATE TABLE a_kind (
        ouder_id bigint NOT NULL REFERENCES z_ouder(id),
        volgnummer int NOT NULL,
        "Rare ""naam""" text,
        PRIMARY KEY (ouder_id, volgnummer)
      );`
    const a = await nieuweDatabase('precisie_a', null)
    const b = await nieuweDatabase('precisie_b', null)
    await a.client.query(ddl)
    await b.client.query(ddl)
    await a.client.query(`INSERT INTO z_ouder (baas, groot, exact, geld, lijst, kommagetal, ruw, json_veld) VALUES
      (NULL, 9007199254740993, 12345678901234567890.123456789, 1234567.89, ARRAY[9007199254740993, -9223372036854775808]::bigint[], 0.1, '\\x00ff10'::bytea, '{"a": [1, "twee", null], "b": "é"}'),
      (1, -9223372036854775807, 'NaN', -0.01, '{}', 'Infinity', NULL, NULL)`)
    await a.client.query(`INSERT INTO a_kind VALUES (2, 1, $1), (1, 7, NULL)`, [LASTIGE_TEKST])

    const d = await maakDump(a.client, {})
    expect(d.migraties).toEqual([])
    expect(d.tabellen.map((t) => t.naam)).toEqual(['z_ouder', 'a_kind'])
    const ouder = d.tabellen[0]
    expect(ouder.kolommen).not.toContain('dubbel')
    expect(ouder.rijen[0].groot).toBe('9007199254740993')
    expect(ouder.rijen[0].exact).toBe('12345678901234567890.123456789')
    expect(ouder.rijen[0].lijst).toBe('{9007199254740993,-9223372036854775808}')
    expect(ouder.rijen[0]).not.toHaveProperty('dubbel')

    expect(await herstelDump(b.client, viaJson(d))).toEqual({ z_ouder: 2, a_kind: 2 })
    for (const t of ['z_ouder', 'a_kind']) expect(await rijenAlsTekst(b.client, t), t).toEqual(await rijenAlsTekst(a.client, t))
    const { rows } = await b.client.query<{ groot: string; exact: string; dubbel: string }>(
      `SELECT groot::text, exact::text, dubbel FROM z_ouder WHERE id = 1`,
    )
    expect(rows[0]).toEqual({ groot: '9007199254740993', exact: '12345678901234567890.123456789', dubbel: '9007199254740993!' })
    const nieuw = await b.client.query<{ id: string }>(`INSERT INTO z_ouder (groot) VALUES (1) RETURNING id`)
    expect(nieuw.rows[0].id).toBe('3')
  })

  it('weigert een kring van verwijzingen met een duidelijke fout', async () => {
    const { maakDump } = await import('../dump')
    const k = await nieuweDatabase('kring', null)
    await k.client.query(`
      CREATE TABLE kip (id int PRIMARY KEY, ei_id int);
      CREATE TABLE ei (id int PRIMARY KEY, kip_id int REFERENCES kip(id));
      ALTER TABLE kip ADD FOREIGN KEY (ei_id) REFERENCES ei(id);`)
    await expect(maakDump(k.client, {})).rejects.toThrow(/kring van foreign keys/)
    // De verbinding is daarna weer bruikbaar (geen open transactie).
    expect((await k.client.query('SELECT 1 AS een')).rows[0].een).toBe(1)
  })

  it('ziet binnen REPEATABLE READ geen rijen die halverwege de dump worden toegevoegd', async () => {
    const { maakDump, telRijen } = await import('../dump')
    const ander = new Client({ connectionString: bron.url })
    await ander.connect()
    clients.push(ander)
    let tussendoor = false
    // Na de eerste tabel (users) voegt een andere verbinding rijen toe aan users en de tabellen erna.
    const spion = {
      query: async (...args: unknown[]) => {
        const uitkomst = await (bron.client.query as (...a: unknown[]) => Promise<unknown>).apply(bron.client, args)
        if (!tussendoor && typeof args[0] === 'string' && args[0].includes('json_agg')) {
          tussendoor = true
          const { rows } = await ander.query<{ id: number }>(`INSERT INTO users (email, password_hash) VALUES ('tussendoor@example.nl', 'x') RETURNING id`)
          const h = await ander.query<{ id: number }>(`INSERT INTO households (user_id, gegevens_enc) VALUES ($1, 'v2.tussendoor') RETURNING id`, [rows[0].id])
          await ander.query(`INSERT INTO koppelingen (household_id, label, token_enc) VALUES ($1, 'tussendoor', 'v2.x')`, [h.rows[0].id])
        }
        return uitkomst
      },
    } as unknown as ClientBase

    const voor = telRijen(await maakDump(bron.client, {}))
    const tijdens = await maakDump(spion, {})
    expect(tussendoor).toBe(true)
    expect(telRijen(tijdens)).toEqual(voor)
    expect(JSON.stringify(tijdens)).not.toContain('tussendoor')
    // Daarna zijn de rijen er wel.
    const na = telRijen(await maakDump(bron.client, {}))
    expect(na.users).toBe(voor.users + 1)
    expect(na.households).toBe(voor.households + 1)
    expect(na.koppelingen).toBe(voor.koppelingen + 1)
  })
})
