/*
  # Schema Tarification

  1. Nouvelles tables
    - `tarif_plages` - Plages horaires tarifaires par type de jour
      - `id`, `type_jour` (lun_ven, samedi, dimanche, feries, astreinte)
      - `heure_debut`, `heure_fin`, `libelle`, `tarif`, `ordre`
    - `tarif_frais` - Frais de gestion (forfait location, frais mensuels, etc.)
      - `id`, `cle` (identifiant unique du parametre), `valeur`, `actif`, `periode`, `description`
    - `tarif_km` - Tranches kilometriques
      - `id`, `km_de`, `km_a`, `tarif_km`, `ordre`
    - `tarif_courses_non_prevues` - Config supplement courses non prevues
      - `id`, `actif`, `supplement_par_trajet`

  2. Securite
    - RLS sur toutes les tables
*/

-- Plages horaires
CREATE TABLE IF NOT EXISTS tarif_plages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_jour text NOT NULL DEFAULT 'lun_ven',
  heure_debut text NOT NULL DEFAULT '05:00',
  heure_fin text NOT NULL DEFAULT '07:00',
  libelle text NOT NULL DEFAULT '',
  tarif numeric NOT NULL DEFAULT 0,
  ordre integer DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tarif_plages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tarif_plages"
  ON tarif_plages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tarif_plages"
  ON tarif_plages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tarif_plages"
  ON tarif_plages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own tarif_plages"
  ON tarif_plages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Frais de gestion
CREATE TABLE IF NOT EXISTS tarif_frais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cle text NOT NULL DEFAULT '',
  valeur numeric NOT NULL DEFAULT 0,
  periode text DEFAULT '',
  actif boolean DEFAULT true,
  description text DEFAULT '',
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tarif_frais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tarif_frais"
  ON tarif_frais FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tarif_frais"
  ON tarif_frais FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tarif_frais"
  ON tarif_frais FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own tarif_frais"
  ON tarif_frais FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Supplements kilometriques
CREATE TABLE IF NOT EXISTS tarif_km (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  km_de numeric NOT NULL DEFAULT 0,
  km_a numeric DEFAULT NULL,
  tarif numeric NOT NULL DEFAULT 0,
  ordre integer DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tarif_km ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tarif_km"
  ON tarif_km FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tarif_km"
  ON tarif_km FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tarif_km"
  ON tarif_km FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own tarif_km"
  ON tarif_km FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Courses non prevues
CREATE TABLE IF NOT EXISTS tarif_courses_non_prevues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actif boolean DEFAULT false,
  supplement_par_trajet numeric DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tarif_courses_non_prevues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tarif_courses_non_prevues"
  ON tarif_courses_non_prevues FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tarif_courses_non_prevues"
  ON tarif_courses_non_prevues FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tarif_courses_non_prevues"
  ON tarif_courses_non_prevues FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own tarif_courses_non_prevues"
  ON tarif_courses_non_prevues FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
