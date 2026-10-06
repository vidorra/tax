/**
 * Drizzle-schema van het privédossier.
 *
 * Alle inhoud met financiële gegevens staat versleuteld in `*_enc` (AES-256-GCM, zie lib/crypto.ts).
 * In leesbare kolommen staan alleen technische gegevens: jaartal, variant, status, versie en datums.
 * Houd migrations/*.sql gelijk aan dit bestand.
 */
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, serial, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'

import type { BackupSoort, BackupStatus, RijTelling } from '../backup/types'

import type { DossierStatus } from '../dossier/status'

export { DOSSIER_STATUSSEN, type DossierStatus } from '../dossier/status'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret').notNull().default(''),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  /** Verhoogd bij uitloggen; sessietokens met een lagere generatie zijn ingetrokken (migratie 0002). */
  sessieGeneratie: integer('sessie_generatie').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const households = pgTable('households', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  naam: text('naam').notNull().default('Huishouden'),
  gegevensEnc: text('gegevens_enc').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dossierYears = pgTable(
  'dossier_years',
  {
    id: serial('id').primaryKey(),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    jaar: integer('jaar').notNull(),
    variant: text('variant'),
    invoerEnc: text('invoer_enc').notNull(),
    status: text('status').$type<DossierStatus>().notNull().default('concept'),
    versie: integer('versie').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Ronde 2 (migratie 0006): moment van de overstap naar Ingediend; null bij een andere status. */
    ingediendOp: timestamp('ingediend_op', { withTimezone: true }),
    /** Ronde 2 (migratie 0006): de invoer is gewijzigd nadat het jaar op Ingediend stond. */
    gewijzigdNaIndienen: boolean('gewijzigd_na_indienen').notNull().default(false),
  },
  (t) => [unique('dossier_years_household_jaar').on(t.householdId, t.jaar)],
)

export const snapshots = pgTable('snapshots', {
  id: serial('id').primaryKey(),
  dossierYearId: integer('dossier_year_id')
    .notNull()
    .references(() => dossierYears.id, { onDelete: 'cascade' }),
  paramsHash: text('params_hash').notNull(),
  uitkomstEnc: text('uitkomst_enc').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accountantDocs = pgTable('accountant_docs', {
  id: serial('id').primaryKey(),
  dossierYearId: integer('dossier_year_id')
    .notNull()
    .unique()
    .references(() => dossierYears.id, { onDelete: 'cascade' }),
  regelsEnc: text('regels_enc').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Aangiftestaat per dossierjaar (migratie 0005, lib/dossier/aangiftestaat.ts): vinkjes en VIA-bedragen van de
 * invulhulp, genegeerde controles, status van terugvragen in het buitenland en planningsdatums. Slaat zichzelf op,
 * los van de invoer; staat_enc met context `aangifte_staat:<dossier_year_id>`.
 */
export const aangifteStaat = pgTable('aangifte_staat', {
  id: serial('id').primaryKey(),
  dossierYearId: integer('dossier_year_id')
    .notNull()
    .unique()
    .references(() => dossierYears.id, { onDelete: 'cascade' }),
  staatEnc: text('staat_enc').notNull(),
  versie: integer('versie').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Herstelpunten van een JSON-import (migratie 0005): de jaren zoals ze waren vóór de import. Alleen het laatste per
 * huishouden en reden blijft staan; inhoud_enc met context `herstelpunten:<household_id>:<sleutel>`.
 */
export const herstelpunten = pgTable(
  'herstelpunten',
  {
    id: serial('id').primaryKey(),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    sleutel: text('sleutel').notNull().unique(),
    reden: text('reden').$type<'json-import'>().notNull(),
    inhoudEnc: text('inhoud_enc').notNull(),
    aangemaakt: timestamp('aangemaakt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('herstelpunten_reden_check', sql`${t.reden} IN ('json-import')`), index('herstelpunten_household_idx').on(t.householdId, t.aangemaakt.desc())],
)

/**
 * Koppelingen met Moneybird (migratie 0003). token_enc en indeling_enc zijn versleuteld met de rij als
 * context. soort 'moneybird-env' bewaart alleen de indeling van de koppeling uit de omgeving (geen token).
 */
export const koppelingen = pgTable('koppelingen', {
  id: serial('id').primaryKey(),
  householdId: integer('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  soort: text('soort').notNull().default('moneybird'),
  label: text('label').notNull(),
  tokenEnc: text('token_enc').notNull(),
  administratieId: text('administratie_id'),
  administratieNaam: text('administratie_naam'),
  indelingEnc: text('indeling_enc'),
  aangemaakt: timestamp('aangemaakt', { withTimezone: true }).notNull().defaultNow(),
  laatstGebruikt: timestamp('laatst_gebruikt', { withTimezone: true }),
})

/**
 * Administratie van de back-ups (migratie 0004, lib/backup/runs.ts). Gaat zelf nooit mee in een back-up.
 * Per geplande periode ('JJJJ-MM') is er één rij; een nieuwe poging werkt die rij bij.
 */
export const backups = pgTable(
  'backups',
  {
    id: serial('id').primaryKey(),
    soort: text('soort').$type<BackupSoort>().notNull(),
    periode: text('periode'),
    status: text('status').$type<BackupStatus>().notNull(),
    pogingen: integer('pogingen').notNull().default(1),
    gestartOp: timestamp('gestart_op', { withTimezone: true }).notNull().defaultNow(),
    afgerondOp: timestamp('afgerond_op', { withTimezone: true }),
    bytes: integer('bytes'),
    sha256: text('sha256'),
    rijen: jsonb('rijen').$type<RijTelling>(),
    fout: text('fout'),
  },
  (t) => [
    check('backups_soort_check', sql`${t.soort} IN ('gepland', 'handmatig')`),
    check('backups_status_check', sql`${t.status} IN ('bezig', 'verstuurd', 'mislukt', 'te-groot')`),
    check('backups_periode_bij_gepland', sql`(${t.soort} = 'gepland') = (${t.periode} IS NOT NULL)`),
    uniqueIndex('backups_periode_gepland_uniek').on(t.periode).where(sql`soort = 'gepland'`),
    index('backups_gestart_op_idx').on(t.gestartOp.desc()),
  ],
)

export type Gebruiker = typeof users.$inferSelect
export type DossierJaarRij = typeof dossierYears.$inferSelect
export type KoppelingRij = typeof koppelingen.$inferSelect
export type BackupRij = typeof backups.$inferSelect
export type AangifteStaatRij = typeof aangifteStaat.$inferSelect
export type HerstelpuntRij = typeof herstelpunten.$inferSelect
