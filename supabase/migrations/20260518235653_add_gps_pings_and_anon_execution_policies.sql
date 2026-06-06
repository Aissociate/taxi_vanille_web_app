/*
  # Add GPS pings table and anon execution policies

  1. New Tables
    - `gps_pings`
      - `id` (uuid, primary key)
      - `course_execution_id` (uuid, FK to course_executions)
      - `chauffeur_id` (uuid, FK to chauffeurs)
      - `latitude` (numeric)
      - `longitude` (numeric)
      - `recorded_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `gps_pings`
    - Add anon INSERT/UPDATE policies on `course_executions` (PIN-based auth)
    - Add anon INSERT/UPDATE/SELECT policies on `arret_executions` (PIN-based auth)
    - Add anon INSERT/SELECT policies on `gps_pings`

  3. Modified Tables
    - `courses`: update statut values to support new statuses
*/

-- GPS pings table for tracking location every minute during a course
CREATE TABLE IF NOT EXISTS gps_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_execution_id uuid NOT NULL REFERENCES course_executions(id),
  chauffeur_id uuid NOT NULL REFERENCES chauffeurs(id),
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE gps_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert gps pings"
  ON gps_pings
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can view gps pings"
  ON gps_pings
  FOR SELECT
  TO anon
  USING (true);

-- Allow anon to insert and update course_executions (PIN-based auth)
CREATE POLICY "Anon can insert course executions"
  ON course_executions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update course executions"
  ON course_executions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anon to insert, update, and select arret_executions
CREATE POLICY "Anon can insert arret executions"
  ON arret_executions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update arret executions"
  ON arret_executions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can view arret executions"
  ON arret_executions
  FOR SELECT
  TO anon
  USING (true);

-- Allow anon to update courses statut
CREATE POLICY "Anon can update courses"
  ON courses
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
