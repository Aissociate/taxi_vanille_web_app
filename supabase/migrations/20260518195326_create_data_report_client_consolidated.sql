/*
  # Create data_report_client_consolidated table

  1. New Tables
    - `data_report_client_consolidated`
      - `id` (uuid, primary key)
      - `client_id` (uuid, FK to clients) - The client this report belongs to
      - `ligne_id` (uuid, FK to lignes) - The line being reported
      - `mois` (date) - First day of the report month
      - `titre` (text) - Report title
      - `statut` (text) - brouillon / finalise
      - `data_matin` (jsonb) - Morning daily stats (day-by-day data per stop)
      - `data_apres_midi` (jsonb) - Afternoon daily stats
      - `data_journee` (jsonb) - Full day summary stats
      - `data_trajets_matin` (jsonb) - Morning trips detail by departure time
      - `data_trajets_aprem` (jsonb) - Afternoon trips detail
      - `metadata` (jsonb) - Extra config (capacite_max, etc.)
      - `user_id` (uuid, FK to auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled with user-scoped policies
*/

CREATE TABLE IF NOT EXISTS data_report_client_consolidated (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  ligne_id uuid REFERENCES lignes(id) ON DELETE SET NULL,
  mois date NOT NULL,
  titre text NOT NULL DEFAULT '',
  statut text DEFAULT 'brouillon',
  data_matin jsonb DEFAULT '[]'::jsonb,
  data_apres_midi jsonb DEFAULT '[]'::jsonb,
  data_journee jsonb DEFAULT '[]'::jsonb,
  data_trajets_matin jsonb DEFAULT '[]'::jsonb,
  data_trajets_aprem jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE data_report_client_consolidated ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON data_report_client_consolidated FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON data_report_client_consolidated FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
  ON data_report_client_consolidated FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports"
  ON data_report_client_consolidated FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
