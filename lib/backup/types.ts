/**
 * Contract van de back-up van de database.
 *
 * Twee keer per jaar, op 1 februari en 1 augustus (Europe/Amsterdam), maakt de server een volledige
 * back-up van de database en mailt die als versleutelde bijlage naar BACKUP_MAIL_TO. Daarnaast kan de
 * ingelogde gebruiker in het dossier een back-up op verzoek mailen, en is er een herstelscript.
 *
 * Modules en verantwoordelijkheden:
 *  - lib/backup/formaat.ts   puur: gzip + AES-256-GCM-envelop om BackupInhoud, bestandsnaam, sleutel-id.
 *  - lib/backup/planning.ts  puur: welk moment is aan de beurt, inhaaltermijn, volgende moment, wachttijd.
 *  - lib/backup/dump.ts      SQL: volledige dump en herstel, generiek over alle tabellen van het schema.
 *  - lib/backup/runs.ts      SQL: tabel backups (migratie 0004), atomair claimen, afronden, status lezen.
 *  - lib/backup/service.ts   samenvoegen: config, dump, versleutelen, mailen, run vastleggen; scheduler-tik.
 *  - lib/mail/index.ts       mailer: Resend (HTTP) of SMTP.
 *  - instrumentation.ts      start de scheduler bij serverstart (alleen Node-runtime, alleen als geconfigureerd).
 *  - app/api/dossier/backup  GET status, POST back-up nu mailen.
 *  - scripts/backup.ts       CLI: back-up naar bestand of mail, en herstellen/inspecteren van een bestand.
 *
 * Regels: nooit inhoud van rijen, sleutels, tokens of het mailadres volledig loggen. De mail zelf bevat
 * geen financiële gegevens, alleen datum, grootte, aantallen rijen per tabel en hoe je herstelt.
 */

export const BACKUP_FORMAAT = 'ibcalculator-backup' as const
export const BACKUP_VERSIE = 1 as const

/** Bestandsextensie van een versleutelde back-up. */
export const BACKUP_EXTENSIE = '.ibcbak'

/** Tabellen die nooit in een back-up gaan: de eigen administratie van back-ups en migraties. */
export const UITGESLOTEN_TABELLEN = ['backups', '_migrations'] as const

/** Eén tabel in de dump, in volgorde van foreign keys (ouders eerst). */
export interface BackupTabel {
  naam: string
  /** Kolomnamen zoals in de database, in volgorde van de tabel. */
  kolommen: string[]
  /** Rijen met elke waarde in de tekstvorm van Postgres (kolom::text) en SQL NULL als null; herstel cast terug naar het kolomtype. */
  rijen: Array<Record<string, unknown>>
}

/** Inhoud van een back-up vóór gzip en versleuteling. */
export interface BackupInhoud {
  formaat: typeof BACKUP_FORMAAT
  versie: typeof BACKUP_VERSIE
  /** ISO-tijdstip waarop de dump is gemaakt (binnen één REPEATABLE READ-transactie). */
  gemaaktOp: string
  /** Commit van de app (GIT_SHA) of null. */
  gitSha: string | null
  /** Namen van de uitgevoerde migraties (uit _migrations), gesorteerd. Herstel migreert eerst tot precies deze set. */
  migraties: string[]
  tabellen: BackupTabel[]
}

/** Aantallen rijen per tabel; veilig om te loggen en te mailen. */
export type RijTelling = Record<string, number>

export type BackupSoort = 'gepland' | 'handmatig'
export type BackupStatus = 'bezig' | 'verstuurd' | 'mislukt' | 'te-groot'

/** Een rij uit de tabel backups. */
export interface BackupRun {
  id: number
  soort: BackupSoort
  /** Bij 'gepland' de periode als 'JJJJ-MM' van het moment (bijvoorbeeld '2027-02'); bij 'handmatig' null. */
  periode: string | null
  status: BackupStatus
  pogingen: number
  gestartOp: string
  afgerondOp: string | null
  bytes: number | null
  sha256: string | null
  rijen: RijTelling | null
  /** Korte foutmelding zonder geheimen (maximaal 300 tekens). */
  fout: string | null
}

/** Uitkomst van één back-up-poging. */
export interface BackupResultaat {
  status: Exclude<BackupStatus, 'bezig'> | 'overgeslagen'
  /** Waarom overgeslagen of mislukt, in gewone taal. */
  reden?: string
  runId?: number
  bestandsnaam?: string
  bytes?: number
  sha256?: string
  rijen?: RijTelling
}

/** Configuratie van de back-up uit de omgeving. */
export interface BackupConfig {
  /** Alles aanwezig om een back-up te maken én te mailen. */
  klaar: boolean
  /** Namen van ontbrekende variabelen: DATABASE_URL, DOSSIER_KEY, BACKUP_MAIL_TO, MAIL_FROM, RESEND_API_KEY of SMTP_*. */
  ontbreekt: string[]
  /** Ontvanger, of null. Alleen gemaskeerd naar de browser of de log. */
  ontvanger: string | null
}

/** Status voor de kaart in het dossier (GET /api/dossier/backup). */
export interface BackupStatusPubliek {
  geconfigureerd: boolean
  ontbreekt: string[]
  /** Gemaskeerd, bijvoorbeeld 'b•••@example.nl'. */
  ontvanger: string | null
  /** Momenten per jaar, als 'MM-DD'. */
  momenten: string[]
  /** Volgende geplande datum als 'JJJJ-MM-DD' (Europe/Amsterdam). */
  volgende: string
  laatste: BackupRun | null
  /** Laatste geslaagde run (verstuurd), of null. */
  laatsteGeslaagd: BackupRun | null
}
