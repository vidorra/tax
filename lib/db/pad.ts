/**
 * Waar het databasebestand staat en of die plek bruikbaar is. Laadt better-sqlite3 niet, zodat lib/auth/config.ts
 * dit kan gebruiken zonder de native module. Alleen de Node-runtime (node:fs), niet de edge-middleware.
 *
 * DATABASE_PATH wijst naar het bestand. Zonder die variabele is het <cwd>/data/ibcalculator.db: lokaal
 * ./data/ibcalculator.db (git negeert /data/), in de container /app/data/ibcalculator.db, en /app/data is daar
 * een Persistent Directory (CapRover). Naast het bestand maakt SQLite in WAL-modus -wal en -shm aan, dus de
 * map zelf moet ook schrijfbaar zijn.
 */
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const DB_BESTANDSNAAM = 'ibcalculator.db'

/** Absoluut pad van het databasebestand. */
export function dbPad(env: Record<string, string | undefined> = process.env): string {
  const pad = env.DATABASE_PATH?.trim()
  return resolve(pad || join(process.cwd(), 'data', DB_BESTANDSNAAM))
}

/**
 * Kan de app het databasebestand openen en schrijven? Bestaat het al, dan moeten het bestand en de map schrijfbaar
 * zijn. Bestaat het nog niet, dan moet de dichtstbijzijnde bestaande map schrijfbaar zijn (de rest maakt de app
 * zelf aan). Maakt zelf niets aan.
 */
export function databasemapSchrijfbaar(pad: string = dbPad()): boolean {
  try {
    if (existsSync(pad)) {
      if (!statSync(pad).isFile()) return false
      accessSync(pad, constants.R_OK | constants.W_OK)
      accessSync(dirname(pad), constants.W_OK)
      return true
    }
    let map = dirname(pad)
    while (!existsSync(map)) {
      const ouder = dirname(map)
      if (ouder === map) return false
      map = ouder
    }
    if (!statSync(map).isDirectory()) return false
    accessSync(map, constants.W_OK)
    return true
  } catch {
    return false
  }
}
