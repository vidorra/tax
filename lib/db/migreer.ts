/**
 * Migraties voor het SQLite-bestand: migrations/*.sql in alfabetische volgorde, elk in een eigen transactie
 * (BEGIN IMMEDIATE), geregistreerd in _migrations. Idempotent: een geregistreerde migratie slaat hij over.
 *
 * Gelijktijdige starts (twee processen, een nieuwe container naast een oude) zijn veilig: binnen de transactie
 * kijkt hij opnieuw of de migratie al geregistreerd is, en BEGIN IMMEDIATE laat het tweede proces wachten tot
 * het eerste klaar is (busy_timeout).
 *
 * Regels voor een migratiebestand:
 *  - Geen BEGIN/COMMIT erin; de runner zet er zelf een transactie omheen.
 *  - SQLite kan een kolom of constraint vaak niet wijzigen. Dan: nieuwe tabel maken, gegevens kopiëren, oude
 *    weg, nieuwe hernoemen. Zet daarvoor `-- migratie: zonder-foreign-keys` in het bestand: de runner zet
 *    foreign_keys dan uit vóór de transactie, controleert met PRAGMA foreign_key_check vóór COMMIT en zet ze
 *    daarna weer aan (de werkwijze uit de SQLite-documentatie, "Making Other Kinds Of Table Schema Changes").
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { openSqlite, type Sqlite } from './index'
import { dbPad } from './pad'

/** Map met de migraties; in de container /app/migrations. */
export const MIGRATIE_MAP = join(process.cwd(), 'migrations')

/** Markering in een migratiebestand: draai zonder foreign keys (tabel opnieuw opbouwen). */
export const ZONDER_FOREIGN_KEYS = '-- migratie: zonder-foreign-keys'

/** Hoe lang een apart migratieproces wacht op een ander proces dat migreert of schrijft. */
const MIGRATIE_BUSY_MS = 60_000

/** Verwachte fout bij migreren; de melding is voor de gebruiker bedoeld en bevat geen inhoud van rijen. */
export class MigratieFout extends Error {
  constructor(bericht: string) {
    super(bericht)
    this.name = 'MigratieFout'
  }
}

export interface MigreerOpties {
  /** Map met *.sql; standaard migrations/ in de werkmap. */
  map?: string
  log?: (melding: string) => void
}

/** Namen van de migratiebestanden op schijf, gesorteerd. */
export function migratiesOpSchijf(map: string = MIGRATIE_MAP): string[] {
  return readdirSync(map)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/** Geregistreerde migraties in deze database, gesorteerd; [] als _migrations nog niet bestaat. */
export function uitgevoerdeMigraties(sqlite: Sqlite): string[] {
  const bestaat = sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_migrations'`).get()
  if (!bestaat) return []
  return (sqlite.prepare('SELECT naam FROM _migrations ORDER BY naam').all() as Array<{ naam: string }>).map((r) => r.naam)
}

/** Migraties die de database kent maar die niet op schijf staan: de database komt van een nieuwere versie van de app. */
export function onbekendeMigraties(sqlite: Sqlite, map: string = MIGRATIE_MAP): string[] {
  const opSchijf = new Set(migratiesOpSchijf(map))
  return uitgevoerdeMigraties(sqlite).filter((n) => !opSchijf.has(n))
}

/**
 * Voert de openstaande migraties uit en geeft het aantal terug. `doel` is een pad (dan opent en sluit hij een
 * eigen verbinding) of een open verbinding (bijvoorbeeld getSqlite() in tests). Gooit een MigratieFout als een
 * migratie mislukt; die migratie is dan helemaal teruggedraaid, eerdere blijven staan.
 */
export function migreer(doel: string | Sqlite = dbPad(), opties: MigreerOpties = {}): number {
  const map = opties.map ?? MIGRATIE_MAP
  const log = opties.log ?? ((m: string) => console.log(m))
  const bestanden = migratiesOpSchijf(map)
  const eigen = typeof doel === 'string'
  const sqlite = eigen ? openSqlite(doel, { busyTimeoutMs: MIGRATIE_BUSY_MS }) : doel
  try {
    if (sqlite.inTransaction) throw new MigratieFout('Migreren kan niet binnen een open transactie.')
    sqlite
      .transaction(() => {
        sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (
          naam TEXT PRIMARY KEY,
          uitgevoerd_op TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ) STRICT`)
      })
      .immediate()
    const gedaan = new Set(uitgevoerdeMigraties(sqlite))
    const alGeregistreerd = sqlite.prepare('SELECT 1 FROM _migrations WHERE naam = ?')
    const registreer = sqlite.prepare('INSERT INTO _migrations (naam) VALUES (?)')
    let aantal = 0
    for (const naam of bestanden) {
      if (gedaan.has(naam)) continue
      const tekst = readFileSync(join(map, naam), 'utf8')
      const zonderFk = tekst.includes(ZONDER_FOREIGN_KEYS)
      if (zonderFk) sqlite.pragma('foreign_keys = OFF')
      try {
        const uitgevoerd = sqlite
          .transaction(() => {
            // Opnieuw kijken binnen de lock: een ander proces kan hem net hebben uitgevoerd.
            if (alGeregistreerd.get(naam)) return false
            sqlite.exec(tekst)
            if (zonderFk && (sqlite.pragma('foreign_key_check') as unknown[]).length > 0) {
              throw new Error('na de migratie verwijzen rijen naar rijen die niet bestaan (PRAGMA foreign_key_check)')
            }
            registreer.run(naam)
            return true
          })
          .immediate()
        if (uitgevoerd) {
          aantal++
          log(`Migratie uitgevoerd: ${naam}`)
        }
      } catch (e) {
        throw new MigratieFout(`Migratie ${naam} mislukt: ${(e as Error).message}`)
      } finally {
        if (zonderFk) sqlite.pragma('foreign_keys = ON')
      }
    }
    log(aantal === 0 ? 'Database is bijgewerkt; geen nieuwe migraties.' : `${aantal} migratie(s) uitgevoerd.`)
    return aantal
  } finally {
    if (eigen) sqlite.close()
  }
}
