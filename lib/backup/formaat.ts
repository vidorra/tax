/**
 * Bestandsformaat van een back-up: gzip + AES-256-GCM om de metadata en het SQLite-bestand.
 *
 * Indeling (binair, alles achter elkaar):
 *   magic 'IBCBAK' (6) | versie (1) | sleutelId (8) | salt (16) | iv (12) | tag (16) | ciphertext
 *
 * - De eerste 15 bytes (magic, versie, sleutelId) blijven in elke versie gelijk, zodat je altijd kunt zien
 *   welke versie en welke sleutel een bestand heeft (leesKop).
 * - Sleutel: HKDF-SHA256(ikm = de 32 bytes van DOSSIER_KEY, salt, info = 'ibcalculator back-up v1', 32).
 *   Elke back-up krijgt een eigen salt en iv, dus ook een eigen sleutel. (De info-tekst is sinds versie 1
 *   gelijk; de versie zelf zit in de AAD.)
 * - sleutelId: eerste 8 bytes van HMAC-SHA256(DOSSIER_KEY-bytes, 'ibcalculator back-up sleutel-id').
 *   Een vingerafdruk van de sleutel, geen geheim: zo herken je een bestand van een andere DOSSIER_KEY.
 * - AAD van GCM: alle bytes vóór de tag (magic t/m iv). Elke gewijzigde byte valt dus op.
 * - Plaintext (versie 2): gzip( metaLengte (4, big-endian) | meta (JSON, UTF-8) | SQLite-bestand ).
 *   De meta (BackupMeta) is klein, zodat `bekijk` datum, versie, migraties en aantallen toont zonder de
 *   database te openen.
 * - Versie 1 (een JSON-dump van Postgres) heeft nooit in productie gestaan en wordt geweigerd met code 'versie'.
 *
 * Puur: geen I/O en geen Date.now(). De sleutel komt van de aanroeper (dossierSleutel() uit lib/crypto.ts).
 * Foutmeldingen bevatten nooit inhoud van rijen: fouten van JSON.parse en zlib gaan niet als cause mee,
 * omdat die een stuk van de tekst kunnen bevatten.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { constants as zlibConstants, gunzipSync, gzipSync } from 'node:zlib'
import { amsterdamDelen } from './planning'
import { BACKUP_EXTENSIE, BACKUP_FORMAAT, BACKUP_VERSIE, type BackupInhoud, type BackupMeta, type BackupSoort } from './types'

const MAGIC = Buffer.from('IBCBAK', 'ascii')
const VERSIE_BYTES = 1
const SLEUTEL_ID_BYTES = 8
const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16
const SLEUTEL_BYTES = 32
const META_LENGTE_BYTES = 4

/** Vaste kop van elke versie: magic, versie en sleutelId. */
const VASTE_KOP_BYTES = MAGIC.length + VERSIE_BYTES + SLEUTEL_ID_BYTES
/** Kop tot en met de iv; dit is ook de AAD. */
const KOP_BYTES = VASTE_KOP_BYTES + SALT_BYTES + IV_BYTES
/** Kleinste bestand: kop plus tag. */
const MIN_BYTES = KOP_BYTES + TAG_BYTES

const HKDF_INFO = 'ibcalculator back-up v1'
const SLEUTEL_ID_INFO = 'ibcalculator back-up sleutel-id'

/** Standaardgrens voor de uitgepakte grootte (bescherming tegen een zip-bom); ook de grootste back-up die we maken. */
export const STANDAARD_MAX_BYTES = 512 * 1024 * 1024

/** Grootste meta-kop. Een echte kop is een paar honderd bytes. */
export const MAX_META_BYTES = 64 * 1024

/** Begin van elk SQLite-bestand. */
const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000', 'latin1')

export type BackupFoutCode = 'formaat' | 'versie' | 'andere-sleutel' | 'beschadigd' | 'inhoud'

export class BackupFout extends Error {
  readonly code: BackupFoutCode

  constructor(code: BackupFoutCode, melding: string) {
    super(melding)
    this.name = 'BackupFout'
    this.code = code
  }
}

function controleerSleutel(sleutel: Buffer): void {
  if (!Buffer.isBuffer(sleutel) || sleutel.length !== SLEUTEL_BYTES) {
    throw new RangeError(`De sleutel voor de back-up moet ${SLEUTEL_BYTES} bytes zijn (DOSSIER_KEY).`)
  }
}

function sleutelIdBytes(sleutel: Buffer): Buffer {
  return createHmac('sha256', sleutel).update(SLEUTEL_ID_INFO, 'utf8').digest().subarray(0, SLEUTEL_ID_BYTES)
}

function leidSleutelAf(sleutel: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', sleutel, salt, Buffer.from(HKDF_INFO, 'utf8'), SLEUTEL_BYTES))
}

/** Vingerafdruk van de sleutel als hex (16 tekens). Veilig om te tonen. */
export function sleutelId(sleutel: Buffer): string {
  controleerSleutel(sleutel)
  return sleutelIdBytes(sleutel).toString('hex')
}

export function sha256Hex(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex')
}

const TE_KORT = 'Het bestand is te kort voor een back-up van ibcalculator. Mogelijk is het niet volledig gedownload of opgeslagen.'

/** Leest versie en sleutelId uit de kop, zonder te ontsleutelen. Controleert de versie niet. */
export function leesKop(bestand: Buffer): { versie: number; sleutelId: string } {
  if (!Buffer.isBuffer(bestand)) throw new BackupFout('formaat', 'Dit is geen bestand.')
  const n = Math.min(bestand.length, MAGIC.length)
  if (!bestand.subarray(0, n).equals(MAGIC.subarray(0, n))) throw new BackupFout('formaat', 'Dit bestand is geen back-up van ibcalculator.')
  if (bestand.length < VASTE_KOP_BYTES) throw new BackupFout('formaat', TE_KORT)
  const versie = bestand[MAGIC.length]
  if (versie === BACKUP_VERSIE && bestand.length < MIN_BYTES) throw new BackupFout('formaat', TE_KORT)
  return { versie, sleutelId: bestand.subarray(MAGIC.length + VERSIE_BYTES, VASTE_KOP_BYTES).toString('hex') }
}

/** Versleutelt de inhoud tot een .ibcbak-bestand. Elke aanroep geeft een ander bestand (nieuwe salt en iv). */
export function versleutelBackup(inhoud: BackupInhoud, sleutel: Buffer): Buffer {
  controleerSleutel(sleutel)
  controleerMeta(inhoud)
  controleerDatabase(inhoud.database)
  const { database, ...rest } = inhoud
  const meta: BackupMeta = {
    formaat: rest.formaat,
    versie: rest.versie,
    gemaaktOp: rest.gemaaktOp,
    gitSha: rest.gitSha,
    migraties: rest.migraties,
    rijen: rest.rijen,
  }
  const metaBytes = Buffer.from(JSON.stringify(meta), 'utf8')
  if (metaBytes.length > MAX_META_BYTES) throw inhoudFout('de kop met metadata is te groot')
  if (META_LENGTE_BYTES + metaBytes.length + database.length > STANDAARD_MAX_BYTES) {
    throw new BackupFout('inhoud', `De database is groter dan ${grootte(STANDAARD_MAX_BYTES)}; zo'n back-up zou niet meer terug te zetten zijn.`)
  }
  const lengte = Buffer.alloc(META_LENGTE_BYTES)
  lengte.writeUInt32BE(metaBytes.length)

  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const kop = Buffer.concat([MAGIC, Buffer.from([BACKUP_VERSIE]), sleutelIdBytes(sleutel), salt, iv])
  const plaintext = gzipSync(Buffer.concat([lengte, metaBytes, database]), { level: zlibConstants.Z_BEST_COMPRESSION })
  const cipher = createCipheriv('aes-256-gcm', leidSleutelAf(sleutel, salt), iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(kop)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([kop, cipher.getAuthTag(), ciphertext])
}

function versieMelding(versie: number): string {
  if (versie === 1) {
    return 'Deze back-up heeft formaatversie 1. Die komt van de oude versie van ibcalculator met een Postgres-database; deze versie werkt met een SQLite-bestand en kan dat formaat niet terugzetten.'
  }
  return `Deze back-up heeft formaatversie ${versie}, en deze versie van ibcalculator kan alleen versie ${BACKUP_VERSIE} lezen. Werk de app bij en probeer het opnieuw.`
}

/**
 * Ontsleutelt en controleert een .ibcbak-bestand. Gooit een BackupFout met code:
 *  - 'formaat'         geen back-up van ibcalculator, of te kort;
 *  - 'versie'          een andere formaatversie (ook versie 1, de oude Postgres-dump);
 *  - 'andere-sleutel'  gemaakt met een andere DOSSIER_KEY;
 *  - 'beschadigd'      de GCM-controle faalt (gewijzigd of afgekapt);
 *  - 'inhoud'          uitgepakt te groot, geen gzip, kop of metadata klopt niet, of geen SQLite-bestand.
 */
export function ontsleutelBackup(bestand: Buffer, sleutel: Buffer, opties: { maxBytes?: number } = {}): BackupInhoud {
  controleerSleutel(sleutel)
  const maxBytes = opties.maxBytes ?? STANDAARD_MAX_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes moet een positief geheel getal zijn.')

  const kop = leesKop(bestand)
  if (kop.versie !== BACKUP_VERSIE) throw new BackupFout('versie', versieMelding(kop.versie))
  if (kop.sleutelId !== sleutelIdBytes(sleutel).toString('hex')) {
    throw new BackupFout('andere-sleutel', `Dit bestand is gemaakt met een andere DOSSIER_KEY (sleutel-id ${kop.sleutelId}). Je kunt het alleen herstellen met de sleutel waarmee de back-up is gemaakt.`)
  }

  let o = VASTE_KOP_BYTES
  const salt = bestand.subarray(o, (o += SALT_BYTES))
  const iv = bestand.subarray(o, (o += IV_BYTES))
  const aad = bestand.subarray(0, o)
  const tag = bestand.subarray(o, (o += TAG_BYTES))
  const ciphertext = bestand.subarray(o)

  let plaintext: Buffer
  try {
    const decipher = createDecipheriv('aes-256-gcm', leidSleutelAf(sleutel, salt), iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(aad)
    decipher.setAuthTag(tag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new BackupFout('beschadigd', 'De back-up is beschadigd of aangepast: de controle van de versleuteling klopt niet. Gebruik een andere kopie, bijvoorbeeld de bijlage uit de oorspronkelijke mail.')
  }

  let uitgepakt: Buffer
  try {
    uitgepakt = gunzipSync(plaintext, { maxOutputLength: maxBytes })
  } catch (e) {
    if ((e as { code?: unknown })?.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new BackupFout('inhoud', `Uitgepakt wordt deze back-up groter dan de grens van ${grootte(maxBytes)}. Daarom wordt hij niet geopend.`)
    }
    throw new BackupFout('inhoud', 'De inhoud van de back-up is geen geldig gzip-bestand.')
  }

  if (uitgepakt.length < META_LENGTE_BYTES) throw inhoudFout('de kop met metadata ontbreekt')
  const metaLengte = uitgepakt.readUInt32BE(0)
  if (metaLengte > MAX_META_BYTES || META_LENGTE_BYTES + metaLengte > uitgepakt.length) throw inhoudFout('de lengte van de kop met metadata is ongeldig')
  let meta: unknown
  try {
    meta = JSON.parse(uitgepakt.subarray(META_LENGTE_BYTES, META_LENGTE_BYTES + metaLengte).toString('utf8'))
  } catch {
    throw new BackupFout('inhoud', 'De kop met metadata van de back-up is geen geldige JSON.')
  }
  controleerMeta(meta)
  const database = uitgepakt.subarray(META_LENGTE_BYTES + metaLengte)
  controleerDatabase(database)
  return {
    formaat: meta.formaat,
    versie: meta.versie,
    gemaaktOp: meta.gemaaktOp,
    gitSha: meta.gitSha,
    migraties: meta.migraties,
    rijen: meta.rijen,
    database,
  }
}

/** 'ibcalculator-backup-2027-02-01.ibcbak' (gepland) of 'ibcalculator-backup-2026-10-04-1532.ibcbak' (handmatig), in Amsterdamse tijd. */
export function bestandsnaam(gemaaktOp: Date, soort: BackupSoort): string {
  const { jaar, maand, dag, uur, minuut } = amsterdamDelen(gemaaktOp)
  const datum = `${jaar}-${maand}-${dag}`
  return soort === 'handmatig' ? `ibcalculator-backup-${datum}-${uur}${minuut}${BACKUP_EXTENSIE}` : `ibcalculator-backup-${datum}${BACKUP_EXTENSIE}`
}

function grootte(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kB`
  return `${bytes} bytes`
}

const ISO_TIJDSTIP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/

function isIsoTijdstip(waarde: unknown): boolean {
  if (typeof waarde !== 'string') return false
  const m = ISO_TIJDSTIP.exec(waarde)
  if (!m) return false
  const [j, mnd, d, u, min, s] = m.slice(1, 7).map(Number)
  if (mnd < 1 || mnd > 12 || d < 1 || u > 23 || min > 59 || s > 59) return false
  if (d > new Date(Date.UTC(j, mnd, 0)).getUTCDate()) return false
  return !Number.isNaN(Date.parse(waarde))
}

function isObject(waarde: unknown): waarde is Record<string, unknown> {
  return typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde)
}

function isTekstLijst(waarde: unknown): waarde is string[] {
  return Array.isArray(waarde) && waarde.every((x) => typeof x === 'string')
}

function inhoudFout(reden: string): BackupFout {
  return new BackupFout('inhoud', `De inhoud van de back-up klopt niet: ${reden}.`)
}

/** Controleert de vorm van BackupMeta. Meldingen noemen hooguit een tabelnaam, nooit inhoud van rijen. */
function controleerMeta(meta: unknown): asserts meta is BackupMeta {
  if (!isObject(meta)) throw inhoudFout('de metadata is geen object')
  if (meta.formaat !== BACKUP_FORMAAT) throw inhoudFout('het formaat is niet ibcalculator-backup')
  if (meta.versie !== BACKUP_VERSIE) throw inhoudFout(`de versie van de inhoud is niet ${BACKUP_VERSIE}`)
  if (!isIsoTijdstip(meta.gemaaktOp)) throw inhoudFout('gemaaktOp is geen geldig ISO-tijdstip')
  if (meta.gitSha !== null && typeof meta.gitSha !== 'string') throw inhoudFout('gitSha is geen tekst')
  if (!isTekstLijst(meta.migraties)) throw inhoudFout('migraties is geen lijst met namen')
  if (!isObject(meta.rijen)) throw inhoudFout('rijen is geen object met aantallen')
  for (const [naam, aantal] of Object.entries(meta.rijen)) {
    if (naam === '' || naam.length > 128) throw inhoudFout('rijen bevat een ongeldige tabelnaam')
    if (!Number.isSafeInteger(aantal) || (aantal as number) < 0) throw inhoudFout(`het aantal rijen van tabel ${JSON.stringify(naam)} is geen geheel getal`)
  }
}

/**
 * Snelle controle dat de bytes een SQLite-bestand zijn: de kop, een geldige paginagrootte en een lengte die
 * een veelvoud van de paginagrootte is. De volledige controle (integrity_check) doet het herstel.
 */
function controleerDatabase(database: unknown): asserts database is Buffer {
  const fout = () => new BackupFout('inhoud', 'Het databasebestand in de back-up is geen geldig SQLite-bestand.')
  if (!Buffer.isBuffer(database) || database.length < 512 || !database.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) throw fout()
  const ruw = database.readUInt16BE(16)
  const pagina = ruw === 1 ? 65536 : ruw
  if (pagina < 512 || pagina > 65536 || (pagina & (pagina - 1)) !== 0 || database.length % pagina !== 0) throw fout()
}
