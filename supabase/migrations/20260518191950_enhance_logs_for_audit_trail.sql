/*
  # Enhance logs table for full audit trail

  1. Modified Tables
    - `logs`
      - Add `user_email` (text) - Email of user who made the change
      - Add `old_data` (jsonb) - Previous state of the entity before change
      - Add `new_data` (jsonb) - New state of the entity after change
      - Add `is_undone` (boolean) - Whether this action has been reverted

  2. New Features
    - Stores complete before/after snapshots for undo capability
    - Tracks which user made each change by email
    - Supports marking logs as undone

  3. Security
    - Existing RLS policies remain in effect
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs' AND column_name = 'user_email'
  ) THEN
    ALTER TABLE logs ADD COLUMN user_email text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs' AND column_name = 'old_data'
  ) THEN
    ALTER TABLE logs ADD COLUMN old_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs' AND column_name = 'new_data'
  ) THEN
    ALTER TABLE logs ADD COLUMN new_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs' AND column_name = 'is_undone'
  ) THEN
    ALTER TABLE logs ADD COLUMN is_undone boolean DEFAULT false;
  END IF;
END $$;

-- Allow users to update their own logs (for undo marking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'logs' AND policyname = 'Users can update own logs'
  ) THEN
    CREATE POLICY "Users can update own logs"
      ON logs FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
