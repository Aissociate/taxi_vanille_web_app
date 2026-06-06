/*
  # Create incidents and course execution tables

  1. New Tables
    - `incidents`
      - `id` (uuid, primary key)
      - `course_id` (uuid, FK to courses)
      - `chauffeur_id` (uuid, FK to chauffeurs)
      - `type` (text) - accident, panne, retard, voie_bloquee, passager_refuse, securite, meteo, client_absent, autre
      - `description` (text)
      - `photo_url` (text, nullable)
      - `audio_url` (text, nullable)
      - `latitude` (numeric, nullable)
      - `longitude` (numeric, nullable)
      - `created_at` (timestamptz)
      - `user_id` (uuid, FK to auth.users)

    - `course_executions`
      - `id` (uuid, primary key)
      - `course_id` (uuid, FK to courses)
      - `chauffeur_id` (uuid, FK to chauffeurs)
      - `statut` (text) - planifie, en_cours, termine, synchroniser
      - `heure_debut` (timestamptz, nullable)
      - `heure_fin` (timestamptz, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `user_id` (uuid, FK to auth.users)

    - `arret_executions`
      - `id` (uuid, primary key)
      - `course_execution_id` (uuid, FK to course_executions)
      - `arret_id` (uuid, FK to ligne_arrets)
      - `ordre` (integer)
      - `montants` (integer) - passengers boarding
      - `descendants` (integer) - passengers alighting
      - `heure_arrivee` (timestamptz, nullable)
      - `heure_depart` (timestamptz, nullable)
      - `statut` (text) - en_attente, en_cours, termine
      - `created_at` (timestamptz)
      - `user_id` (uuid, FK to auth.users)

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

-- Incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id),
  chauffeur_id uuid NOT NULL REFERENCES chauffeurs(id),
  type text NOT NULL DEFAULT 'autre',
  description text DEFAULT '',
  photo_url text DEFAULT '',
  audio_url text DEFAULT '',
  latitude numeric DEFAULT 0,
  longitude numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own incidents"
  ON incidents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own incidents"
  ON incidents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Course executions table
CREATE TABLE IF NOT EXISTS course_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  chauffeur_id uuid NOT NULL REFERENCES chauffeurs(id),
  statut text DEFAULT 'planifie',
  heure_debut timestamptz,
  heure_fin timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);

ALTER TABLE course_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own course executions"
  ON course_executions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own course executions"
  ON course_executions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own course executions"
  ON course_executions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Arret executions table
CREATE TABLE IF NOT EXISTS arret_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_execution_id uuid NOT NULL REFERENCES course_executions(id),
  arret_id uuid NOT NULL REFERENCES ligne_arrets(id),
  ordre integer DEFAULT 0,
  montants integer DEFAULT 0,
  descendants integer DEFAULT 0,
  heure_arrivee timestamptz,
  heure_depart timestamptz,
  statut text DEFAULT 'en_attente',
  created_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);

ALTER TABLE arret_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own arret executions"
  ON arret_executions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own arret executions"
  ON arret_executions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own arret executions"
  ON arret_executions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
