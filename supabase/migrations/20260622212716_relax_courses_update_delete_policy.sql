/*
  # Autoriser tout staff authentifie a editer/supprimer n'importe quelle course

  Contexte: backoffice mono-entreprise, tous les comptes authentifies sont du
  personnel. Les policies UPDATE/DELETE sur `courses` etaient restreintes a
  `auth.uid() = user_id`. Consequence: une course creee par un autre compte
  (typiquement les courses non affectees / orphelines, ou les courses creees
  via un ancien compte) ne pouvait etre ni modifiee ni supprimee depuis le
  planning. Le delete renvoyait un succes avec 0 ligne supprimee, sans erreur,
  donc la course reapparaissait apres rechargement.

  Correctif: tout utilisateur authentifie peut desormais UPDATE et DELETE
  n'importe quelle course. Coherent avec la migration
  20260526135749_allow_any_authenticated_update_bug_statut. Les policies SELECT
  et INSERT (y compris anon) restent inchangees.
*/

DROP POLICY IF EXISTS "Users can delete own courses" ON courses;
CREATE POLICY "Authenticated can delete courses"
  ON courses FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own courses" ON courses;
CREATE POLICY "Authenticated can update courses"
  ON courses FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
