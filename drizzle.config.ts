import type { Config } from 'drizzle-kit'

/**
 * drizzle-kit (npm run db:generate), alleen als hulpmiddel om een migratie op te stellen. De migraties die echt
 * draaien staan als SQL in migrations/ en worden uitgevoerd door scripts/migrate.ts (npm run db:migrate).
 */
export default {
  schema: './lib/db/schema.ts',
  out: './migrations/drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_PATH?.trim() || './data/ibcalculator.db' },
  strict: true,
  verbose: true,
} satisfies Config
