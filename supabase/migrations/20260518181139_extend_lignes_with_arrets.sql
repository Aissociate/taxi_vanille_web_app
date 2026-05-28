/*
  # Extension du module Lignes & Routes

  1. Modifications table `lignes`
    - `code` (text) - Code court de la ligne (L3, L4, CHM, etc.)
    - `couleur` (text) - Couleur d'affichage (hex)
    - `sens_am` (text) - Sens du matin (ex: → Mamoudzou)
    - `sens_pm` (text) - Sens de l'après-midi (ex: → Bouéni)
    - `nb_arrets` (integer) - Nombre d'arrêts

  2. Nouvelle table
    - `ligne_arrets` - Points GPS des arrêts d'une ligne
      - `ligne_id`, `nom`, `latitude`, `longitude`, `ordre`

  3. Sécurité
    - RLS sur la nouvelle table
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lignes' AND column_name = 'code') THEN
    ALTER TABLE lignes ADD COLUMN code text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lignes' AND column_name = 'couleur') THEN
    ALTER TABLE lignes ADD COLUMN couleur text DEFAULT '#000000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lignes' AND column_name = 'sens_am') THEN
    ALTER TABLE lignes ADD COLUMN sens_am text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lignes' AND column_name = 'sens_pm') THEN
    ALTER TABLE lignes ADD COLUMN sens_pm text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lignes' AND column_name = 'nb_arrets') THEN
    ALTER TABLE lignes ADD COLUMN nb_arrets integer DEFAULT 0;
  END IF;
END $$;

-- Table des arrêts GPS
CREATE TABLE IF NOT EXISTS ligne_arrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne_id uuid REFERENCES lignes(id) ON DELETE CASCADE NOT NULL,
  nom text NOT NULL DEFAULT '',
  latitude numeric DEFAULT 0,
  longitude numeric DEFAULT 0,
  ordre integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE ligne_arrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ligne arrets"
  ON ligne_arrets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ligne arrets"
  ON ligne_arrets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ligne arrets"
  ON ligne_arrets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ligne arrets"
  ON ligne_arrets FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
