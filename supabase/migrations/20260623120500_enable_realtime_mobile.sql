/*
  # Activer la réplication temps réel pour les applis mobiles

  La publication `supabase_realtime` était vide : aucun changement n'était
  poussé aux clients. Les applis mobiles (chauffeur / coordinateur) ne
  recevaient donc les nouveaux trajets / réaffectations qu'au démarrage.

  On ajoute les tables nécessaires pour que le planning se mette à jour en
  direct, sans fermer/rouvrir l'app. Idempotent (re-jouable sans erreur).
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'courses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE courses;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'astreintes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE astreintes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'coordinateur_creneaux') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE coordinateur_creneaux;
  END IF;
END $$;
