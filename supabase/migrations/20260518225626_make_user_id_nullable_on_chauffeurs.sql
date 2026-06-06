/*
  # Make user_id nullable on chauffeurs

  1. Modified Tables
    - `chauffeurs`
      - `user_id` column changed from NOT NULL to nullable
  
  2. Reason
    - Allows creating test/admin driver accounts without a linked auth user
    - The app login uses code + pin directly, not auth.uid()
*/

ALTER TABLE chauffeurs ALTER COLUMN user_id DROP NOT NULL;
