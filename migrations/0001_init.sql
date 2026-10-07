-- Privédossier in SQLite (één bestand in DATABASE_PATH): accounts, huishoudens, jaren, snapshots,
-- accountantsregels, aangiftestaat, herstelpunten van een JSON-import, Moneybird-koppelingen en de
-- administratie van de back-ups. Houd lib/db/schema.ts hieraan gelijk.
--
-- Inhoud met financiële gegevens staat versleuteld in de *_enc-kolommen (AES-256-GCM, lib/crypto.ts, met de
-- rij als context). Tijdstippen zijn ISO-tekst in UTC zoals Date.toISOString(), booleans 0/1, JSON tekst.
-- STRICT: SQLite weigert een waarde van het verkeerde type.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret TEXT NOT NULL DEFAULT '',
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  -- Verhoogd bij uitloggen en bij herstel; sessietokens met een lagere generatie zijn ingetrokken.
  sessie_generatie INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT users_totp_enabled_check CHECK (totp_enabled IN (0, 1))
) STRICT;

CREATE TABLE households (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  naam TEXT NOT NULL DEFAULT 'Huishouden',
  gegevens_enc TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX households_user_id_idx ON households(user_id);

-- ingediend_op: moment van de overstap naar Ingediend (anders NULL). gewijzigd_na_indienen: de invoer is gewijzigd
-- terwijl het jaar op Ingediend stond.
CREATE TABLE dossier_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  jaar INTEGER NOT NULL,
  variant TEXT,
  invoer_enc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'concept',
  versie INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ingediend_op TEXT,
  gewijzigd_na_indienen INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT dossier_years_household_jaar UNIQUE (household_id, jaar),
  CONSTRAINT dossier_years_status_check CHECK (status IN ('concept', 'gecontroleerd', 'ingediend')),
  CONSTRAINT dossier_years_gewijzigd_check CHECK (gewijzigd_na_indienen IN (0, 1))
) STRICT;

CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_year_id INTEGER NOT NULL REFERENCES dossier_years(id) ON DELETE CASCADE,
  params_hash TEXT NOT NULL,
  uitkomst_enc TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX snapshots_dossier_year_idx ON snapshots(dossier_year_id, created_at DESC);

CREATE TABLE accountant_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_year_id INTEGER NOT NULL UNIQUE REFERENCES dossier_years(id) ON DELETE CASCADE,
  regels_enc TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Vinkjes en bedragen uit de vooraf ingevulde aangifte, genegeerde controles, terugvragen in het buitenland en
-- planningsdatums. Los van de invoer: het verhoogt de versie van de invoer niet. Eén rij per jaar.
CREATE TABLE aangifte_staat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_year_id INTEGER NOT NULL UNIQUE REFERENCES dossier_years(id) ON DELETE CASCADE,
  staat_enc TEXT NOT NULL,
  versie INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- De jaren zoals ze waren vóór een JSON-import, om die import ongedaan te maken. Per huishouden blijft alleen het
-- laatste herstelpunt per reden staan. sleutel is een willekeurige id die vóór het invoegen bekend is.
CREATE TABLE herstelpunten (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  sleutel TEXT NOT NULL UNIQUE,
  reden TEXT NOT NULL,
  inhoud_enc TEXT NOT NULL,
  aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT herstelpunten_reden_check CHECK (reden IN ('json-import'))
) STRICT;
CREATE INDEX herstelpunten_household_idx ON herstelpunten(household_id, aangemaakt DESC);

-- Koppelingen met Moneybird (alleen lezen), per huishouden. Een rij met soort 'moneybird-env' bewaart alleen de
-- indeling van de koppeling uit de omgeving (MONEYBIRD_TOKEN); die heeft geen token (token_enc is leeg).
CREATE TABLE koppelingen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  soort TEXT NOT NULL DEFAULT 'moneybird',
  label TEXT NOT NULL,
  token_enc TEXT NOT NULL,
  administratie_id TEXT,
  administratie_naam TEXT,
  indeling_enc TEXT,
  aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  laatst_gebruikt TEXT
) STRICT;
CREATE INDEX koppelingen_household_idx ON koppelingen(household_id);
CREATE UNIQUE INDEX koppelingen_env_uniek ON koppelingen(household_id) WHERE soort = 'moneybird-env';

-- Administratie van de back-ups (lib/backup/runs.ts); gaat zelf nooit mee in een back-up. soort 'gepland' heeft
-- een periode 'JJJJ-MM' en per periode één rij, 'handmatig' heeft geen periode. rijen bevat alleen aantallen per
-- tabel (JSON), fout een korte melding zonder geheimen.
CREATE TABLE backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  soort TEXT NOT NULL,
  periode TEXT,
  status TEXT NOT NULL,
  pogingen INTEGER NOT NULL DEFAULT 1,
  gestart_op TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  afgerond_op TEXT,
  bytes INTEGER,
  sha256 TEXT,
  rijen TEXT,
  fout TEXT,
  CONSTRAINT backups_soort_check CHECK (soort IN ('gepland', 'handmatig')),
  CONSTRAINT backups_status_check CHECK (status IN ('bezig', 'verstuurd', 'mislukt', 'te-groot')),
  CONSTRAINT backups_periode_bij_gepland CHECK ((soort = 'gepland') = (periode IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX backups_periode_gepland_uniek ON backups(periode) WHERE soort = 'gepland';
CREATE INDEX backups_gestart_op_idx ON backups(gestart_op DESC);
