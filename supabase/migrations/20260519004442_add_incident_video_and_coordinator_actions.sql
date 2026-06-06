/*
  # Add video support to incidents and coordinator action tracking

  1. Modified Tables
    - `incidents`
      - `video_url` (text, nullable) - URL to video recorded by driver
      - `mesure_prise` (text, nullable) - action taken by coordinator (remplacement, aucune, etc.)
      - `coordinateur_id` (uuid, nullable) - coordinator who handled the incident
      - `handled_at` (timestamptz, nullable) - when the incident was handled

  2. Notes
    - Allows coordinators to track their response to incidents
    - Supports video media from drivers
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'video_url'
  ) THEN
    ALTER TABLE incidents ADD COLUMN video_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'mesure_prise'
  ) THEN
    ALTER TABLE incidents ADD COLUMN mesure_prise text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'coordinateur_id'
  ) THEN
    ALTER TABLE incidents ADD COLUMN coordinateur_id uuid REFERENCES chauffeurs(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'handled_at'
  ) THEN
    ALTER TABLE incidents ADD COLUMN handled_at timestamptz;
  END IF;
END $$;