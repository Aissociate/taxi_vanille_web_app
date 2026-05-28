/*
  # Bug Tracking & Development Proposals System

  1. New Tables
    - `bugs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `titre` (text) - short title for the bug
      - `description` (text) - detailed note about the bug
      - `screenshot_url` (text) - base64 or URL of annotated screenshot
      - `statut` (text) - open, in_progress, resolved, closed
      - `priorite` (text) - low, medium, high, critical
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `bug_responses`
      - `id` (uuid, primary key)
      - `bug_id` (uuid, references bugs)
      - `user_id` (uuid, references auth.users)
      - `message` (text) - dev response content
      - `is_dev` (boolean) - whether this is from a developer
      - `created_at` (timestamptz)

    - `dev_proposals`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `titre` (text) - proposal title
      - `description` (text) - proposal details
      - `statut` (text) - proposed, planned, in_progress, done, rejected
      - `created_at` (timestamptz)

    - `proposal_votes`
      - `id` (uuid, primary key)
      - `proposal_id` (uuid, references dev_proposals)
      - `user_id` (uuid, references auth.users)
      - `vote` (integer) - +1 or -1
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Authenticated users can create bugs and vote
    - Users can view all bugs and proposals
*/

-- Bugs table
CREATE TABLE IF NOT EXISTS bugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  titre text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  screenshot_data text DEFAULT '',
  statut text NOT NULL DEFAULT 'open',
  priorite text NOT NULL DEFAULT 'medium',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bugs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all bugs"
  ON bugs FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create bugs"
  ON bugs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bugs"
  ON bugs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Bug responses table
CREATE TABLE IF NOT EXISTS bug_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id uuid NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL DEFAULT '',
  is_dev boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bug_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bug responses"
  ON bug_responses FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create bug responses"
  ON bug_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Dev proposals table
CREATE TABLE IF NOT EXISTS dev_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  titre text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  statut text NOT NULL DEFAULT 'proposed',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dev_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view proposals"
  ON dev_proposals FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create proposals"
  ON dev_proposals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proposals"
  ON dev_proposals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Proposal votes table
CREATE TABLE IF NOT EXISTS proposal_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES dev_proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  vote integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(proposal_id, user_id)
);

ALTER TABLE proposal_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view votes"
  ON proposal_votes FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can cast votes"
  ON proposal_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON proposal_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON proposal_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
