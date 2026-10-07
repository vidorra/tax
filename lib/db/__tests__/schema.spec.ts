/**
 * lib/db/schema.ts en migrations/*.sql moeten hetzelfde zeggen. Na het migreren van een leeg bestand vergelijkt
 * deze test per tabel de kolommen (naam, NOT NULL, primaire sleutel, wel of geen standaardwaarde), de foreign keys
 * en de indexen met het Drizzle-schema.
 */
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'

import { getSqlite } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'

const tabellen = (Object.values(schema) as unknown[]).filter((x): x is SQLiteTable => x instanceof SQLiteTable)

interface KolomInfo {
  name: string
  notnull: number
  pk: number
  dflt_value: string | null
}

describe('schema.ts tegenover de migraties', () => {
  gebruikTijdelijkeDb({ per: 'bestand' })

  it('kent dezelfde tabellen (behalve _migrations)', () => {
    const inDb = (getSqlite().prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migrations'`).all() as Array<{ name: string }>)
      .map((r) => r.name)
      .sort()
    expect(tabellen.map((t) => getTableConfig(t).name).sort()).toEqual(inDb)
  })

  it.each(tabellen.map((t) => [getTableConfig(t).name, t] as const))('%s: kolommen, foreign keys en indexen', (naam, tabel) => {
    const cfg = getTableConfig(tabel)
    const sqlite = getSqlite()

    const kolommen = sqlite.prepare(`SELECT name, "notnull", pk, dflt_value FROM pragma_table_info(?)`).all(naam) as KolomInfo[]
    const uitDb = kolommen.map((k) => ({ naam: k.name, notNull: k.notnull === 1 || k.pk > 0, pk: k.pk > 0, standaard: k.dflt_value !== null })).sort((a, b) => a.naam.localeCompare(b.naam))
    const uitSchema = cfg.columns
      .map((c) => ({ naam: c.name, notNull: c.notNull, pk: c.primary, standaard: c.hasDefault && !c.primary }))
      .sort((a, b) => a.naam.localeCompare(b.naam))
    expect(uitSchema).toEqual(uitDb)

    const fks = (sqlite.prepare(`SELECT "table" AS ouder, "from" AS kolom, "to" AS naar, on_delete FROM pragma_foreign_key_list(?)`).all(naam) as Array<Record<string, string>>)
      .map((f) => `${f.kolom}->${f.ouder}.${f.naar} ${f.on_delete}`)
      .sort()
    const fksSchema = cfg.foreignKeys
      .map((fk) => {
        const r = fk.reference()
        return `${r.columns[0].name}->${getTableConfig(r.foreignTable).name}.${r.foreignColumns[0].name} ${(fk.onDelete ?? 'no action').toUpperCase()}`
      })
      .sort()
    expect(fksSchema).toEqual(fks)

    // Benoemde indexen uit het schema bestaan in de database, en de database heeft geen eigen benoemde extra's.
    const indexen = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_autoindex_%'`).all(naam) as Array<{ name: string }>)
      .map((r) => r.name)
      .sort()
    expect(cfg.indexes.map((i) => i.config.name).sort()).toEqual(indexen)

    // UNIQUE: per kolom of als benoemde constraint; in de database als automatische index.
    const uniekDb = (sqlite.prepare(`SELECT il.name, il."unique", il.origin FROM pragma_index_list(?) il WHERE il.origin = 'u'`).all(naam) as Array<{ name: string }>)
      .map((i) => (sqlite.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(i.name) as Array<{ name: string }>).map((c) => c.name).join(','))
      .sort()
    const uniekSchema = [...cfg.columns.filter((c) => c.isUnique).map((c) => c.name), ...cfg.uniqueConstraints.map((u) => u.columns.map((c) => c.name).join(','))].sort()
    expect(uniekSchema).toEqual(uniekDb)

    // CHECK-constraints: elke naam uit het schema staat in de CREATE TABLE.
    const ddl = (sqlite.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(naam) as { sql: string }).sql
    for (const c of cfg.checks) expect(ddl).toContain(`CONSTRAINT ${c.name} CHECK`)
    expect((ddl.match(/CONSTRAINT \w+ CHECK/g) ?? []).length).toBe(cfg.checks.length)
    expect(ddl.trimEnd().endsWith('STRICT')).toBe(true)
  })
})
