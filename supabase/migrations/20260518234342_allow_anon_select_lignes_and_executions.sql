/*
  # Allow anonymous select on lignes and course_executions

  1. Security
    - Add SELECT policy for anon on `lignes` table (read-only, needed for course details)
    - Add SELECT policy for anon on `course_executions` table (read-only, needed for course status)
    - Required because login uses PIN-based auth, not Supabase auth
*/

CREATE POLICY "Anon can view lignes"
  ON lignes
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can view course executions"
  ON course_executions
  FOR SELECT
  TO anon
  USING (true);
