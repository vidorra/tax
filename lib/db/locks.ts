/**
 * Sleutels van advisory locks in Postgres, op één plek, zodat geen twee onderdelen per ongeluk dezelfde
 * sleutel nemen. Sleutels met één argument en met twee argumenten (sleutel, id) zijn aparte ruimtes.
 */
export const LOCK = {
  /** scripts/migrate.ts neemt hem exclusief per sessie; maakDump neemt hem gedeeld, zodat dump en migratie elkaar uitsluiten. */
  migraties: 724000,
  /** lib/auth/gebruiker.ts: het eerste account aanmaken (één argument). */
  account: 724001,
  /** lib/dossier/opslag.ts: huishouden per gebruiker (twee argumenten: sleutel, userId). */
  huishouden: 724002,
  /** lib/moneybird/opslag.ts: koppelingen per huishouden (twee argumenten: sleutel, householdId). */
  moneybird: 724003,
  /** lib/backup/runs.ts: een handmatige back-up starten (één argument). */
  backupHandmatig: 724004,
} as const
