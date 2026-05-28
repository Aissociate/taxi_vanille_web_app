/*
  # Create proposal responses table

  1. New Tables
    - `proposal_responses`
      - `id` (uuid, primary key)
      - `proposal_id` (uuid, foreign key to dev_proposals)
      - `user_id` (uuid, foreign key to auth.users)
      - `message` (text, the response content)
      - `is_dev` (boolean, whether this is a dev response)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `proposal_responses` table
    - Policy for authenticated users to read all responses
    - Policy for authenticated users to insert their own responses
*/

CREATE TABLE IF NOT EXISTS proposal_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES dev_proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL DEFAULT '',
  is_dev boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE proposal_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read proposal responses"
  ON proposal_responses
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert own proposal responses"
  ON proposal_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
