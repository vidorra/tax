-- Meer accounts in één installatie.
--
-- users: een rol (beheerder of gebruiker), een naam en het moment van de laatste login. Bestaande accounts met 2FA
-- waren de eigenaar van de installatie en worden beheerder.
--
-- uitnodigingen: een uitnodiging voor een nieuw account of een herstellink voor een bestaand account. Alleen de
-- SHA-256 van het token staat hier; het token zelf staat alleen in de mail. Tijdens het instellen staan het nieuwe
-- wachtwoord (bcrypt) en het nieuwe TOTP-geheim (versleuteld) hier klaar; pas na de eerste goede code gaan ze naar
-- users. Zo bestaat een account pas als het af is, en blijft bij een herstel het oude wachtwoord werken tot het nieuwe
-- is bevestigd.
--
-- koppelingen: van wie de Moneybird-administratie is (persoon A of B in het dossier), zodat de onderneming van de
-- partner de koppeling van de partner kiest.

ALTER TABLE users ADD COLUMN rol TEXT NOT NULL DEFAULT 'gebruiker' CONSTRAINT users_rol_check CHECK (rol IN ('beheerder', 'gebruiker'));
ALTER TABLE users ADD COLUMN naam TEXT;
ALTER TABLE users ADD COLUMN laatst_ingelogd TEXT;
UPDATE users SET rol = 'beheerder' WHERE totp_enabled = 1;

CREATE TABLE uitnodigingen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  soort TEXT NOT NULL,
  email TEXT NOT NULL,
  naam TEXT,
  rol TEXT NOT NULL DEFAULT 'gebruiker',
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  aangemaakt_door INTEGER REFERENCES users(id) ON DELETE SET NULL,
  aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  verloopt TEXT NOT NULL,
  gemaild_op TEXT,
  wachtwoord_hash TEXT,
  totp_enc TEXT,
  gebruikt_op TEXT,
  ingetrokken_op TEXT,
  CONSTRAINT uitnodigingen_soort_check CHECK (soort IN ('uitnodiging', 'herstel')),
  CONSTRAINT uitnodigingen_rol_check CHECK (rol IN ('beheerder', 'gebruiker')),
  CONSTRAINT uitnodigingen_account_check CHECK ((soort = 'herstel' AND user_id IS NOT NULL) OR (soort = 'uitnodiging' AND (user_id IS NULL OR gebruikt_op IS NOT NULL)))
) STRICT;
CREATE UNIQUE INDEX uitnodigingen_token_uniek ON uitnodigingen(token_hash);
CREATE INDEX uitnodigingen_email_idx ON uitnodigingen(email);

ALTER TABLE koppelingen ADD COLUMN persoon TEXT CONSTRAINT koppelingen_persoon_check CHECK (persoon IS NULL OR persoon IN ('A', 'B'));
