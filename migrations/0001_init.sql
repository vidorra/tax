-- Privédossier: gebruikers, huishoudens, jaren, snapshots en accountantsregels.
-- Inhoud met financiële gegevens staat versleuteld in de *_enc-kolommen (AES-256-GCM).

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  totp_secret text NOT NULL DEFAULT '',
  totp_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS households (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  naam text NOT NULL DEFAULT 'Huishouden',
  gegevens_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS households_user_id_idx ON households(user_id);

CREATE TABLE IF NOT EXISTS dossier_years (
  id serial PRIMARY KEY,
  household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  jaar integer NOT NULL,
  variant text,
  invoer_enc text NOT NULL,
  status text NOT NULL DEFAULT 'concept' CHECK (status IN ('concept', 'gecontroleerd', 'ingediend')),
  versie integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dossier_years_household_jaar UNIQUE (household_id, jaar)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id serial PRIMARY KEY,
  dossier_year_id integer NOT NULL REFERENCES dossier_years(id) ON DELETE CASCADE,
  params_hash text NOT NULL,
  uitkomst_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snapshots_dossier_year_idx ON snapshots(dossier_year_id, created_at DESC);

CREATE TABLE IF NOT EXISTS accountant_docs (
  id serial PRIMARY KEY,
  dossier_year_id integer NOT NULL UNIQUE REFERENCES dossier_years(id) ON DELETE CASCADE,
  regels_enc text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
