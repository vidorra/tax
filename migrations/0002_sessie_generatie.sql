-- Uitloggen trekt sessies in: elk sessietoken bevat de generatie van het account bij uitgifte.
-- Bestaande tokens hebben geen generatie en tellen als 0, dus ze blijven geldig tot de eerste uitlog.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessie_generatie integer NOT NULL DEFAULT 0;
