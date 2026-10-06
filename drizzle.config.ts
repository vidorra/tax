import type { Config } from 'drizzle-kit'

/**
 * drizzle-kit (npm run db:generate). De migraties die echt draaien staan als SQL in
 * migrations/ en worden uitgevoerd door scripts/migrate.ts (npm run db:migrate).
 */
export default {
  schema: './lib/db/schema.ts',
  out: './migrations/drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
} satisfies Config
