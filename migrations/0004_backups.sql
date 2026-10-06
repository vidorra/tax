-- Administratie van de back-ups (lib/backup/runs.ts). Deze tabel gaat zelf nooit mee in een back-up.
-- soort 'gepland' heeft een periode als 'JJJJ-MM' (1 februari en 1 augustus); per periode is er één rij,
-- die bij een nieuwe poging wordt bijgewerkt (pogingen + 1). 'handmatig' heeft geen periode.
-- rijen bevat alleen aantallen rijen per tabel, fout een korte melding zonder geheimen.

CREATE TABLE IF NOT EXISTS backups (
  id serial PRIMARY KEY,
  soort text NOT NULL CHECK (soort IN ('gepland', 'handmatig')),
  periode text,
  status text NOT NULL CHECK (status IN ('bezig', 'verstuurd', 'mislukt', 'te-groot')),
  pogingen integer NOT NULL DEFAULT 1,
  gestart_op timestamptz NOT NULL DEFAULT now(),
  afgerond_op timestamptz,
  bytes integer,
  sha256 text,
  rijen jsonb,
  fout text,
  CONSTRAINT backups_periode_bij_gepland CHECK ((soort = 'gepland') = (periode IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS backups_periode_gepland_uniek ON backups(periode) WHERE soort = 'gepland';
CREATE INDEX IF NOT EXISTS backups_gestart_op_idx ON backups(gestart_op DESC);
