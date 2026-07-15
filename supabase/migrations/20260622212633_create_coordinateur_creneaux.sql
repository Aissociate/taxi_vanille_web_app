/*
  # Créneaux de coordination (planning coordinateur indépendant)

  Permet de planifier un coordinateur sur une LIGNE et une PLAGE HORAIRE,
  indépendamment de tout chauffeur (contrairement aux astreintes qui exigent
  un chauffeur). L'appli mobile coordinateur (rôle anon) n'affichera que les
  courses qui tombent dans un de ses créneaux : même ligne + dans la plage.

  Choix produit (validés) :
    - le coordinateur voit ses courses PAR CRÉNEAU horaire ;
    - un créneau est TOUJOURS rattaché à une ligne (ligne_id NOT NULL).
*/

CREATE TABLE IF NOT EXISTS coordinateur_creneaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinateur_id uuid REFERENCES chauffeurs(id) ON DELETE CASCADE NOT NULL,
  ligne_id uuid REFERENCES lignes(id) ON DELETE CASCADE NOT NULL,
  date_debut timestamptz NOT NULL,
  date_fin timestamptz NOT NULL,
  notes text DEFAULT '' NOT NULL,
  is_brouillon boolean DEFAULT false NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coordinateur_creneaux ENABLE ROW LEVEL SECURITY;

-- Backoffice : tout staff authentifié (mono-entreprise), cohérent avec
-- la policy "Authenticated can update/delete courses".
CREATE POLICY "creneaux_select_auth" ON coordinateur_creneaux
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "creneaux_insert_auth" ON coordinateur_creneaux
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "creneaux_update_auth" ON coordinateur_creneaux
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "creneaux_delete_auth" ON coordinateur_creneaux
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Appli mobile coordinateur (rôle anon, comme pour courses / lignes / arrets).
CREATE POLICY "creneaux_select_anon" ON coordinateur_creneaux
  FOR SELECT TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_creneaux_coord_date
  ON coordinateur_creneaux (coordinateur_id, date_debut, date_fin);
