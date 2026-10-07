/**
 * Databaselaag: één SQLite-bestand (DATABASE_PATH, zie pad.ts) via better-sqlite3 en Drizzle. Geen aparte
 * databaseserver; in productie staat het bestand in de Persistent Directory /app/data.
 *
 * - Lui: de verbinding opent pas bij de eerste getDb() of getSqlite(). `next build` en pagina's zonder dossier
 *   openen dus niets.
 * - Eén verbinding per proces, bewaard op globalThis zodat hot reload in `next dev` geen tweede opent. Verandert
 *   DATABASE_PATH (alleen in tests), dan sluit de oude verbinding en opent de nieuwe.
 * - Bij openen: busy_timeout (wachten op een ander proces in plaats van meteen falen), journal_mode WAL (lezers
 *   wachten niet op een schrijver), synchronous NORMAL, foreign_keys aan (zonder dat doet SQLite niets met
 *   REFERENCES en ON DELETE CASCADE) en secure_delete aan (verwijderde rijen worden in het databasebestand
 *   overschreven). De oude pagina's staan daarna nog in -wal, ook na een gewone checkpoint, zolang de verbinding
 *   open is; daarom doet 'Alles verwijderen' meteen leegWal() (wal_checkpoint(TRUNCATE)).
 * - better-sqlite3 is synchroon. `await db.select()...` werkt gewoon (de query draait direct), maar binnen
 *   schrijf() en lees() gebruik je de synchrone vormen: .all(), .get(), .run() en .values().
 *
 * Gelijktijdigheid: Node draait JavaScript op één thread en elke query is synchroon, dus binnen het proces
 * kan niets tussen twee statements van een synchrone functie komen. schrijf() maakt daar een transactie met
 * BEGIN IMMEDIATE van: de schrijflock wordt bij de start genomen, zodat ook een ander proces (npm run db:migrate,
 * de back-up-CLI, een tweede container tijdens een deploy) er niet tussen kan. Dat vervangt de advisory locks en
 * SELECT ... FOR UPDATE van Postgres. Instance count blijft 1.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { databasemapSchrijfbaar, dbPad } from './pad'
import * as schema from './schema'

export { DB_BESTANDSNAAM, databasemapSchrijfbaar, dbPad } from './pad'
export { schema }

export type Db = BetterSQLite3Database<typeof schema>
/** De transactie die schrijf() en lees() aan hun functie geven; dezelfde query-API als Db, synchroon. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type Sqlite = Database.Database

/** Hoe lang een verbinding wacht op een lock van een ander proces voordat SQLITE_BUSY volgt. */
export const BUSY_TIMEOUT_MS = 5_000

interface Cache {
  pad: string
  sqlite: Sqlite
  db: Db
  /** Diepte van lees(); schrijf() daarbinnen is een fout. */
  leesDiepte: number
}

const g = globalThis as unknown as { __ibDb?: Cache }

/**
 * Opent een losse verbinding met dezelfde instellingen als de app: busy_timeout, WAL, synchronous NORMAL,
 * foreign_keys en secure_delete. Maakt de map aan als die er niet is. Voor scripts (migreren, herstel); de app zelf gebruikt
 * getSqlite(). Sluit hem zelf met .close().
 */
export function openSqlite(pad: string, opties: { busyTimeoutMs?: number } = {}): Sqlite {
  mkdirSync(dirname(pad), { recursive: true })
  const sqlite = new Database(pad)
  try {
    const wachttijd = Math.max(0, Math.floor(opties.busyTimeoutMs ?? BUSY_TIMEOUT_MS))
    sqlite.pragma(`busy_timeout = ${wachttijd}`)
    zetWal(sqlite, wachttijd)
    sqlite.pragma('synchronous = NORMAL')
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('secure_delete = ON')
  } catch (e) {
    sqlite.close()
    throw e
  }
  return sqlite
}

/** Blokkeert de thread kort; alleen voor het zeldzame wachten bij het openen hieronder. */
function slaap(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Zet WAL aan. Op een nieuw bestand dat twee processen tegelijk openen (twee starts van migrate) geeft SQLite
 * hier soms meteen SQLITE_BUSY, zonder busy_timeout te gebruiken. Dan opnieuw proberen tot de wachttijd op is.
 * Staat het bestand al op WAL, dan verandert er niets en lukt het de eerste keer.
 */
function zetWal(sqlite: Sqlite, wachttijd: number): void {
  const einde = Date.now() + wachttijd
  for (let pauze = 5; ; pauze = Math.min(pauze * 2, 100)) {
    try {
      sqlite.pragma('journal_mode = WAL')
      return
    } catch (e) {
      if (!String((e as { code?: unknown }).code).startsWith('SQLITE_BUSY') || Date.now() >= einde) throw e
      slaap(pauze)
    }
  }
}

function verbinding(): Cache {
  const pad = dbPad()
  const huidig = g.__ibDb
  if (huidig && huidig.pad === pad && huidig.sqlite.open) return huidig
  if (huidig) sluitDb()
  const sqlite = openSqlite(pad)
  const nieuw: Cache = { pad, sqlite, db: drizzle(sqlite, { schema }), leesDiepte: 0 }
  g.__ibDb = nieuw
  return nieuw
}

/** De plek van de database is bruikbaar (bestand of map schrijfbaar). Opent niets. */
export function dbGeconfigureerd(): boolean {
  return databasemapSchrijfbaar(dbPad())
}

/** Drizzle op de verbinding van dit proces; opent die bij de eerste aanroep. */
export function getDb(): Db {
  return verbinding().db
}

/** De ruwe better-sqlite3-verbinding, voor SQL die Drizzle niet uitdrukt (PRAGMA, backup(), exec van een script). */
export function getSqlite(): Sqlite {
  return verbinding().sqlite
}

/** Sluit de verbinding van dit proces, als die open is. De volgende getDb() opent opnieuw. */
export function sluitDb(): void {
  const huidig = g.__ibDb
  delete g.__ibDb
  if (huidig?.sqlite.open) huidig.sqlite.close()
}

/** Typefout als de functie een Promise teruggeeft (een async functie). */
type NietAsync<T> = T extends PromiseLike<unknown> ? { 'schrijf() en lees() verwachten een synchrone functie, zonder async/await': never } : unknown

function synchroon<T>(uitkomst: T, naam: string): T {
  if (uitkomst !== null && typeof uitkomst === 'object' && typeof (uitkomst as { then?: unknown }).then === 'function') {
    // Geen onafgehandelde afwijzing achterlaten; de fout hieronder rolt de transactie terug.
    ;(uitkomst as unknown as PromiseLike<unknown>).then(undefined, () => undefined)
    throw new TypeError(
      `${naam}() kreeg een async functie. Alles na de eerste await draait buiten de transactie. Doe async werk (hashen, fetch) vóór of na ${naam}() en geef een synchrone functie mee.`,
    )
  }
  return uitkomst
}

/**
 * Draait `fn` in een schrijftransactie (BEGIN IMMEDIATE) en geeft de uitkomst terug. Een fout in `fn` rolt alles
 * terug en wordt opnieuw gegooid. Een schrijf() binnen een schrijf() wordt een savepoint.
 *
 * `fn` moet synchroon zijn: gebruik tx.select()....all() / .get() en tx.insert()....run() / .returning().all(),
 * geen await. Async werk (een wachtwoord hashen, Moneybird aanroepen) gebeurt vooraf of achteraf:
 *
 *   const hash = await hashWachtwoord(wachtwoord)          // async, buiten de transactie
 *   const id = schrijf((tx) => {                            // synchroon, alles of niets
 *     const bestaand = tx.select().from(users).all()
 *     if (bestaand.length > 0) return null
 *     return tx.insert(users).values({ email, passwordHash: hash }).returning({ id: users.id }).get()!.id
 *   })
 *
 * Een async functie geeft een typefout en, mocht die er toch doorkomen, een TypeError met rollback.
 */
export function schrijf<T>(fn: (tx: Tx) => T & NietAsync<T>): T {
  const c = verbinding()
  if (c.leesDiepte > 0) throw new Error('schrijf() binnen lees() kan niet: een leestransactie kan niet veilig een schrijflock krijgen. Gebruik alleen schrijf().')
  return c.db.transaction((tx) => synchroon(fn(tx), 'schrijf'), { behavior: 'immediate' })
}

/**
 * Draait `fn` in een leestransactie (BEGIN DEFERRED): alle statements zien hetzelfde moment, ook als een ander
 * proces tussendoor schrijft. Alleen nodig voor meerdere samenhangende leesqueries (export, overzicht); één losse
 * query heeft het niet nodig. Geen schrijf() binnen lees(). Synchroon, net als schrijf().
 */
export function lees<T>(fn: (tx: Tx) => T & NietAsync<T>): T {
  const c = verbinding()
  c.leesDiepte++
  try {
    return c.db.transaction((tx) => synchroon(fn(tx), 'lees'), { behavior: 'deferred' })
  } finally {
    c.leesDiepte--
  }
}

/**
 * Eén poging om de WAL leeg te maken: alles uit -wal gaat naar het databasebestand en -wal wordt 0 bytes (PRAGMA
 * wal_checkpoint(TRUNCATE)). Wacht niet: busy_timeout staat tijdens de poging op 0, zodat de thread niet blijft hangen
 * op een ander proces. Geeft false als een ander proces nog uit de WAL leest of erin schrijft (SQLite meldt dan busy
 * in de uitkomst of gooit SQLITE_BUSY); andere fouten gooit hij door.
 */
export function probeerLeegWal(): boolean {
  const sqlite = getSqlite()
  const wachttijd = Number(sqlite.pragma('busy_timeout', { simple: true })) || 0
  sqlite.pragma('busy_timeout = 0')
  try {
    const [uitkomst] = sqlite.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number }>
    return uitkomst?.busy === 0
  } catch (e) {
    if (dbFoutSoort(e) === 'bezet') return false
    throw e
  } finally {
    sqlite.pragma(`busy_timeout = ${wachttijd}`)
  }
}

/**
 * Maakt de WAL leeg (zie probeerLeegWal) en probeert het opnieuw zolang een ander proces (de back-up-CLI, een tweede
 * container tijdens een deploy) de WAL nog gebruikt: na `pauzeMs`, daarna steeds twee keer zo lang, tot `pogingen` op
 * zijn. Met de standaardwaarden duurt dat hooguit ruim 3 seconden, zonder de thread te blokkeren. Geeft true als -wal
 * leeg is, false als het niet lukte; dan staan de oude pagina's nog in -wal tot een volgende geslaagde poging.
 */
export async function leegWal(opties: { pogingen?: number; pauzeMs?: number } = {}): Promise<boolean> {
  const pogingen = Math.max(1, Math.floor(opties.pogingen ?? 6))
  let pauze = Math.max(0, opties.pauzeMs ?? 100)
  for (let poging = 1; ; poging++) {
    if (probeerLeegWal()) return true
    if (poging >= pogingen) return false
    await new Promise((klaar) => setTimeout(klaar, pauze))
    pauze = Math.min(pauze * 2, 2_000)
  }
}

export type DbFoutSoort =
  /** Tabel of kolom bestaat niet: migraties niet gedraaid. */
  | 'schema-ontbreekt'
  /** Een ander proces houdt de lock langer vast dan busy_timeout. */
  | 'bezet'
  /** Bestand of map niet te openen, alleen-lezen, vol of geen SQLite-bestand. */
  | 'niet-bereikbaar'
  /** UNIQUE of PRIMARY KEY geschonden. */
  | 'uniek'
  /** Andere constraint geschonden (NOT NULL, CHECK, FOREIGN KEY). */
  | 'constraint'

const NIET_BEREIKBAAR_FS = new Set(['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'ENOTDIR', 'EISDIR'])

/**
 * Soort databasefout, of null als het geen (herkende) databasefout is. Kijkt ook in `cause`, want Drizzle verpakt
 * fouten van de driver. Voor de foutmeldingen van routes en pagina's; de melding zelf bevat nooit rij-inhoud.
 */
export function dbFoutSoort(e: unknown): DbFoutSoort | null {
  let f: unknown = e
  for (let i = 0; f && typeof f === 'object' && i < 5; i++, f = (f as { cause?: unknown }).cause) {
    const code = (f as { code?: unknown }).code
    if (typeof code !== 'string') continue
    if (NIET_BEREIKBAAR_FS.has(code)) return 'niet-bereikbaar'
    if (!code.startsWith('SQLITE_')) continue
    const bericht = String((f as { message?: unknown }).message ?? '')
    if (code === 'SQLITE_ERROR' && /no such (table|column)|has no column named/.test(bericht)) return 'schema-ontbreekt'
    if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) return 'bezet'
    if (/^SQLITE_(CANTOPEN|READONLY|IOERR|FULL|PERM|NOTADB|CORRUPT|AUTH)/.test(code)) return 'niet-bereikbaar'
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return 'uniek'
    if (code.startsWith('SQLITE_CONSTRAINT')) return 'constraint'
    return null
  }
  return null
}
