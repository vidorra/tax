/**
 * Migraties op een echt SQLite-bestand: idempotent, per migratie een transactie, register in _migrations,
 * gelijktijdige starts in aparte processen en het opnieuw opbouwen van een tabel zonder foreign keys.
 */
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openSqlite, type Sqlite } from '@/lib/db'
import { MIGRATIE_MAP, MigratieFout, migratiesOpSchijf, migreer, onbekendeMigraties, uitgevoerdeMigraties, ZONDER_FOREIGN_KEYS } from '@/lib/db/migreer'

const stil = { log: () => undefined }
const voerUit = promisify(execFile)

let werk = ''
let open: Sqlite[] = []

beforeEach(() => {
  werk = mkdtempSync(join(tmpdir(), 'ib-migreer-'))
  open = []
})

afterEach(() => {
  for (const s of open) if (s.open) s.close()
  rmSync(werk, { recursive: true, force: true })
})

function verbind(pad = join(werk, 'ib.db')): Sqlite {
  const s = openSqlite(pad)
  open.push(s)
  return s
}

function migratieMap(bestanden: Record<string, string>): string {
  const map = join(werk, `migraties-${Object.keys(bestanden).length}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(map)
  for (const [naam, tekst] of Object.entries(bestanden)) writeFileSync(join(map, naam), tekst)
  return map
}

describe('migreer', () => {
  it('voert de echte migraties uit, registreert ze en doet de tweede keer niets', () => {
    const pad = join(werk, 'sub', 'ib.db')
    const op = migratiesOpSchijf()
    expect(op.length).toBeGreaterThan(0)
    expect(op).toEqual([...op].sort())
    expect(migreer(pad, stil)).toBe(op.length)
    expect(migreer(pad, stil)).toBe(0)
    const s = verbind(pad)
    expect(uitgevoerdeMigraties(s)).toEqual(op)
    expect(onbekendeMigraties(s)).toEqual([])
    const tabellen = (s.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as Array<{ name: string }>).map((r) => r.name)
    expect(tabellen).toEqual(['_migrations', 'aangifte_staat', 'accountant_docs', 'backups', 'dossier_years', 'herstelpunten', 'households', 'koppelingen', 'snapshots', 'uitnodigingen', 'users'])
    const { uitgevoerd_op } = s.prepare('SELECT uitgevoerd_op FROM _migrations').get() as { uitgevoerd_op: string }
    expect(uitgevoerd_op).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('werkt ook op een open verbinding en weigert binnen een transactie', () => {
    const s = verbind()
    s.prepare('BEGIN').run()
    expect(() => migreer(s, stil)).toThrow(MigratieFout)
    s.prepare('ROLLBACK').run()
    expect(migreer(s, stil)).toBe(migratiesOpSchijf().length)
    expect(s.open).toBe(true)
  })

  it('een mislukte migratie draait helemaal terug; eerdere blijven staan en een herstelde versie gaat verder', () => {
    const map = migratieMap({
      '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
      '0002_b.sql': "CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;\nINSERT INTO a (id) VALUES ('geen getal');",
    })
    const s = verbind()
    let fout: unknown
    try {
      migreer(s, { ...stil, map })
    } catch (e) {
      fout = e
    }
    expect(fout).toBeInstanceOf(MigratieFout)
    expect((fout as Error).message).toMatch(/^Migratie 0002_b\.sql mislukt: /)
    expect(uitgevoerdeMigraties(s)).toEqual(['0001_a.sql'])
    expect(s.prepare(`SELECT name FROM sqlite_master WHERE name = 'b'`).get()).toBeUndefined()
    expect(s.inTransaction).toBe(false)

    writeFileSync(join(map, '0002_b.sql'), 'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;\nINSERT INTO a (id) VALUES (1);')
    expect(migreer(s, { ...stil, map })).toBe(1)
    expect(uitgevoerdeMigraties(s)).toEqual(['0001_a.sql', '0002_b.sql'])
  })

  it('kent migraties die niet op schijf staan als onbekend (database van een nieuwere versie)', () => {
    const s = verbind()
    expect(uitgevoerdeMigraties(s)).toEqual([])
    migreer(s, stil)
    s.prepare(`INSERT INTO _migrations (naam) VALUES ('9999_toekomst.sql')`).run()
    expect(onbekendeMigraties(s)).toEqual(['9999_toekomst.sql'])
    expect(onbekendeMigraties(s, MIGRATIE_MAP)).toEqual(['9999_toekomst.sql'])
    expect(migreer(s, stil)).toBe(0)
  })

  it('bouwt een tabel opnieuw op zonder foreign keys en controleert ze daarna', () => {
    const basis = {
      '0001_basis.sql': `CREATE TABLE ouder (id INTEGER PRIMARY KEY, naam TEXT NOT NULL) STRICT;
        CREATE TABLE kind (id INTEGER PRIMARY KEY, ouder_id INTEGER NOT NULL REFERENCES ouder(id) ON DELETE CASCADE) STRICT;
        INSERT INTO ouder VALUES (1, 'a'), (2, 'b');
        INSERT INTO kind VALUES (10, 1), (11, 2);`,
    }
    const herbouw = `${ZONDER_FOREIGN_KEYS}
      CREATE TABLE ouder_nieuw (id INTEGER PRIMARY KEY, naam TEXT NOT NULL CHECK (length(naam) > 0)) STRICT;
      INSERT INTO ouder_nieuw SELECT id, naam FROM ouder;
      DROP TABLE ouder;
      ALTER TABLE ouder_nieuw RENAME TO ouder;`
    const s = verbind()
    expect(migreer(s, { ...stil, map: migratieMap({ ...basis, '0002_herbouw.sql': herbouw }) })).toBe(2)
    // Met foreign keys aan had DROP TABLE ouder de kinderen via de cascade verwijderd.
    expect(s.prepare('SELECT count(*) AS n FROM kind').get()).toEqual({ n: 2 })
    expect(s.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(() => s.prepare(`INSERT INTO ouder VALUES (3, '')`).run()).toThrow(/CHECK/)

    const wees = `${ZONDER_FOREIGN_KEYS}\nDELETE FROM ouder WHERE id = 1;`
    expect(() => migreer(s, { ...stil, map: migratieMap({ ...basis, '0002_herbouw.sql': herbouw, '0003_wees.sql': wees }) })).toThrow(/0003_wees\.sql mislukt: .*foreign_key_check/)
    expect(s.prepare('SELECT count(*) AS n FROM ouder').get()).toEqual({ n: 2 })
    expect(uitgevoerdeMigraties(s)).toEqual(['0001_basis.sql', '0002_herbouw.sql'])
    expect(s.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('gelijktijdige starts in aparte processen voeren elke migratie precies één keer uit', async () => {
    const tellers = Array.from({ length: 6 }, (_, i) => `INSERT INTO teller (bron) VALUES ('${i}');`)
    const bestanden: Record<string, string> = {
      '0001_teller.sql': 'CREATE TABLE teller (id INTEGER PRIMARY KEY, bron TEXT NOT NULL) STRICT;',
      // Een trage migratie, zodat de processen elkaar echt tegenkomen.
      '0002_traag.sql': `CREATE TABLE veel (n INTEGER NOT NULL) STRICT;
        WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 300000) INSERT INTO veel SELECT n FROM r;`,
    }
    tellers.forEach((t, i) => (bestanden[`000${i + 3}_teller.sql`] = t))
    const map = migratieMap(bestanden)
    const pad = join(werk, 'gedeeld.db')
    const runner = join(werk, 'runner.ts')
    writeFileSync(
      runner,
      `import { migreer } from ${JSON.stringify(join(process.cwd(), 'lib/db/migreer.ts'))}\n` +
        `console.log('AANTAL=' + migreer(process.argv[2], { map: process.argv[3], log: () => undefined }))\n`,
    )
    const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx')
    const uitkomsten = await Promise.all(Array.from({ length: 6 }, () => voerUit(tsx, [runner, pad, map], { cwd: process.cwd(), timeout: 60_000 })))
    const aantallen = uitkomsten.map((u) => Number(/AANTAL=(\d+)/.exec(u.stdout)?.[1]))
    expect(aantallen.every((n) => Number.isInteger(n))).toBe(true)
    expect(aantallen.reduce((a, b) => a + b, 0)).toBe(Object.keys(bestanden).length)
    const s = verbind(pad)
    expect(s.prepare('SELECT count(*) AS n FROM teller').get()).toEqual({ n: tellers.length })
    expect(s.prepare('SELECT count(*) AS n FROM veel').get()).toEqual({ n: 300000 })
    expect(uitgevoerdeMigraties(s)).toEqual(Object.keys(bestanden).sort())
  }, 90_000)
})
