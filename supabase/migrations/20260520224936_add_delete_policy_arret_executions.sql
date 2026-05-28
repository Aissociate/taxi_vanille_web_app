/*
  # Add DELETE policy for arret_executions

  1. Security
    - Add DELETE policy on `arret_executions` for authenticated users who own the record
    - Enables cascade deletion when removing lignes
*/

CREATE POLICY "Users can delete own arret executions"
  ON arret_executions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
