-- Koppelingen met boekhoudpakketten (Moneybird, alleen lezen), per huishouden.
-- Het token en de indeling per grootboekrekening staan versleuteld in *_enc (AES-256-GCM met de
-- rij als context). Een rij met soort 'moneybird-env' bewaart alleen de indeling van de koppeling
-- uit de omgeving (MONEYBIRD_TOKEN); die heeft geen token (token_enc is leeg).

CREATE TABLE IF NOT EXISTS koppelingen (
  id serial PRIMARY KEY,
  household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  soort text NOT NULL DEFAULT 'moneybird',
  label text NOT NULL,
  token_enc text NOT NULL,
  administratie_id text,
  administratie_naam text,
  indeling_enc text,
  aangemaakt timestamptz NOT NULL DEFAULT now(),
  laatst_gebruikt timestamptz
);
CREATE INDEX IF NOT EXISTS koppelingen_household_idx ON koppelingen(household_id);
CREATE UNIQUE INDEX IF NOT EXISTS koppelingen_env_uniek ON koppelingen(household_id) WHERE soort = 'moneybird-env';
