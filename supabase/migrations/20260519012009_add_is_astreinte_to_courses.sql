/*
  # Ajout du champ astreinte aux courses

  1. Modification
    - Table `courses` : ajout colonne `is_astreinte` (boolean, default false)
    - Permet de marquer une course comme etant une astreinte

  2. Impact
    - Aucune donnee existante affectee (defaut = false)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'is_astreinte'
  ) THEN
    ALTER TABLE courses ADD COLUMN is_astreinte boolean DEFAULT false NOT NULL;
  END IF;
END $$;
