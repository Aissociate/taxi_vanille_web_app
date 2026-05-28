/*
  # Extension du module Chauffeurs

  1. Modifications table `chauffeurs`
    - `code` (text) - Code interne (D1, D2, etc.)
    - `adresse` (text) - Adresse postale
    - `facturation_type` (text) - Type de facturation (hebdomadaire, mensuelle, etc.)
    - `nif_siret` (text) - Numéro fiscal
    - `vehicule_immatriculation` (text)
    - `vehicule_places` (integer) - Nombre de places du véhicule
    - `ligne_id` (uuid) - Ligne affectée
    - `pin` (text) - Code PIN

  2. Nouvelles tables
    - `chauffeur_documents` - Documents administratifs uploadés
    - `chauffeur_avances` - Avances et acomptes sur salaire
    - `chauffeur_kilometres` - Kilométrage mensuel déclaré

  3. Sécurité
    - RLS sur toutes les nouvelles tables
*/

-- Extend chauffeurs table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'code') THEN
    ALTER TABLE chauffeurs ADD COLUMN code text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'adresse') THEN
    ALTER TABLE chauffeurs ADD COLUMN adresse text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'facturation_type') THEN
    ALTER TABLE chauffeurs ADD COLUMN facturation_type text DEFAULT 'hebdomadaire';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'nif_siret') THEN
    ALTER TABLE chauffeurs ADD COLUMN nif_siret text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'vehicule_immatriculation') THEN
    ALTER TABLE chauffeurs ADD COLUMN vehicule_immatriculation text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'vehicule_places') THEN
    ALTER TABLE chauffeurs ADD COLUMN vehicule_places integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'ligne_id') THEN
    ALTER TABLE chauffeurs ADD COLUMN ligne_id uuid REFERENCES lignes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chauffeurs' AND column_name = 'pin') THEN
    ALTER TABLE chauffeurs ADD COLUMN pin text DEFAULT '';
  END IF;
END $$;

-- Documents administratifs
CREATE TABLE IF NOT EXISTS chauffeur_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chauffeur_id uuid REFERENCES chauffeurs(id) ON DELETE CASCADE NOT NULL,
  nom text NOT NULL,
  type text DEFAULT 'document',
  url text NOT NULL,
  taille integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE chauffeur_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chauffeur documents"
  ON chauffeur_documents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chauffeur documents"
  ON chauffeur_documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chauffeur documents"
  ON chauffeur_documents FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Avances et acomptes
CREATE TABLE IF NOT EXISTS chauffeur_avances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chauffeur_id uuid REFERENCES chauffeurs(id) ON DELETE CASCADE NOT NULL,
  montant numeric NOT NULL DEFAULT 0,
  date_avance date DEFAULT CURRENT_DATE,
  motif text DEFAULT '',
  statut text DEFAULT 'en_cours',
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE chauffeur_avances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chauffeur avances"
  ON chauffeur_avances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chauffeur avances"
  ON chauffeur_avances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chauffeur avances"
  ON chauffeur_avances FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chauffeur avances"
  ON chauffeur_avances FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Kilométrage mensuel
CREATE TABLE IF NOT EXISTS chauffeur_kilometres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chauffeur_id uuid REFERENCES chauffeurs(id) ON DELETE CASCADE NOT NULL,
  mois date NOT NULL,
  km_debut numeric DEFAULT 0,
  km_fin numeric DEFAULT 0,
  km_total numeric DEFAULT 0,
  statut text DEFAULT 'non_declare',
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE chauffeur_kilometres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chauffeur kilometres"
  ON chauffeur_kilometres FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chauffeur kilometres"
  ON chauffeur_kilometres FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chauffeur kilometres"
  ON chauffeur_kilometres FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chauffeur kilometres"
  ON chauffeur_kilometres FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
