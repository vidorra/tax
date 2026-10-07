/**
 * Voert de migraties uit op het databasebestand (DATABASE_PATH, standaard ./data/ibcalculator.db en in de
 * container /app/data/ibcalculator.db). Maakt het bestand en de map aan als ze er nog niet zijn. Idempotent en
 * veilig bij gelijktijdige starts; zie lib/db/migreer.ts. start.sh draait dit vóór de server.
 *
 *   npm run db:migrate
 */
import { pathToFileURL } from 'node:url'

import { migreer } from '../lib/db/migreer'
import { dbPad } from '../lib/db/pad'

export { MigratieFout, migreer } from '../lib/db/migreer'

function main(): void {
  const pad = dbPad()
  console.log(`Database: ${pad}`)
  migreer(pad)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
