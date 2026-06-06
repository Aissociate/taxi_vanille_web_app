-- Fix: authenticated users (admins) should see ALL incidents, not just their own
DROP POLICY IF EXISTS "Users can view own incidents" ON incidents;
CREATE POLICY "Authenticated can view all incidents" ON incidents
  FOR SELECT TO authenticated USING (true);

-- Fix: authenticated users should be able to update any incident (for coordinators)
DROP POLICY IF EXISTS "Users can update own incidents" ON incidents;
CREATE POLICY "Authenticated can update incidents" ON incidents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Also allow anon to update incidents (for coordinator mobile app)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'incidents' AND policyname = 'Anon can update incidents') THEN
    CREATE POLICY "Anon can update incidents" ON incidents
      FOR UPDATE TO anon USING (chauffeur_id IS NOT NULL) WITH CHECK (chauffeur_id IS NOT NULL);
  END IF;
END $$;
