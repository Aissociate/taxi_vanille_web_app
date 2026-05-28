/*
  # Table jours feries

  1. Nouvelle table
    - `jours_feries`
      - `id` (uuid, primary key)
      - `date` (date) - Date du jour ferie
      - `intitule` (text) - Nom du jour ferie
      - `recurrent` (boolean) - Si annuel (true) ou unique (false)
      - `user_id` (uuid) - Proprietaire
      - `created_at` (timestamptz)

  2. Securite
    - RLS active avec politiques par utilisateur
*/

CREATE TABLE IF NOT EXISTS jours_feries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  intitule text NOT NULL DEFAULT '',
  recurrent boolean DEFAULT true,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE jours_feries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jours_feries"
  ON jours_feries FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jours_feries"
  ON jours_feries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jours_feries"
  ON jours_feries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own jours_feries"
  ON jours_feries FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
