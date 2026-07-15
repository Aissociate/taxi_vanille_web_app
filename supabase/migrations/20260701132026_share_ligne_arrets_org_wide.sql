-- Intervisibilite directeurs (suite) : ligne_arrets avait ete oublie dans la
-- migration 20260630120000_share_data_org_wide_authenticated.sql.
-- Les UPDATE/DELETE etaient limites a auth.uid() = user_id : un directeur ne
-- pouvait pas modifier les coordonnees GPS (ni supprimer) des arrets d'une ligne
-- creee par un AUTRE compte -> l'UPDATE portait sur 0 ligne et echouait
-- silencieusement ("impossible de changer les points GPS").
-- On aligne ligne_arrets sur le meme modele org-wide que lignes.
-- Les policies "anon" (appli mobile) et SELECT (deja ouvert a tous) restent inchangees.
-- Appliquee en prod le 2026-07-01 via MCP supabase ; ce fichier la trace dans le repo.

DROP POLICY IF EXISTS "Users can update own ligne arrets" ON public.ligne_arrets;
DROP POLICY IF EXISTS "Users can delete own ligne arrets" ON public.ligne_arrets;

CREATE POLICY "Auth can update all ligne arrets" ON public.ligne_arrets
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth can delete all ligne arrets" ON public.ligne_arrets
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);
