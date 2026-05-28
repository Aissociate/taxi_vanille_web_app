/*
  # Table ia_settings

  1. Nouvelle table
    - `ia_settings`
      - `id` (uuid, primary key)
      - `api_key` (text) - Cle API OpenRouter
      - `modele` (text) - Modele IA selectionne
      - `prompt_systeme` (text) - Prompt systeme par defaut
      - `user_id` (uuid) - Proprietaire
      - `created_at` (timestamptz)

  2. Securite
    - RLS active, acces restreint par utilisateur
*/

CREATE TABLE IF NOT EXISTS ia_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL DEFAULT '',
  modele text NOT NULL DEFAULT 'claude-haiku-4.5',
  prompt_systeme text NOT NULL DEFAULT '',
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ia_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ia_settings"
  ON ia_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ia_settings"
  ON ia_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ia_settings"
  ON ia_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own ia_settings"
  ON ia_settings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
