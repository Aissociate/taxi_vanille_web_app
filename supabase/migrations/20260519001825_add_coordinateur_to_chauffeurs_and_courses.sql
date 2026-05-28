/*
  # Ajout du role Coordinateur aux chauffeurs et liaison avec les courses

  1. Modifications table `chauffeurs`
    - `is_coordinateur` (boolean, default false) - Indique si le chauffeur est coordinateur
    - `pin_android` (text, nullable) - Code PIN specifique pour l'acces a l'app Android

  2. Modifications table `courses`
    - `coordinateur_id` (uuid, nullable, FK vers chauffeurs) - Le coordinateur affecte a la course

  3. Notes
    - Seuls les chauffeurs avec is_coordinateur = true apparaissent dans la liste des coordinateurs
    - Le PIN Android est un code d'acces specifique pour l'application mobile du coordinateur
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chauffeurs' AND column_name = 'is_coordinateur'
  ) THEN
    ALTER TABLE chauffeurs ADD COLUMN is_coordinateur boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chauffeurs' AND column_name = 'pin_android'
  ) THEN
    ALTER TABLE chauffeurs ADD COLUMN pin_android text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'coordinateur_id'
  ) THEN
    ALTER TABLE courses ADD COLUMN coordinateur_id uuid REFERENCES chauffeurs(id);
  END IF;
END $$;
