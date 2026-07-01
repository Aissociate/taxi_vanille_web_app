-- Intervisibilite directeurs (suite et fin) : la migration 20260630120000 n'avait
-- couvert que chauffeurs/courses/clients/lignes/astreintes (+ ligne_arrets le 01/07).
-- Restaient cloisonnees par auth.uid() = user_id (SELECT/UPDATE/DELETE) : les tarifs,
-- factures, jours feries, logs, entreprise, parametres IA, alertes, rapports
-- consolides, executions... -> un directeur ne voyait pas les donnees d'un autre et
-- ses ecritures tombaient sur 0 ligne en silence (tarifs vides a la facturation,
-- montant mobile a 0, etc.). On aligne tout sur le modele org-wide.
-- INSERT reste en auth.uid() = user_id (stampe le createur). Policies anon inchangees.
-- Ajout: lecture anon de tarif_plages pour que l'appli mobile calcule le montant.
-- Appliquee en prod le 2026-07-02 via MCP supabase ; ce fichier la trace dans le repo.

-- Helper: on drop les policies per-user (SELECT/UPDATE/DELETE) et on recree org-wide.

-- ============ TARIF_PLAGES ============
DROP POLICY IF EXISTS "Users can view own tarif_plages"   ON public.tarif_plages;
DROP POLICY IF EXISTS "Users can update own tarif_plages" ON public.tarif_plages;
DROP POLICY IF EXISTS "Users can delete own tarif_plages" ON public.tarif_plages;
CREATE POLICY "Auth view all tarif_plages"   ON public.tarif_plages FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all tarif_plages" ON public.tarif_plages FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all tarif_plages" ON public.tarif_plages FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
-- L'appli mobile (anon) doit lire les tarifs pour calculer le montant a la cloture.
DROP POLICY IF EXISTS "Anon can view tarif_plages" ON public.tarif_plages;
CREATE POLICY "Anon can view tarif_plages" ON public.tarif_plages FOR SELECT TO anon USING (true);

-- ============ TARIF_FRAIS ============
DROP POLICY IF EXISTS "Users can view own tarif_frais"   ON public.tarif_frais;
DROP POLICY IF EXISTS "Users can update own tarif_frais" ON public.tarif_frais;
DROP POLICY IF EXISTS "Users can delete own tarif_frais" ON public.tarif_frais;
CREATE POLICY "Auth view all tarif_frais"   ON public.tarif_frais FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all tarif_frais" ON public.tarif_frais FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all tarif_frais" ON public.tarif_frais FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ TARIF_KM ============
DROP POLICY IF EXISTS "Users can view own tarif_km"   ON public.tarif_km;
DROP POLICY IF EXISTS "Users can update own tarif_km" ON public.tarif_km;
DROP POLICY IF EXISTS "Users can delete own tarif_km" ON public.tarif_km;
CREATE POLICY "Auth view all tarif_km"   ON public.tarif_km FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all tarif_km" ON public.tarif_km FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all tarif_km" ON public.tarif_km FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ TARIF_COURSES_NON_PREVUES ============
DROP POLICY IF EXISTS "Users can view own tarif_courses_non_prevues"   ON public.tarif_courses_non_prevues;
DROP POLICY IF EXISTS "Users can update own tarif_courses_non_prevues" ON public.tarif_courses_non_prevues;
DROP POLICY IF EXISTS "Users can delete own tarif_courses_non_prevues" ON public.tarif_courses_non_prevues;
CREATE POLICY "Auth view all tarif_cnp"   ON public.tarif_courses_non_prevues FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all tarif_cnp" ON public.tarif_courses_non_prevues FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all tarif_cnp" ON public.tarif_courses_non_prevues FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ FACTURES ============
DROP POLICY IF EXISTS "Users can view own factures"   ON public.factures;
DROP POLICY IF EXISTS "Users can update own factures" ON public.factures;
DROP POLICY IF EXISTS "Users can delete own factures" ON public.factures;
CREATE POLICY "Auth view all factures"   ON public.factures FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all factures" ON public.factures FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all factures" ON public.factures FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ ENTREPRISE ============
DROP POLICY IF EXISTS "Users can view own entreprise"   ON public.entreprise;
DROP POLICY IF EXISTS "Users can update own entreprise" ON public.entreprise;
CREATE POLICY "Auth view all entreprise"   ON public.entreprise FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all entreprise" ON public.entreprise FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ JOURS_FERIES ============
DROP POLICY IF EXISTS "Users can view own jours_feries"   ON public.jours_feries;
DROP POLICY IF EXISTS "Users can update own jours_feries" ON public.jours_feries;
DROP POLICY IF EXISTS "Users can delete own jours_feries" ON public.jours_feries;
CREATE POLICY "Auth view all jours_feries"   ON public.jours_feries FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all jours_feries" ON public.jours_feries FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all jours_feries" ON public.jours_feries FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ IA_SETTINGS ============
DROP POLICY IF EXISTS "Users can view own ia_settings"   ON public.ia_settings;
DROP POLICY IF EXISTS "Users can update own ia_settings" ON public.ia_settings;
DROP POLICY IF EXISTS "Users can delete own ia_settings" ON public.ia_settings;
CREATE POLICY "Auth view all ia_settings"   ON public.ia_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all ia_settings" ON public.ia_settings FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all ia_settings" ON public.ia_settings FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ IA_PROMPTS ============
DROP POLICY IF EXISTS "Users can view own prompts"   ON public.ia_prompts;
DROP POLICY IF EXISTS "Users can update own prompts" ON public.ia_prompts;
DROP POLICY IF EXISTS "Users can delete own prompts" ON public.ia_prompts;
CREATE POLICY "Auth view all ia_prompts"   ON public.ia_prompts FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all ia_prompts" ON public.ia_prompts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all ia_prompts" ON public.ia_prompts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ ALERTES_CONFIG ============
DROP POLICY IF EXISTS "Users can view own alertes"   ON public.alertes_config;
DROP POLICY IF EXISTS "Users can update own alertes" ON public.alertes_config;
DROP POLICY IF EXISTS "Users can delete own alertes" ON public.alertes_config;
CREATE POLICY "Auth view all alertes"   ON public.alertes_config FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all alertes" ON public.alertes_config FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all alertes" ON public.alertes_config FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ LOGS (audit partage) ============
DROP POLICY IF EXISTS "Users can view own logs"   ON public.logs;
DROP POLICY IF EXISTS "Users can update own logs" ON public.logs;
CREATE POLICY "Auth view all logs"   ON public.logs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all logs" ON public.logs FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ DATA_REPORT_CLIENT_CONSOLIDATED ============
DROP POLICY IF EXISTS "Users can view own reports"   ON public.data_report_client_consolidated;
DROP POLICY IF EXISTS "Users can update own reports" ON public.data_report_client_consolidated;
DROP POLICY IF EXISTS "Users can delete own reports" ON public.data_report_client_consolidated;
CREATE POLICY "Auth view all reports"   ON public.data_report_client_consolidated FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all reports" ON public.data_report_client_consolidated FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all reports" ON public.data_report_client_consolidated FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ COURSE_EXECUTIONS (le web back-office doit voir les executions mobiles) ============
DROP POLICY IF EXISTS "Users can view own course executions"   ON public.course_executions;
DROP POLICY IF EXISTS "Users can update own course executions" ON public.course_executions;
CREATE POLICY "Auth view all course executions"   ON public.course_executions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all course executions" ON public.course_executions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ ARRET_EXECUTIONS (idem + suppression a la suppression de ligne) ============
DROP POLICY IF EXISTS "Users can view own arret executions"   ON public.arret_executions;
DROP POLICY IF EXISTS "Users can update own arret executions" ON public.arret_executions;
DROP POLICY IF EXISTS "Users can delete own arret executions" ON public.arret_executions;
CREATE POLICY "Auth view all arret executions"   ON public.arret_executions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update all arret executions" ON public.arret_executions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete all arret executions" ON public.arret_executions FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ DEV_PROPOSALS (statut modifiable par tout directeur) ============
DROP POLICY IF EXISTS "Users can update own proposals" ON public.dev_proposals;
CREATE POLICY "Auth update all proposals" ON public.dev_proposals FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
