-- Ronde 2 (na de toets): moment van indienen per dossierjaar en of de invoer daarna nog is gewijzigd. Voor de controle
-- ingediend-gewijzigd en het overzicht. De server zet ingediend_op bij de overstap naar Ingediend en maakt beide leeg
-- bij een andere status; een opslag met gewijzigde invoer terwijl het jaar ingediend is, zet gewijzigd_na_indienen.
ALTER TABLE dossier_years ADD COLUMN IF NOT EXISTS ingediend_op timestamptz;
ALTER TABLE dossier_years ADD COLUMN IF NOT EXISTS gewijzigd_na_indienen boolean NOT NULL DEFAULT false;
-- Jaren die al op Ingediend staan: het precieze moment is onbekend, de laatste wijziging komt het dichtst in de buurt.
UPDATE dossier_years SET ingediend_op = updated_at WHERE status = 'ingediend' AND ingediend_op IS NULL;
