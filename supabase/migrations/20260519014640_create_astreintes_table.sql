/*
  # Creation de la table astreintes

  1. Nouvelle table
    - `astreintes`
      - `id` (uuid, primary key)
      - `chauffeur_id` (uuid, reference vers chauffeurs)
      - `ligne_id` (uuid, reference vers lignes)
      - `date_debut` (timestamptz) - debut de la periode d'astreinte
      - `date_fin` (timestamptz) - fin de la periode d'astreinte
      - `is_brouillon` (boolean, default false) - si l'astreinte est en mode brouillon
      - `notes` (text) - notes libres
      - `user_id` (uuid, reference vers auth.users)
      - `created_at` (timestamptz)

  2. Securite
    - RLS active avec policies pour CRUD authentifie
*/

CREATE TABLE IF NOT EXISTS astreintes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chauffeur_id uuid REFERENCES chauffeurs(id) NOT NULL,
  ligne_id uuid REFERENCES lignes(id) NOT NULL,
  date_debut timestamptz NOT NULL,
  date_fin timestamptz NOT NULL,
  is_brouillon boolean DEFAULT false NOT NULL,
  notes text DEFAULT '' NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE astreintes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own astreintes"
  ON astreintes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own astreintes"
  ON astreintes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own astreintes"
  ON astreintes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own astreintes"
  ON astreintes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
