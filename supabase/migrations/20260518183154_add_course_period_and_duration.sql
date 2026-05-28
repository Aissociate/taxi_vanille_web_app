/*
  # Ajout période et durée aux courses

  1. Modifications table `courses`
    - `periode` (text) - Créneau : matin, apres_midi, astreinte
    - `duree_minutes` (integer) - Durée de la course en minutes (pour affichage timeline)
    - Ajout valeur 'non_planifie' possible dans `statut`

  2. Notes
    - `periode` permet de filtrer AM/PM/Astreinte dans le planning
    - `duree_minutes` permet le redimensionnement visuel des blocs
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'periode') THEN
    ALTER TABLE courses ADD COLUMN periode text DEFAULT 'matin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'duree_minutes') THEN
    ALTER TABLE courses ADD COLUMN duree_minutes integer DEFAULT 60;
  END IF;
END $$;
