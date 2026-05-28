/*
  # Taxi Vanille - Schema initial

  1. Nouvelles tables
    - `entreprise` - Paramètres de l'entreprise (nom, adresse, SIRET, etc.)
    - `chauffeurs` - Liste des chauffeurs (nom, prénom, téléphone, permis, statut)
    - `clients` - Liste des clients (nom, prénom, téléphone, email, adresse)
    - `lignes` - Lignes/itinéraires de transport
    - `tarifs` - Grille tarifaire
    - `courses` - Courses/trajets effectués ou planifiés
    - `factures` - Facturation
    - `alertes_config` - Configuration des alertes
    - `ia_prompts` - Configuration IA et prompts
    - `logs` - Journal d'activité

  2. Sécurité
    - RLS activé sur toutes les tables
    - Policies pour utilisateurs authentifiés
*/

-- Entreprise settings
CREATE TABLE IF NOT EXISTS entreprise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL DEFAULT '',
  adresse text DEFAULT '',
  telephone text DEFAULT '',
  email text DEFAULT '',
  siret text DEFAULT '',
  logo_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE entreprise ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entreprise"
  ON entreprise FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entreprise"
  ON entreprise FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entreprise"
  ON entreprise FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Chauffeurs
CREATE TABLE IF NOT EXISTS chauffeurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  prenom text NOT NULL,
  telephone text DEFAULT '',
  email text DEFAULT '',
  numero_permis text DEFAULT '',
  date_embauche date DEFAULT CURRENT_DATE,
  statut text DEFAULT 'actif',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE chauffeurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chauffeurs"
  ON chauffeurs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chauffeurs"
  ON chauffeurs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chauffeurs"
  ON chauffeurs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chauffeurs"
  ON chauffeurs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  prenom text NOT NULL DEFAULT '',
  telephone text DEFAULT '',
  email text DEFAULT '',
  adresse text DEFAULT '',
  societe text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clients"
  ON clients FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own clients"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clients"
  ON clients FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own clients"
  ON clients FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Lignes (itinéraires)
CREATE TABLE IF NOT EXISTS lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  depart text NOT NULL,
  arrivee text NOT NULL,
  distance_km numeric DEFAULT 0,
  duree_minutes integer DEFAULT 0,
  description text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lignes"
  ON lignes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lignes"
  ON lignes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lignes"
  ON lignes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lignes"
  ON lignes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Tarifs
CREATE TABLE IF NOT EXISTS tarifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  type text DEFAULT 'fixe',
  prix_base numeric DEFAULT 0,
  prix_km numeric DEFAULT 0,
  prix_minute numeric DEFAULT 0,
  ligne_id uuid REFERENCES lignes(id) ON DELETE SET NULL,
  description text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE tarifs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tarifs"
  ON tarifs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tarifs"
  ON tarifs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tarifs"
  ON tarifs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tarifs"
  ON tarifs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_heure timestamptz NOT NULL DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  chauffeur_id uuid REFERENCES chauffeurs(id) ON DELETE SET NULL,
  ligne_id uuid REFERENCES lignes(id) ON DELETE SET NULL,
  tarif_id uuid REFERENCES tarifs(id) ON DELETE SET NULL,
  depart text DEFAULT '',
  arrivee text DEFAULT '',
  statut text DEFAULT 'planifiee',
  montant numeric DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own courses"
  ON courses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own courses"
  ON courses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own courses"
  ON courses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own courses"
  ON courses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Factures
CREATE TABLE IF NOT EXISTS factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  date_emission date DEFAULT CURRENT_DATE,
  date_echeance date,
  montant_ht numeric DEFAULT 0,
  tva numeric DEFAULT 0,
  montant_ttc numeric DEFAULT 0,
  statut text DEFAULT 'brouillon',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own factures"
  ON factures FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own factures"
  ON factures FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own factures"
  ON factures FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own factures"
  ON factures FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Alertes config
CREATE TABLE IF NOT EXISTS alertes_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  type text DEFAULT 'info',
  condition_texte text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE alertes_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alertes"
  ON alertes_config FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alertes"
  ON alertes_config FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alertes"
  ON alertes_config FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own alertes"
  ON alertes_config FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- IA Prompts
CREATE TABLE IF NOT EXISTS ia_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  prompt text DEFAULT '',
  categorie text DEFAULT 'general',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE ia_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prompts"
  ON ia_prompts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prompts"
  ON ia_prompts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prompts"
  ON ia_prompts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own prompts"
  ON ia_prompts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Logs
CREATE TABLE IF NOT EXISTS logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entite text DEFAULT '',
  entite_id uuid,
  details text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL
);

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs"
  ON logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs"
  ON logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
