/*
  # Separation du statut des courses en planification et realisation

  1. Modifications table `courses`
    - `statut_planification` (text) - Statut de planification de la course
      Valeurs: planifie, non_planifie
    - `statut_realisation` (text) - Statut de realisation de la course
      Valeurs: en_cours, termine, annule, remplace
    - L'ancien champ `statut` est conserve pour compatibilite mais ne sera plus utilise

  2. Notes
    - Une course planifiee peut etre en_cours, terminee, annulee ou remplacee
    - Une course non_planifiee (ajoutee au dernier moment) suit le meme cycle de realisation
    - Le champ `periode` existant (matin, apres_midi, astreinte) definit le creneau horaire
    - Cela permet de facturer separement les courses planifiees et non planifiees terminee
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'statut_planification') THEN
    ALTER TABLE courses ADD COLUMN statut_planification text DEFAULT 'planifie';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'statut_realisation') THEN
    ALTER TABLE courses ADD COLUMN statut_realisation text DEFAULT 'en_cours';
  END IF;
END $$;

-- Migrate existing data: map old statut to new fields
UPDATE courses
SET statut_planification = CASE
    WHEN statut = 'non_planifie' THEN 'non_planifie'
    ELSE 'planifie'
  END,
  statut_realisation = CASE
    WHEN statut = 'terminee' OR statut = 'termine' THEN 'termine'
    WHEN statut = 'annulee' OR statut = 'annule' THEN 'annule'
    WHEN statut = 'en_cours' THEN 'en_cours'
    ELSE 'en_cours'
  END
WHERE statut_planification = 'planifie' AND statut_realisation = 'en_cours'
  AND statut IS NOT NULL AND statut != 'planifiee';
