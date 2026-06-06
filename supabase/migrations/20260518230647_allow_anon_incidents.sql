/*
  # Allow anonymous access to incidents table

  1. Security Changes
    - Add INSERT policy for `anon` role on `incidents` table
    - Add SELECT policy for `anon` role on `incidents` table
    - Required because drivers authenticate via code/pin, not Supabase Auth

  2. Notes
    - Drivers need to submit and view their own incidents without Supabase Auth session
*/

CREATE POLICY "Allow anon to insert incidents"
  ON incidents
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to select incidents"
  ON incidents
  FOR SELECT
  TO anon
  USING (true);
