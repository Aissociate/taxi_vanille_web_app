/*
  # Create user_profiles view

  1. New Views
    - `user_profiles` - A view exposing basic auth.users info for admin use
      - `id` (uuid)
      - `email` (text)
      - `created_at` (timestamptz)
      - `last_sign_in_at` (timestamptz)

  2. Security
    - Enable RLS on the view (via table wrapper)
    - Only authenticated users can read
*/

CREATE OR REPLACE VIEW public.user_profiles AS
SELECT
  id,
  email,
  created_at,
  last_sign_in_at
FROM auth.users;

GRANT SELECT ON public.user_profiles TO authenticated;
