/*
  # Add astreinte_session_id to gps_pings

  1. Modified Tables
    - `gps_pings`
      - Add `astreinte_session_id` (uuid, nullable, FK to astreinte_sessions)
      - Make `course_execution_id` nullable (pings can be from astreinte OR course)

  2. Notes
    - A gps ping is linked to either a course_execution or an astreinte_session
    - Existing data remains intact since course_execution_id becomes nullable
*/

-- Make course_execution_id nullable for astreinte pings
ALTER TABLE gps_pings ALTER COLUMN course_execution_id DROP NOT NULL;

-- Add astreinte_session_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gps_pings' AND column_name = 'astreinte_session_id'
  ) THEN
    ALTER TABLE gps_pings ADD COLUMN astreinte_session_id uuid REFERENCES astreinte_sessions(id);
  END IF;
END $$;
