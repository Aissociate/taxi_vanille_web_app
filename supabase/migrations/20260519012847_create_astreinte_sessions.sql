/*
  # Create astreinte sessions table

  1. New Tables
    - `astreinte_sessions`
      - `id` (uuid, primary key)
      - `chauffeur_id` (uuid, references chauffeurs)
      - `date` (date, the day of astreinte)
      - `heure_debut` (timestamptz, when astreinte was started)
      - `heure_fin` (timestamptz, when astreinte was ended, nullable)
      - `created_at` (timestamptz, default now)
      - `user_id` (uuid)

  2. Security
    - Enable RLS on `astreinte_sessions` table
    - Add policy for anon to select/insert/update their own sessions
*/

CREATE TABLE IF NOT EXISTS astreinte_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chauffeur_id uuid NOT NULL REFERENCES chauffeurs(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  heure_debut timestamptz NOT NULL DEFAULT now(),
  heure_fin timestamptz,
  created_at timestamptz DEFAULT now(),
  user_id uuid
);

ALTER TABLE astreinte_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can select own astreinte sessions"
  ON astreinte_sessions
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert astreinte sessions"
  ON astreinte_sessions
  FOR INSERT
  TO anon
  WITH CHECK (chauffeur_id IS NOT NULL);

CREATE POLICY "Anon can update own astreinte sessions"
  ON astreinte_sessions
  FOR UPDATE
  TO anon
  USING (chauffeur_id IS NOT NULL)
  WITH CHECK (chauffeur_id IS NOT NULL);
