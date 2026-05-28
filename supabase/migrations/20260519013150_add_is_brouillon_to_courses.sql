/*
  # Ajout du mode brouillon aux courses

  1. Modification
    - Table `courses` : ajout colonne `is_brouillon` (boolean, default false)
    - Permet de marquer une course comme brouillon (non publiee dans le planning actif)
    - Les brouillons ne sont pas visibles par les chauffeurs tant qu'ils ne sont pas publies

  2. Impact
    - Aucune donnee existante affectee (defaut = false, toutes les courses existantes sont considerees publiees)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'is_brouillon'
  ) THEN
    ALTER TABLE courses ADD COLUMN is_brouillon boolean DEFAULT false NOT NULL;
  END IF;
END $$;
