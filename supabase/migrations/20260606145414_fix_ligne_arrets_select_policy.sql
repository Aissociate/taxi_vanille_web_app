DROP POLICY IF EXISTS "Users can view own ligne arrets" ON ligne_arrets;
CREATE POLICY "authenticated_select_all_ligne_arrets" ON ligne_arrets FOR SELECT
  TO authenticated USING (true);