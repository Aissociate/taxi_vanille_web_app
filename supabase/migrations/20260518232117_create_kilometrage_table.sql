/*
  # Create kilometrage (mileage) tracking table

  1. New Tables
    - `kilometrage`
      - `id` (uuid, primary key)
      - `chauffeur_id` (uuid, references chauffeurs)
      - `km_value` (integer, the mileage reading)
      - `type` (text, either 'debut_mois' or 'fin_mois')
      - `mois` (text, format 'YYYY-MM' to identify which month)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `kilometrage` table
    - Allow anon insert (drivers are not using Supabase Auth)
    - Allow anon select (drivers need to check if they already submitted)

  3. Notes
    - Drivers must submit start-of-month mileage on first login of the month
    - Drivers must submit end-of-month mileage at end of month
    - Access to the app is blocked until mileage is entered
*/

CREATE TABLE IF NOT EXISTS kilometrage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chauffeur_id uuid NOT NULL,
  km_value integer NOT NULL,
  type text NOT NULL CHECK (type IN ('debut_mois', 'fin_mois')),
  mois text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kilometrage_unique
  ON kilometrage (chauffeur_id, type, mois);

ALTER TABLE kilometrage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon to insert kilometrage"
  ON kilometrage
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to select kilometrage"
  ON kilometrage
  FOR SELECT
  TO anon
  USING (true);
