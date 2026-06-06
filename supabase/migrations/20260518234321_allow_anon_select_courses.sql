/*
  # Allow anonymous select on courses by chauffeur_id

  1. Security
    - Add SELECT policy for anon role on `courses` table
    - Allows reading courses filtered by chauffeur_id (app handles filtering)
    - Required because login uses PIN-based auth, not Supabase auth
*/

CREATE POLICY "Anon can view courses"
  ON courses
  FOR SELECT
  TO anon
  USING (true);
