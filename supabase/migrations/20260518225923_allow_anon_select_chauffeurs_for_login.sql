/*
  # Allow anonymous login verification on chauffeurs

  1. Security Changes
    - Add a SELECT policy for `anon` role on `chauffeurs` table
    - This allows the login form to verify code + pin without requiring prior authentication
    - Only code and pin columns are used for matching; the app only fetches the row that matches both

  2. Notes
    - This is required because the app uses a code/pin login flow rather than Supabase Auth
    - The existing authenticated policies remain unchanged
*/

CREATE POLICY "Allow anon to verify login credentials"
  ON chauffeurs
  FOR SELECT
  TO anon
  USING (true);
