/**
 * Een back-up terugzetten in het databasebestand (DATABASE_PATH), ook terwijl de app draait.
 *
 * Volgorde (herstelBackup):
 *  1. Het SQLite-bestand uit de back-up naar een tijdelijk bestand in een eigen map naast de database, en daar
 *     controleren: integrity_check, foreign_key_check, een database van ibcalculator (tabel _migrations) en geen
 *     migraties die deze versie van de app niet kent (een back-up van een nieuwere app).
 *  2. De doeldatabase bekijken zonder iets te wijzigen. Geweigerd als het geen SQLite-bestand is, als er tabellen van
 *     een andere app in staan, als hij migraties heeft die deze app niet kent, of als er al gegevens in staan en
 *     `overschrijf` niet aan staat. Een leeg, gemigreerd bestand (zoals start.sh het na de eerste deploy achterlaat)
 *     telt als leeg: deployen en daarna terugzetten kan zonder vlag.
 *  3. In de tijdelijke kopie alle sessies intrekken (elke sessiegeneratie wordt willekeurig en veel hoger), zodat de
 *     teruggezette gegevens vanaf het eerste moment geen oud token accepteren: geen token van vóór de back-up en
 *     geen token dat iemand intussen op de lege installatie heeft verkregen. De tellers van AUTOINCREMENT gaan
 *     minstens tot die van het doel, zodat een id dat daar al was uitgegeven niet opnieuw wordt gebruikt.
 *     Verschilt de paginagrootte van het doel, dan wordt de kopie daaraan aangepast (anders weigert SQLite te
 *     kopiëren naar een database in WAL-modus).
 *  4. Terugzetten met de backup-API in het bestaande bestand, als één transactie. Niet door het bestand te
 *     vervangen: de draaiende app houdt het bestand open en zou dan in het oude, verwijderde bestand doorschrijven.
 *     Andere verbindingen zien direct de nieuwe inhoud.
 *  5. Migraties van deze app uitvoeren, zodat nieuwere migraties ook over de teruggezette gegevens lopen.
 *  6. De tijdelijke map altijd verwijderen.
 *
 * De controle in stap 2 en het terugzetten in stap 4 zijn niet samen ondeelbaar: schrijft de app er precies
 * tussendoor (iemand claimt de lege installatie), dan wordt dat overschreven. Dat is de bedoeling van herstellen, en
 * de sessie die daarbij hoort is na stap 3 ongeldig.
 *
 * Meldingen noemen hooguit namen van tabellen en migraties en aantallen, nooit inhoud van rijen.
 */
import { randomInt } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import Database from 'better-sqlite3'

import { BUSY_TIMEOUT_MS, dbFoutSoort, dbPad, type Sqlite } from '@/lib/db'
import { migreer, MIGRATIE_MAP, onbekendeMigraties, uitgevoerdeMigraties } from '@/lib/db/migreer'

import { gevuldeTabellen, heeftTabel, integriteitsProbleem, kopieerDatabase, maakWerkmap, tabellen, telRijen } from './snapshot'
import type { BackupInhoud, RijTelling } from './types'
import { rijenRegels } from './weergave'

/** Fout bij herstel die je als gebruiker kunt oplossen (verkeerde doeldatabase, back-up van een nieuwere app). */
export class HerstelFout extends Error {
  constructor(bericht: string) {
    super(bericht)
    this.name = 'HerstelFout'
  }
}

export interface HerstelOpties {
  /** Het databasebestand; standaard dbPad() (DATABASE_PATH). */
  doel?: string
  /** Bestaande gegevens vervangen. Zonder deze vlag moet de database leeg zijn. */
  overschrijf?: boolean
  /** Map met migraties; standaard migrations/ van deze app. */
  migratieMap?: string
  /** Regels voor de gebruiker (CLI). Geen inhoud van rijen. */
  log?: (regel: string) => void
  /** Hoe lang het terugzetten wacht als de app net schrijft; standaard 30 seconden. */
  wachtMs?: number
}

export interface HerstelUitkomst {
  /** Rijen per tabel in de database na het terugzetten (vóór de migraties). */
  rijen: RijTelling
  /** Migraties van de back-up. */
  migratiesBackup: string[]
  /** Aantal migraties dat na het terugzetten nog is uitgevoerd. */
  latereMigraties: number
  /** Er stonden gegevens in de database die zijn vervangen. */
  vervangen: boolean
  /** Accounts in de database die niet in de back-up zaten en dus zijn verdwenen. */
  verdwenenAccounts: number
}

/** Zo hoog springt elke sessiegeneratie bij een herstel minstens; daarbovenop komt een willekeurig deel. */
const SESSIE_SPRONG = 1_000_000_000

/** Een gecontroleerde kopie van het databasebestand uit een back-up. */
export interface GeopendeBackup {
  sqlite: Sqlite
  migraties: string[]
  rijen: RijTelling
  /** Sluit de verbinding en verwijdert de tijdelijke map. Mag vaker. */
  opruimen(): void
}

/**
 * Opent het databasebestand uit de back-up en controleert het. Met een databasepad als `naast` komt de kopie in een
 * tijdelijke map naast dat bestand (nodig om terug te zetten); met null alleen in het geheugen (om te bekijken).
 * Gooit een HerstelFout als het bestand niet in orde is of van een nieuwere versie van de app komt.
 */
export function openBackupDatabase(inhoud: BackupInhoud, naast: string | null, opties: { migratieMap?: string } = {}): GeopendeBackup {
  const map = naast === null ? null : maakWerkmap(naast, 'herstel')
  let sqlite: Sqlite | null = null
  const opruimen = () => {
    if (sqlite?.open) sqlite.close()
    if (map) rmSync(map, { recursive: true, force: true })
  }
  try {
    if (map) {
      const pad = join(map, 'herstel.db')
      writeFileSync(pad, inhoud.database, { flag: 'wx', mode: 0o600 })
      sqlite = new Database(pad)
    } else {
      sqlite = new Database(inhoud.database)
    }
    // De inhoud is geauthenticeerd met DOSSIER_KEY, maar we openen hem toch zo voorzichtig mogelijk.
    sqlite.pragma('trusted_schema = OFF')
    sqlite.pragma('cell_size_check = ON')
    let probleem: string | null
    try {
      probleem = integriteitsProbleem(sqlite)
    } catch (e) {
      if (dbFoutSoort(e) === 'niet-bereikbaar') throw new HerstelFout('Het databasebestand in de back-up is beschadigd: SQLite kan het niet lezen. Er is niets gewijzigd.')
      throw e
    }
    if (probleem) throw new HerstelFout(`Het databasebestand in de back-up is niet in orde: ${probleem}. Er is niets gewijzigd.`)
    if (!heeftTabel(sqlite, '_migrations')) throw new HerstelFout('Het databasebestand in de back-up is geen database van ibcalculator (de tabel _migrations ontbreekt). Er is niets gewijzigd.')
    const onbekend = onbekendeMigraties(sqlite, opties.migratieMap ?? MIGRATIE_MAP)
    if (onbekend.length > 0) {
      throw new HerstelFout(
        `Deze back-up komt van een nieuwere versie van de app: migratie ${onbekend.join(', ')} ontbreekt hier. Er is niets gewijzigd. Werk de app bij tot minstens de versie uit de back-up (zie Versie app bij bekijk).`,
      )
    }
    if (map) sqlite.pragma('journal_mode = DELETE')
    return { sqlite, migraties: uitgevoerdeMigraties(sqlite), rijen: telRijen(sqlite), opruimen }
  } catch (e) {
    opruimen()
    throw e
  }
}

interface DoelStaat {
  bestaat: boolean
  gevuld: string[]
  emails: string[]
  paginagrootte: number | null
  /** Hoogste uitgegeven id per tabel (sqlite_sequence). */
  volgnummers: Array<{ name: string; seq: number }>
}

/** Bekijkt de doeldatabase zonder iets te wijzigen. Gooit een HerstelFout als het geen bruikbaar doel is. */
function bekijkDoel(doel: string, migratieMap: string): DoelStaat {
  if (!existsSync(doel)) return { bestaat: false, gevuld: [], emails: [], paginagrootte: null, volgnummers: [] }
  let db: Sqlite | null = null
  try {
    // Gewoon openen, niet met openSqlite: dat zet WAL aan, en we wijzigen niets voordat duidelijk is dat dit het juiste doel is.
    db = new Database(doel, { fileMustExist: true, timeout: BUSY_TIMEOUT_MS })
    const namen = tabellen(db)
    if (namen.length > 0 && !namen.includes('_migrations')) {
      const lijst = `${namen.slice(0, 8).join(', ')}${namen.length > 8 ? ', ...' : ''}`
      throw new HerstelFout(`De database op ${doel} bevat tabellen (${lijst}) maar is geen database van ibcalculator. Er is niets gewijzigd. Controleer DATABASE_PATH.`)
    }
    const onbekend = namen.length > 0 ? onbekendeMigraties(db, migratieMap) : []
    if (onbekend.length > 0) {
      throw new HerstelFout(`De database heeft migraties die deze versie van de app niet kent (${onbekend.join(', ')}). Er is niets gewijzigd. Werk de app bij.`)
    }
    const gevuld = gevuldeTabellen(db)
    const emails =
      gevuld.includes('users') && namen.includes('users')
        ? (db.prepare('SELECT email FROM users').all() as Array<{ email: string }>).map((r) => r.email.toLowerCase())
        : []
    const volgnummers = heeftTabel(db, 'sqlite_sequence') ? (db.prepare('SELECT name, seq FROM sqlite_sequence').all() as Array<{ name: string; seq: number }>) : []
    return { bestaat: true, gevuld, emails, paginagrootte: db.pragma('page_size', { simple: true }) as number, volgnummers }
  } catch (e) {
    if (e instanceof HerstelFout) throw e
    const soort = dbFoutSoort(e)
    if (soort === 'niet-bereikbaar') throw new HerstelFout(`Op ${doel} staat een bestand dat SQLite niet als database kan openen. Er is niets gewijzigd. Controleer DATABASE_PATH.`)
    if (soort === 'bezet') throw new HerstelFout('De database is bezet. Probeer het zo opnieuw. Er is niets gewijzigd.')
    throw e
  } finally {
    if (db?.open) db.close()
  }
}

/**
 * Trekt in de (tijdelijke) database alle sessies in: elke sessiegeneratie wordt willekeurig en veel hoger. Een token
 * is alleen geldig met precies de generatie van het account (lib/auth/server.ts), dus geen eerder uitgegeven token
 * past nog. Geeft het aantal accounts.
 */
export function trekSessiesIn(sqlite: Sqlite): number {
  const kolommen = sqlite.prepare(`SELECT name FROM pragma_table_info('users')`).all() as Array<{ name: string }>
  if (!kolommen.some((k) => k.name === 'sessie_generatie')) return 0
  const ids = (sqlite.prepare('SELECT id, sessie_generatie AS g FROM users').all() as Array<{ id: number; g: number }>)
  const zet = sqlite.prepare('UPDATE users SET sessie_generatie = ? WHERE id = ?')
  sqlite.transaction(() => {
    for (const { id, g } of ids) zet.run(g + SESSIE_SPRONG + randomInt(SESSIE_SPRONG), id)
  })()
  return ids.length
}

/**
 * Zet in de (tijdelijke) database de teller van AUTOINCREMENT per tabel minstens op die van het doel. Zo krijgt na het
 * herstel geen nieuwe rij een id dat in het doel al was uitgegeven: een sessietoken of versleutelde inhoud die bij
 * zo'n oud id hoort, kan dan nooit bij een nieuwe rij passen.
 */
function behoudVolgnummers(sqlite: Sqlite, volgnummers: Array<{ name: string; seq: number }>): void {
  if (volgnummers.length === 0 || !heeftTabel(sqlite, 'sqlite_sequence')) return
  const bestaand = new Set(tabellen(sqlite))
  const werkBij = sqlite.prepare('UPDATE sqlite_sequence SET seq = max(seq, ?) WHERE name = ?')
  const voegToe = sqlite.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)')
  sqlite.transaction(() => {
    for (const { name, seq } of volgnummers) {
      if (!bestaand.has(name) || !Number.isSafeInteger(seq)) continue
      if (werkBij.run(seq, name).changes === 0) voegToe.run(name, seq)
    }
  })()
}

/** Zet een ontsleutelde back-up terug in het databasebestand. Zie de uitleg bovenaan dit bestand. */
export async function herstelBackup(inhoud: BackupInhoud, opties: HerstelOpties = {}): Promise<HerstelUitkomst> {
  const doel = resolve(opties.doel ?? dbPad())
  const migratieMap = opties.migratieMap ?? MIGRATIE_MAP
  const log = opties.log ?? (() => undefined)
  mkdirSync(dirname(doel), { recursive: true })

  const bron = openBackupDatabase(inhoud, doel, { migratieMap })
  try {
    const staat = bekijkDoel(doel, migratieMap)
    if (staat.gevuld.length > 0 && !opties.overschrijf) {
      throw new HerstelFout(
        `De database bevat al gegevens (rijen in ${staat.gevuld.join(', ')}). Er is niets gewijzigd.\nWil je de huidige gegevens vervangen, herhaal het commando dan met --overschrijf.`,
      )
    }
    let verdwenen = 0
    if (staat.gevuld.length > 0) {
      const inBackup = new Set((heeftTabel(bron.sqlite, 'users') ? (bron.sqlite.prepare('SELECT email FROM users').all() as Array<{ email: string }>) : []).map((r) => r.email.toLowerCase()))
      verdwenen = staat.emails.filter((e) => !inBackup.has(e)).length
      log(`Let op: de huidige gegevens in de database (rijen in ${staat.gevuld.join(', ')}) worden vervangen.`)
      if (verdwenen > 0) log(`Let op: in de database staan ${verdwenen} account(s) die niet in de back-up zitten. Die verdwijnen.`)
    }

    trekSessiesIn(bron.sqlite)
    behoudVolgnummers(bron.sqlite, staat.volgnummers)
    if (staat.paginagrootte !== null && staat.paginagrootte !== (bron.sqlite.pragma('page_size', { simple: true }) as number)) {
      bron.sqlite.pragma(`page_size = ${staat.paginagrootte}`)
      bron.sqlite.exec('VACUUM')
    }

    try {
      await kopieerDatabase(bron.sqlite, doel, { wachtMs: opties.wachtMs })
    } catch (e) {
      if (dbFoutSoort(e) === 'bezet') throw new HerstelFout('De database bleef bezet, bijvoorbeeld door een back-up of een import in de app. Er is niets gewijzigd. Probeer het zo opnieuw.')
      throw e
    }

    // Wat er nu echt in het doel staat, niet wat we dachten te kopiëren.
    const rijen = leesTelling(doel)
    log('Teruggezet:')
    for (const regel of rijenRegels(rijen)) log(regel)
    log('Migraties van deze versie van de app uitvoeren:')
    const latereMigraties = migreer(doel, { map: migratieMap, log: (m) => log(`  ${m}`) })
    return { rijen, migratiesBackup: bron.migraties, latereMigraties, vervangen: staat.gevuld.length > 0, verdwenenAccounts: verdwenen }
  } finally {
    bron.opruimen()
  }
}

function leesTelling(pad: string): RijTelling {
  const db = new Database(pad, { fileMustExist: true, timeout: BUSY_TIMEOUT_MS })
  try {
    return telRijen(db)
  } finally {
    db.close()
  }
}
