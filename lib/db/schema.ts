/**
 * Drizzle-schema van het privédossier (SQLite via better-sqlite3, één bestand in DATABASE_PATH).
 *
 * Alle inhoud met financiële gegevens staat versleuteld in `*_enc` (AES-256-GCM, zie lib/crypto.ts).
 * In leesbare kolommen staan alleen technische gegevens: jaartal, variant, status, versie en datums.
 *
 * Opslag in SQLite:
 *  - id's zijn INTEGER PRIMARY KEY AUTOINCREMENT (een verwijderd id komt nooit terug).
 *  - Tijdstippen staan als ISO-tekst in UTC ('2026-10-07T12:34:56.789Z', precies Date.toISOString()), zodat ze
 *    als tekst goed sorteren en vergelijken. In de code zijn het gewoon Date-objecten (kolomtype `tijdstip`).
 *    Standaardwaarde is het moment van invoegen, met milliseconden.
 *  - Booleans zijn 0/1 (Drizzle zet ze om), JSON staat als tekst (mode 'json').
 *  - De tabellen zijn STRICT: SQLite weigert een waarde van het verkeerde type, net als Postgres.
 *
 * Houd migrations/*.sql gelijk aan dit bestand; lib/db/__tests__/schema.spec.ts vergelijkt ze.
 */
import { sql } from 'drizzle-orm'
import { check, customType, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'

import type { BackupSoort, BackupStatus, RijTelling } from '../backup/types'

import type { DossierStatus } from '../dossier/status'

export { DOSSIER_STATUSSEN, type DossierStatus } from '../dossier/status'

/** SQL-standaardwaarde voor 'nu' in dezelfde vorm als Date.toISOString(). */
export const NU_ISO = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

/** Tekst uit de database naar een Date. Een tijd zonder zone (zoals datetime('now') geeft) telt als UTC. */
export function leesTijdstip(waarde: string): Date {
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(waarde) ? `${waarde.replace(' ', 'T')}Z` : waarde
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error('Ongeldig tijdstip in de database.')
  return d
}

/** Tijdstip als ISO-tekst (UTC) in de database, als Date in de code. */
export const tijdstip = customType<{ data: Date; driverData: string }>({
  dataType: () => 'text',
  toDriver: (d) => d.toISOString(),
  fromDriver: (s) => leesTijdstip(s),
})

const bool = (naam: string) => integer(naam, { mode: 'boolean' })

export type Rol = 'beheerder' | 'gebruiker'
export type UitnodigingSoort = 'uitnodiging' | 'herstel'

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    totpSecret: text('totp_secret').notNull().default(''),
    totpEnabled: bool('totp_enabled').notNull().default(false),
    /** Verhoogd bij uitloggen en bij herstel van een back-up; sessietokens met een lagere generatie zijn ingetrokken. */
    sessieGeneratie: integer('sessie_generatie').notNull().default(0),
    createdAt: tijdstip('created_at').notNull().default(NU_ISO),
    /** Beheerders nodigen accounts uit en ontvangen de back-ups; gebruikers zien alleen hun eigen dossier. */
    rol: text('rol').$type<Rol>().notNull().default('gebruiker'),
    naam: text('naam'),
    laatstIngelogd: tijdstip('laatst_ingelogd'),
  },
  (t) => [check('users_totp_enabled_check', sql`${t.totpEnabled} IN (0, 1)`), check('users_rol_check', sql`${t.rol} IN ('beheerder', 'gebruiker')`)],
)

/**
 * Uitnodigingen voor een nieuw account en herstellinks voor een bestaand account (lib/auth/uitnodiging.ts). Alleen de
 * SHA-256 van het token staat hier. wachtwoord_hash (bcrypt) en totp_enc (versleuteld) staan klaar tijdens het
 * instellen en gaan pas na de eerste goede code naar users.
 */
export const uitnodigingen = sqliteTable(
  'uitnodigingen',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    soort: text('soort').$type<UitnodigingSoort>().notNull(),
    email: text('email').notNull(),
    naam: text('naam'),
    rol: text('rol').$type<Rol>().notNull().default('gebruiker'),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    aangemaaktDoor: integer('aangemaakt_door').references(() => users.id, { onDelete: 'set null' }),
    aangemaakt: tijdstip('aangemaakt').notNull().default(NU_ISO),
    verloopt: tijdstip('verloopt').notNull(),
    gemaildOp: tijdstip('gemaild_op'),
    wachtwoordHash: text('wachtwoord_hash'),
    totpEnc: text('totp_enc'),
    gebruiktOp: tijdstip('gebruikt_op'),
    ingetrokkenOp: tijdstip('ingetrokken_op'),
  },
  (t) => [
    check('uitnodigingen_soort_check', sql`${t.soort} IN ('uitnodiging', 'herstel')`),
    check('uitnodigingen_rol_check', sql`${t.rol} IN ('beheerder', 'gebruiker')`),
    check(
      'uitnodigingen_account_check',
      sql`(${t.soort} = 'herstel' AND ${t.userId} IS NOT NULL) OR (${t.soort} = 'uitnodiging' AND (${t.userId} IS NULL OR ${t.gebruiktOp} IS NOT NULL))`,
    ),
    uniqueIndex('uitnodigingen_token_uniek').on(t.tokenHash),
    index('uitnodigingen_email_idx').on(t.email),
  ],
)

export const households = sqliteTable(
  'households',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    naam: text('naam').notNull().default('Huishouden'),
    gegevensEnc: text('gegevens_enc').notNull(),
    createdAt: tijdstip('created_at').notNull().default(NU_ISO),
    updatedAt: tijdstip('updated_at').notNull().default(NU_ISO),
  },
  (t) => [index('households_user_id_idx').on(t.userId)],
)

export const dossierYears = sqliteTable(
  'dossier_years',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    jaar: integer('jaar').notNull(),
    variant: text('variant'),
    invoerEnc: text('invoer_enc').notNull(),
    status: text('status').$type<DossierStatus>().notNull().default('concept'),
    versie: integer('versie').notNull().default(1),
    updatedAt: tijdstip('updated_at').notNull().default(NU_ISO),
    /** Moment van de overstap naar Ingediend; null bij een andere status. */
    ingediendOp: tijdstip('ingediend_op'),
    /** De invoer is gewijzigd nadat het jaar op Ingediend stond. */
    gewijzigdNaIndienen: bool('gewijzigd_na_indienen').notNull().default(false),
  },
  (t) => [
    unique('dossier_years_household_jaar').on(t.householdId, t.jaar),
    check('dossier_years_status_check', sql`${t.status} IN ('concept', 'gecontroleerd', 'ingediend')`),
    check('dossier_years_gewijzigd_check', sql`${t.gewijzigdNaIndienen} IN (0, 1)`),
  ],
)

export const snapshots = sqliteTable(
  'snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dossierYearId: integer('dossier_year_id')
      .notNull()
      .references(() => dossierYears.id, { onDelete: 'cascade' }),
    paramsHash: text('params_hash').notNull(),
    uitkomstEnc: text('uitkomst_enc').notNull(),
    createdAt: tijdstip('created_at').notNull().default(NU_ISO),
  },
  (t) => [index('snapshots_dossier_year_idx').on(t.dossierYearId, sql`${t.createdAt} DESC`)],
)

export const accountantDocs = sqliteTable('accountant_docs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dossierYearId: integer('dossier_year_id')
    .notNull()
    .unique()
    .references(() => dossierYears.id, { onDelete: 'cascade' }),
  regelsEnc: text('regels_enc').notNull(),
  updatedAt: tijdstip('updated_at').notNull().default(NU_ISO),
})

/**
 * Aangiftestaat per dossierjaar (lib/dossier/aangiftestaat.ts): vinkjes en VIA-bedragen van de invulhulp,
 * genegeerde controles, status van terugvragen in het buitenland en planningsdatums. Slaat zichzelf op, los van
 * de invoer; staat_enc met context `aangifte_staat:<dossier_year_id>`.
 */
export const aangifteStaat = sqliteTable('aangifte_staat', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dossierYearId: integer('dossier_year_id')
    .notNull()
    .unique()
    .references(() => dossierYears.id, { onDelete: 'cascade' }),
  staatEnc: text('staat_enc').notNull(),
  versie: integer('versie').notNull().default(1),
  updatedAt: tijdstip('updated_at').notNull().default(NU_ISO),
})

/**
 * Herstelpunten van een JSON-import: de jaren zoals ze waren vóór de import. Alleen het laatste per huishouden en
 * reden blijft staan; inhoud_enc met context `herstelpunten:<household_id>:<sleutel>`.
 */
export const herstelpunten = sqliteTable(
  'herstelpunten',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    sleutel: text('sleutel').notNull().unique(),
    reden: text('reden').$type<'json-import'>().notNull(),
    inhoudEnc: text('inhoud_enc').notNull(),
    aangemaakt: tijdstip('aangemaakt').notNull().default(NU_ISO),
  },
  (t) => [check('herstelpunten_reden_check', sql`${t.reden} IN ('json-import')`), index('herstelpunten_household_idx').on(t.householdId, sql`${t.aangemaakt} DESC`)],
)

/**
 * Koppelingen met Moneybird. token_enc en indeling_enc zijn versleuteld met de rij als context. soort
 * 'moneybird-env' bewaart alleen de indeling van de koppeling uit de omgeving (geen token, token_enc leeg).
 */
export const koppelingen = sqliteTable(
  'koppelingen',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    soort: text('soort').notNull().default('moneybird'),
    label: text('label').notNull(),
    tokenEnc: text('token_enc').notNull(),
    administratieId: text('administratie_id'),
    administratieNaam: text('administratie_naam'),
    indelingEnc: text('indeling_enc'),
    aangemaakt: tijdstip('aangemaakt').notNull().default(NU_ISO),
    laatstGebruikt: tijdstip('laatst_gebruikt'),
    /** Van wie de administratie is: persoon A of B in het dossier; null = niet gekozen. */
    persoon: text('persoon').$type<'A' | 'B'>(),
  },
  (t) => [
    index('koppelingen_household_idx').on(t.householdId),
    uniqueIndex('koppelingen_env_uniek').on(t.householdId).where(sql`soort = 'moneybird-env'`),
    check('koppelingen_persoon_check', sql`${t.persoon} IS NULL OR ${t.persoon} IN ('A', 'B')`),
  ],
)

/**
 * Administratie van de back-ups (lib/backup/runs.ts). Gaat zelf nooit mee in een back-up: de snapshot wordt
 * geleegd voordat hij wordt versleuteld. Per geplande periode ('JJJJ-MM') is er één rij; een nieuwe poging werkt
 * die rij bij.
 */
export const backups = sqliteTable(
  'backups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    soort: text('soort').$type<BackupSoort>().notNull(),
    periode: text('periode'),
    status: text('status').$type<BackupStatus>().notNull(),
    pogingen: integer('pogingen').notNull().default(1),
    gestartOp: tijdstip('gestart_op').notNull().default(NU_ISO),
    afgerondOp: tijdstip('afgerond_op'),
    bytes: integer('bytes'),
    sha256: text('sha256'),
    rijen: text('rijen', { mode: 'json' }).$type<RijTelling>(),
    fout: text('fout'),
  },
  (t) => [
    check('backups_soort_check', sql`${t.soort} IN ('gepland', 'handmatig')`),
    check('backups_status_check', sql`${t.status} IN ('bezig', 'verstuurd', 'mislukt', 'te-groot')`),
    check('backups_periode_bij_gepland', sql`(${t.soort} = 'gepland') = (${t.periode} IS NOT NULL)`),
    uniqueIndex('backups_periode_gepland_uniek').on(t.periode).where(sql`soort = 'gepland'`),
    index('backups_gestart_op_idx').on(sql`${t.gestartOp} DESC`),
  ],
)

export type Gebruiker = typeof users.$inferSelect
export type UitnodigingRij = typeof uitnodigingen.$inferSelect
export type DossierJaarRij = typeof dossierYears.$inferSelect
export type KoppelingRij = typeof koppelingen.$inferSelect
export type BackupRij = typeof backups.$inferSelect
export type AangifteStaatRij = typeof aangifteStaat.$inferSelect
export type HerstelpuntRij = typeof herstelpunten.$inferSelect
