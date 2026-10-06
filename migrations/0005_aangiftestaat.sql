-- Ronde 2: aangiftestaat per dossierjaar en herstelpunten van een JSON-import.
--
-- aangifte_staat: vinkjes en bedragen uit de vooraf ingevulde aangifte (invulhulp), genegeerde controles, de status
-- van terugvragen in het buitenland en de datums van de planning. Los van de invoer: de pagina slaat dit zelf op
-- (zonder de knop Opslaan), het verhoogt de versie van de invoer niet en de engine leest het niet. Eén rij per jaar;
-- verdwijnt met het jaar. Inhoud versleuteld in staat_enc (AES-256-GCM, context aangifte_staat:<dossier_year_id>).
CREATE TABLE IF NOT EXISTS aangifte_staat (
  id serial PRIMARY KEY,
  dossier_year_id integer NOT NULL UNIQUE REFERENCES dossier_years(id) ON DELETE CASCADE,
  staat_enc text NOT NULL,
  versie integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- herstelpunten: de jaren zoals ze waren vóór een JSON-import, om die import ongedaan te maken. Per huishouden
-- blijft alleen het laatste herstelpunt per reden staan. inhoud_enc is versleuteld met de context
-- herstelpunten:<household_id>:<sleutel>; sleutel is een willekeurige id die vóór het invoegen bekend is.
CREATE TABLE IF NOT EXISTS herstelpunten (
  id serial PRIMARY KEY,
  household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  sleutel text NOT NULL UNIQUE,
  reden text NOT NULL CHECK (reden IN ('json-import')),
  inhoud_enc text NOT NULL,
  aangemaakt timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS herstelpunten_household_idx ON herstelpunten(household_id, aangemaakt DESC);
