-- Intervisibilite directeurs : tout utilisateur authentifie (directeur/coordinateur web)
-- voit et modifie l'ensemble des donnees de l'organisation, plus de cloisonnement par user_id.
-- Les policies "anon" (appli mobile chauffeurs) restent inchangees : filtrage cote appli.
-- Appliquee en prod le 2026-06-30 via MCP supabase ; ce fichier la trace dans le repo.

-- ============ CHAUFFEURS ============
DROP POLICY IF EXISTS "Users can view own chauffeurs"   ON public.chauffeurs;
DROP POLICY IF EXISTS "Users can update own chauffeurs" ON public.chauffeurs;
DROP POLICY IF EXISTS "Users can delete own chauffeurs" ON public.chauffeurs;
CREATE POLICY "Auth can view all chauffeurs"   ON public.chauffeurs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can update all chauffeurs" ON public.chauffeurs FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can delete all chauffeurs" ON public.chauffeurs FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ COURSES (SELECT seul a corriger, le reste est deja ouvert) ============
DROP POLICY IF EXISTS "Users can view own courses" ON public.courses;
CREATE POLICY "Auth can view all courses" ON public.courses FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ CLIENTS ============
DROP POLICY IF EXISTS "Users can view own clients"   ON public.clients;
DROP POLICY IF EXISTS "Users can update own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete own clients" ON public.clients;
CREATE POLICY "Auth can view all clients"   ON public.clients FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can update all clients" ON public.clients FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can delete all clients" ON public.clients FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ LIGNES ============
DROP POLICY IF EXISTS "Users can view own lignes"   ON public.lignes;
DROP POLICY IF EXISTS "Users can update own lignes" ON public.lignes;
DROP POLICY IF EXISTS "Users can delete own lignes" ON public.lignes;
CREATE POLICY "Auth can view all lignes"   ON public.lignes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can update all lignes" ON public.lignes FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can delete all lignes" ON public.lignes FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ ASTREINTES ============
DROP POLICY IF EXISTS "Users can view own astreintes"   ON public.astreintes;
DROP POLICY IF EXISTS "Users can update own astreintes" ON public.astreintes;
DROP POLICY IF EXISTS "Users can delete own astreintes" ON public.astreintes;
CREATE POLICY "Auth can view all astreintes"   ON public.astreintes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can update all astreintes" ON public.astreintes FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can delete all astreintes" ON public.astreintes FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
