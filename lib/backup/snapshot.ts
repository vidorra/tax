/**
 * Consistente kopie van het SQLite-bestand voor een back-up, plus de hulpfuncties die het herstel ook gebruikt.
 *
 * maakSnapshot kopieert de database met de backup-API van SQLite (via better-sqlite3) naar een tijdelijk
 * bestand: in één stap en binnen één leestransactie, dus één consistent moment, ook als een ander proces
 * tegelijk schrijft (in WAL-modus wacht niemand op de kopie). Daarna, alleen in de kopie:
 *  - de tabel backups leeg (de administratie van back-ups gaat nooit mee);
 *  - journal_mode DELETE en VACUUM: een zelfstandig, compact bestand zonder -wal, waarin ook verwijderde
 *    rijen niet meer terug te vinden zijn;
 *  - integrity_check en foreign_key_check: een back-up die je niet kunt terugzetten, maken we niet;
 *  - migraties en aantallen rijen per tabel uitlezen voor de kop van de back-up.
 *
 * Het tijdelijke bestand staat in een eigen map (mkdtemp, alleen voor de eigenaar) naast het databasebestand,
 * dus op hetzelfde volume en met dezelfde bescherming als de database zelf. Die map gaat altijd weg, ook bij
 * een fout; blijft er na een crash toch een achter, dan ruimt de volgende back-up of het volgende herstel hem op.
 *
 * Valkuil van better-sqlite3: is het doel van backup() bij de eerste stap bezet (een ander proces schrijft),
 * dan eindigt backup() zonder fout én zonder iets te kopiëren, met totalPages 0. kopieerDatabase herkent dat
 * en probeert opnieuw tot de wachttijd op is.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

import Database from 'better-sqlite3'

import type { Sqlite } from '@/lib/db'
import { uitgevoerdeMigraties } from '@/lib/db/migreer'

import { BACKUP_FORMAAT, BACKUP_VERSIE, UITGESLOTEN_TABELLEN, type BackupInhoud, type RijTelling } from './types'

/** Fout bij het maken van een snapshot die je als beheerder kunt oplossen; de melding is voor mensen bedoeld. */
export class SnapshotFout extends Error {
  constructor(bericht: string) {
    super(bericht)
    this.name = 'SnapshotFout'
  }
}

/** Voorvoegsel van de tijdelijke mappen naast het databasebestand. */
export const WERKMAP_PREFIX = '.ib-backup-'

/** Een achtergebleven werkmap ouder dan dit is van een afgebroken back-up of herstel en mag weg. */
export const WERKMAP_VERLOPEN_MS = 60 * 60_000

/** Hoe lang kopieerDatabase standaard wacht als de database bezet is. */
export const KOPIEER_WACHT_MS = 30_000

/** Zoveel pagina's per stap van de backup-API: alles in één keer, dus één leestransactie op de bron. */
const ALLE_PAGINAS = 0x7fffffff

export function quoteIdent(naam: string): string {
  if (naam.length === 0 || naam.includes('\u0000')) throw new Error('Ongeldige naam voor een tabel of kolom.')
  return `"${naam.replace(/"/g, '""')}"`
}

/**
 * Maakt een nieuwe werkmap naast het databasebestand (voor ':memory:' of een relatieve naam in de tmp-map van het
 * systeem) en ruimt verlopen werkmappen op. De map is alleen voor de eigenaar leesbaar (mkdtemp, 0700).
 */
export function maakWerkmap(dbBestand: string, soort: 'snapshot' | 'herstel', nu: number = Date.now()): string {
  const ouder = isAbsolute(dbBestand) ? dirname(dbBestand) : tmpdir()
  mkdirSync(ouder, { recursive: true })
  ruimVerlopenWerkmappenOp(ouder, nu)
  return mkdtempSync(join(ouder, `${WERKMAP_PREFIX}${soort}-`))
}

/** Verwijdert werkmappen (WERKMAP_PREFIX) die ouder zijn dan WERKMAP_VERLOPEN_MS. Geeft het aantal. Gooit niet. */
export function ruimVerlopenWerkmappenOp(map: string, nu: number = Date.now()): number {
  let aantal = 0
  try {
    for (const naam of readdirSync(map)) {
      if (!naam.startsWith(WERKMAP_PREFIX)) continue
      const pad = join(map, naam)
      try {
        const s = statSync(pad)
        if (!s.isDirectory() || nu - s.mtimeMs < WERKMAP_VERLOPEN_MS) continue
        rmSync(pad, { recursive: true, force: true })
        aantal++
      } catch {
        // Een andere back-up kan hem net zelf opruimen.
      }
    }
  } catch {
    // Map niet te lezen: niets op te ruimen.
  }
  return aantal
}

function slaapAsync(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Kopieert de hele database van `bron` naar het bestand `doel` met de backup-API, als één transactie op het doel.
 * Bestaat `doel` al, dan wordt de inhoud vervangen in het bestaande bestand (andere verbindingen zien de nieuwe
 * inhoud; een doel in WAL-modus blijft in WAL-modus). Is het doel bezet, dan probeert hij opnieuw tot `wachtMs`
 * voorbij is en gooit dan een fout met code SQLITE_BUSY; het doel is dan niet gewijzigd.
 */
export async function kopieerDatabase(bron: Sqlite, doel: string, opties: { wachtMs?: number } = {}): Promise<void> {
  const einde = Date.now() + (opties.wachtMs ?? KOPIEER_WACHT_MS)
  const bezet = () => Object.assign(new Error('De database bleef bezet door een ander proces.'), { code: 'SQLITE_BUSY' })
  for (let pauze = 10; ; pauze = Math.min(pauze * 2, 250)) {
    const r = await bron.backup(doel, {
      progress: () => {
        // Alleen bij een volgende stap: die komt er pas als een stap bezet was. Dan niet eindeloos herhalen.
        if (Date.now() > einde) throw bezet()
        return ALLE_PAGINAS
      },
    })
    // Een database heeft altijd minstens één pagina; 0 betekent dat de eerste stap bezet was en er niets is gekopieerd.
    if (r.totalPages > 0) return
    if (Date.now() >= einde) throw bezet()
    await slaapAsync(pauze)
  }
}

export function heeftTabel(sqlite: Sqlite, naam: string): boolean {
  return Boolean(sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(naam))
}

/** Tabellen in de volgorde waarin ze zijn aangemaakt, zonder de interne tabellen van SQLite (sqlite_sequence). */
export function tabellen(sqlite: Sqlite): string[] {
  const rijen = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY rowid`).all() as Array<{ name: string }>
  return rijen.map((r) => r.name)
}

/** Rijen per tabel, zonder backups en _migrations. */
export function telRijen(sqlite: Sqlite): RijTelling {
  const uitgesloten = new Set<string>(UITGESLOTEN_TABELLEN)
  const telling: RijTelling = {}
  for (const naam of tabellen(sqlite)) {
    if (uitgesloten.has(naam)) continue
    telling[naam] = (sqlite.prepare(`SELECT count(*) AS n FROM ${quoteIdent(naam)}`).get() as { n: number }).n
  }
  return telling
}

/** Tabellen met minstens één rij, zonder backups en _migrations. */
export function gevuldeTabellen(sqlite: Sqlite): string[] {
  const uitgesloten = new Set<string>(UITGESLOTEN_TABELLEN)
  return tabellen(sqlite).filter((naam) => !uitgesloten.has(naam) && sqlite.prepare(`SELECT 1 FROM ${quoteIdent(naam)} LIMIT 1`).get() !== undefined)
}

/**
 * Wat er mis is met de database volgens integrity_check en foreign_key_check, in gewone taal zonder inhoud van
 * rijen; null als alles klopt.
 */
export function integriteitsProbleem(sqlite: Sqlite): string | null {
  const integriteit = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (integriteit.length !== 1 || integriteit[0].integrity_check !== 'ok') {
    return `de integriteitscontrole van SQLite vond ${integriteit.length} probleem${integriteit.length === 1 ? '' : 'en'}`
  }
  const verwijzingen = sqlite.pragma('foreign_key_check') as Array<{ table: string }>
  if (verwijzingen.length > 0) {
    const namen = [...new Set(verwijzingen.map((v) => v.table))].sort().join(', ')
    return `${verwijzingen.length} rij(en) in ${namen} verwijzen naar rijen die niet bestaan`
  }
  return null
}

/**
 * Maakt een consistente, gecontroleerde kopie van de database van `bron` (meestal getSqlite()) en geeft die met
 * metadata terug, klaar om te versleutelen. Gooit een SnapshotFout als de database nog geen tabellen heeft of
 * niet in orde is.
 */
export async function maakSnapshot(bron: Sqlite, opties: { gitSha?: string | null; nu?: Date; wachtMs?: number } = {}): Promise<BackupInhoud> {
  const gemaaktOp = (opties.nu ?? new Date()).toISOString()
  const map = maakWerkmap(bron.name, 'snapshot')
  const pad = join(map, 'snapshot.db')
  try {
    try {
      await kopieerDatabase(bron, pad, { wachtMs: opties.wachtMs })
    } catch (e) {
      if ((e as { code?: unknown }).code === 'SQLITE_BUSY') throw new SnapshotFout('De database bleef te lang bezet om een kopie te maken. De volgende poging volgt vanzelf.')
      throw e
    }
    const kopie = new Database(pad)
    try {
      if (!heeftTabel(kopie, '_migrations')) {
        throw new SnapshotFout('De database heeft nog geen tabellen, dus er is niets om te bewaren. Voer eerst npm run db:migrate uit.')
      }
      kopie.pragma('secure_delete = ON')
      if (heeftTabel(kopie, 'backups')) {
        kopie.exec('DELETE FROM backups')
        if (heeftTabel(kopie, 'sqlite_sequence')) kopie.prepare(`DELETE FROM sqlite_sequence WHERE name = 'backups'`).run()
      }
      kopie.pragma('journal_mode = DELETE')
      kopie.exec('VACUUM')
      const probleem = integriteitsProbleem(kopie)
      if (probleem) throw new SnapshotFout(`De database is niet in orde: ${probleem}. Er is geen back-up gemaakt; zet zo nodig de vorige back-up terug.`)
      const migraties = uitgevoerdeMigraties(kopie)
      const rijen = telRijen(kopie)
      kopie.close()
      return {
        formaat: BACKUP_FORMAAT,
        versie: BACKUP_VERSIE,
        gemaaktOp,
        gitSha: opties.gitSha ?? null,
        migraties,
        rijen,
        database: readFileSync(pad),
      }
    } finally {
      if (kopie.open) kopie.close()
    }
  } finally {
    rmSync(map, { recursive: true, force: true })
  }
}
