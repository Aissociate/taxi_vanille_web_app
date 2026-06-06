/*
  # Allow anonymous select on ligne_arrets

  1. Security
    - Add SELECT policy for anon on `ligne_arrets` table
    - Needed for chauffeurs to see stop list during course execution
*/

CREATE POLICY "Anon can view ligne arrets"
  ON ligne_arrets
  FOR SELECT
  TO anon
  USING (true);
