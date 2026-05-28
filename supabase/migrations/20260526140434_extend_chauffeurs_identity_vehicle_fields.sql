/*
  # Extend chauffeurs with identity and vehicle fields

  1. Modified Tables
    - `chauffeurs`
      - `telephone2` (text) - second phone number
      - `carte_identite_numero` (text) - national ID card number
      - `carte_sejour_numero` (text) - residence permit number
      - `vehicule_date_1ere_immat` (date) - vehicle first registration date
      - `vehicule_carburant` (text) - fuel type (essence, diesel, electrique, hybride)
      - `vehicule_date_controle_technique` (date) - last technical inspection date
      - `vehicule_assureur` (text) - insurance company name

  2. Important Notes
    - Supports artisan model: 1 SIRET can have 1-2 drivers and 1-2 vehicles
    - No existing data is modified, only new nullable columns added
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'telephone2') THEN
    ALTER TABLE chauffeurs ADD COLUMN telephone2 text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'carte_identite_numero') THEN
    ALTER TABLE chauffeurs ADD COLUMN carte_identite_numero text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'carte_sejour_numero') THEN
    ALTER TABLE chauffeurs ADD COLUMN carte_sejour_numero text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'vehicule_date_1ere_immat') THEN
    ALTER TABLE chauffeurs ADD COLUMN vehicule_date_1ere_immat date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'vehicule_carburant') THEN
    ALTER TABLE chauffeurs ADD COLUMN vehicule_carburant text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'vehicule_date_controle_technique') THEN
    ALTER TABLE chauffeurs ADD COLUMN vehicule_date_controle_technique date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'vehicule_assureur') THEN
    ALTER TABLE chauffeurs ADD COLUMN vehicule_assureur text DEFAULT '';
  END IF;
END $$;
