/*
  # Extend chauffeurs with enterprise and vehicle fields

  1. Modified Tables
    - `chauffeurs`
      - `licence_transport` (text) - numero de licence transport
      - `carte_conducteur_numero` (text) - numero de carte conducteur
      - `carte_conducteur_validite` (date) - date validite carte conducteur
      - `vehicule_marque` (text) - marque du vehicule
      - `n_adherent` (text) - numero d'adherent cooperative
      - `secteur_activite` (text) - secteur geographique
      - `commentaires` (text) - commentaires/observations

  2. Important Notes
    - These fields are needed to store complete chauffeur enterprise data
    - No data is removed, only new columns added
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'licence_transport') THEN
    ALTER TABLE chauffeurs ADD COLUMN licence_transport text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'carte_conducteur_numero') THEN
    ALTER TABLE chauffeurs ADD COLUMN carte_conducteur_numero text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'carte_conducteur_validite') THEN
    ALTER TABLE chauffeurs ADD COLUMN carte_conducteur_validite date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'vehicule_marque') THEN
    ALTER TABLE chauffeurs ADD COLUMN vehicule_marque text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'n_adherent') THEN
    ALTER TABLE chauffeurs ADD COLUMN n_adherent text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'secteur_activite') THEN
    ALTER TABLE chauffeurs ADD COLUMN secteur_activite text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'commentaires') THEN
    ALTER TABLE chauffeurs ADD COLUMN commentaires text DEFAULT '';
  END IF;
END $$;
