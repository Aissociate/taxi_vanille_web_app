/*
  # Allow anonymous insert on courses for coordinator replacements

  1. Security Changes
    - Add INSERT policy for anon role on `courses` table
    - Required because coordinators operate with anon sessions and need to create replacement courses

  2. Notes
    - The existing "Anon can update courses" policy already allows updates
    - This aligns insert permissions with the existing update policy
*/

CREATE POLICY "Anon can insert courses"
  ON courses
  FOR INSERT
  TO anon
  WITH CHECK (true);