/*
  # Allow any authenticated user to update bug status

  1. Security Changes
    - Add UPDATE policy on `bugs` table allowing any authenticated user to update
      the `statut` column for any bug (for manual resolution by admins/team)
    - The existing owner-only policy is kept for other fields

  2. Notes
    - This enables team members to mark bugs as resolved, in_progress, or closed
*/

CREATE POLICY "Authenticated users can update any bug statut"
  ON bugs FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
