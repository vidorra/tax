/**
 * Lazy databaseverbinding. Er wordt pas een Pool gemaakt bij de eerste query, zodat
 * `next build` en pagina's zonder DATABASE_URL gewoon werken.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>

interface Cache {
  pool?: Pool
  db?: Db
}

const g = globalThis as unknown as { __ibDb?: Cache }

export function dbGeconfigureerd(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export function getPool(): Pool {
  const cache = (g.__ibDb ??= {})
  if (!cache.pool) {
    const url = process.env.DATABASE_URL?.trim()
    if (!url) throw new Error('DATABASE_URL ontbreekt; het dossier heeft een Postgres-database nodig.')
    cache.pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 })
    // Een verbroken verbinding mag het proces niet laten crashen; de volgende query maakt een nieuwe.
    cache.pool.on('error', () => undefined)
  }
  return cache.pool
}

export function getDb(): Db {
  const cache = (g.__ibDb ??= {})
  if (!cache.db) cache.db = drizzle(getPool(), { schema })
  return cache.db
}

export { schema }
