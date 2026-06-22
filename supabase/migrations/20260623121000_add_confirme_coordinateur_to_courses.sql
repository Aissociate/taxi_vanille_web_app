/*
  # Confirmation de départ par le coordinateur (double confirmation)

  Une course peut être confirmée au départ par DEUX canaux indépendants :
    - le CHAUFFEUR : en démarrant la course (statut_realisation = en_cours / termine) ;
    - le COORDINATEUR : via le bouton « Confirmer départ » sur son mobile,
      qui renseigne `confirme_coordinateur_at` SANS bloquer la course.

  Règle métier : si l'heure de départ est dépassée et qu'AUCUN des deux n'a
  confirmé, la course est considérée « en retard » (calculé à l'affichage).

  La policy anon UPDATE existante (`chauffeur_id IS NOT NULL`) suffit : le
  coordinateur (rôle anon) ne modifie que cette colonne, le chauffeur reste.
*/

ALTER TABLE courses ADD COLUMN IF NOT EXISTS confirme_coordinateur_at timestamptz;

COMMENT ON COLUMN courses.confirme_coordinateur_at IS
  'Horodatage de la confirmation de depart par le coordinateur (non bloquant). Le chauffeur, lui, confirme en demarrant la course (statut_realisation).';
