/*
  # Synchronisation automatique statut -> statut_realisation

  1. Probleme
    - L'app Android chauffeur met a jour l'ancien champ `statut` (planifiee, en_cours, terminee)
    - La facturation et le planning utilisent le nouveau champ `statut_realisation` (programme, en_cours, termine, incident)
    - Les courses marquees "terminee" par l'app ne sont pas comptabilisees en facture

  2. Solution
    - Trigger BEFORE UPDATE qui synchronise le champ `statut` vers `statut_realisation`
    - Mapping: terminee -> termine, en_cours -> en_cours, planifiee -> programme
    - Ne s'applique que si `statut` change mais pas `statut_realisation`

  3. Impact
    - Toutes les courses mises a jour par l'app Android seront automatiquement synchronisees
    - Aucune modification requise cote app Android
*/

CREATE OR REPLACE FUNCTION sync_statut_to_statut_realisation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if statut changed but statut_realisation was not explicitly changed
  IF NEW.statut IS DISTINCT FROM OLD.statut 
     AND NEW.statut_realisation IS NOT DISTINCT FROM OLD.statut_realisation THEN
    CASE NEW.statut
      WHEN 'terminee' THEN NEW.statut_realisation := 'termine';
      WHEN 'en_cours' THEN NEW.statut_realisation := 'en_cours';
      WHEN 'planifiee' THEN NEW.statut_realisation := 'programme';
      WHEN 'annulee' THEN NEW.statut_realisation := 'incident';
      ELSE NULL;
    END CASE;
  END IF;

  -- Also sync the other direction: if statut_realisation changed but not statut
  IF NEW.statut_realisation IS DISTINCT FROM OLD.statut_realisation 
     AND NEW.statut IS NOT DISTINCT FROM OLD.statut THEN
    CASE NEW.statut_realisation
      WHEN 'termine' THEN NEW.statut := 'terminee';
      WHEN 'en_cours' THEN NEW.statut := 'en_cours';
      WHEN 'programme' THEN NEW.statut := 'planifiee';
      WHEN 'incident' THEN NEW.statut := 'annulee';
      ELSE NULL;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_statut_realisation ON courses;

CREATE TRIGGER trg_sync_statut_realisation
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION sync_statut_to_statut_realisation();

-- Fix existing courses: sync current statut values to statut_realisation
UPDATE courses 
SET statut_realisation = 'termine'
WHERE statut = 'terminee' AND statut_realisation != 'termine';

UPDATE courses 
SET statut_realisation = 'en_cours'
WHERE statut = 'en_cours' AND statut_realisation = 'programme';
