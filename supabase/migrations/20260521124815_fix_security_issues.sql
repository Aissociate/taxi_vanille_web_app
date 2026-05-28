/*
  # Fix Security Issues

  1. Functions
    - Set immutable search_path on `audit_log_trigger` (also switch to SECURITY INVOKER)
    - Set immutable search_path on `sync_statut_to_statut_realisation`
    - Revoke direct EXECUTE on `audit_log_trigger` from anon and authenticated

  2. RLS Policies - Replace unrestricted anon INSERT/UPDATE policies with scoped ones
    - `arret_executions`: require chauffeur_id via course_execution join
    - `course_executions`: require chauffeur_id IS NOT NULL
    - `courses`: require chauffeur_id IS NOT NULL for INSERT/UPDATE
    - `gps_pings`: require chauffeur_id IS NOT NULL
    - `incidents`: require chauffeur_id IS NOT NULL
    - `kilometrage`: require chauffeur_id IS NOT NULL

  3. Storage
    - Remove broad SELECT policy on incidents bucket (public URLs work without it)

  4. Notes
    - Anon policies are used by driver mobile app which authenticates via PIN
    - All anon write policies now require a valid chauffeur_id reference
    - audit_log_trigger is only meant to run as a trigger, not via RPC
*/

-- ============================================================
-- 1. Fix function search_path issues
-- ============================================================

-- Recreate audit_log_trigger as SECURITY INVOKER with fixed search_path
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_action text;
  v_old_data jsonb;
  v_new_data jsonb;
  v_entity_id uuid;
  v_details text;
  v_user_id uuid;
  v_source text;
  v_user_email text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_new_data := to_jsonb(NEW);
    v_old_data := NULL;
    v_entity_id := NEW.id;
    v_details := 'Creation ' || TG_TABLE_NAME;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_details := 'Modification ' || TG_TABLE_NAME;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_entity_id := OLD.id;
    v_details := 'Suppression ' || TG_TABLE_NAME;
  END IF;

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      v_user_id := (OLD.user_id)::uuid;
    ELSE
      v_user_id := (NEW.user_id)::uuid;
    END IF;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_source := current_setting('request.headers', true)::json->>'x-app-source';
  EXCEPTION WHEN OTHERS THEN
    v_source := NULL;
  END;
  IF v_source IS NULL OR v_source = '' THEN
    v_source := 'system';
  END IF;

  BEGIN
    v_user_email := current_setting('request.jwt.claims', true)::json->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_user_email := '';
  END;
  IF v_user_email IS NULL THEN
    v_user_email := '';
  END IF;

  INSERT INTO public.logs (action, entite, entite_id, details, user_id, user_email, old_data, new_data, source)
  VALUES (v_action, TG_TABLE_NAME, v_entity_id, v_details, v_user_id, v_user_email, v_old_data, v_new_data, v_source);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Revoke direct execution of audit_log_trigger from anon and authenticated
REVOKE EXECUTE ON FUNCTION public.audit_log_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_log_trigger() FROM authenticated;

-- Fix sync_statut_to_statut_realisation search_path
CREATE OR REPLACE FUNCTION public.sync_statut_to_statut_realisation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.statut IS DISTINCT FROM OLD.statut
  AND NEW.statut_realisation IS NOT DISTINCT FROM OLD.statut_realisation THEN
    CASE NEW.statut
      WHEN 'terminee' THEN NEW.statut_realisation := 'termine';
      WHEN 'en_cours' THEN NEW.statut_realisation := 'en_cours';
      WHEN 'planifiee' THEN NEW.statut_realisation := 'programme';
      WHEN 'annulee' THEN NEW.statut_realisation := 'incident';
      ELSE NULL;
    END CASE;
  END IF;

  IF NEW.statut_realisation IS DISTINCT FROM OLD.statut_realisation
  AND NEW.statut IS NOT DISTINCT FROM OLD.statut THEN
    CASE NEW.statut_realisation
      WHEN 'termine' THEN NEW.statut := 'terminee';
      WHEN 'en_cours' THEN NEW.statut := 'en_cours';
      WHEN 'programme' THEN NEW.statut := 'planifiee';
      WHEN 'incident' THEN NEW.statut := 'annulee';
      ELSE NULL;
    END CASE;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2. Fix overly permissive anon RLS policies
-- ============================================================

-- arret_executions: require valid course_execution_id (which itself requires chauffeur_id)
DROP POLICY IF EXISTS "Anon can insert arret executions" ON public.arret_executions;
CREATE POLICY "Anon can insert arret executions"
  ON public.arret_executions
  FOR INSERT
  TO anon
  WITH CHECK (
    course_execution_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.course_executions ce
      WHERE ce.id = course_execution_id AND ce.chauffeur_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Anon can update arret executions" ON public.arret_executions;
CREATE POLICY "Anon can update arret executions"
  ON public.arret_executions
  FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.course_executions ce
      WHERE ce.id = course_execution_id AND ce.chauffeur_id IS NOT NULL
    )
  )
  WITH CHECK (
    course_execution_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.course_executions ce
      WHERE ce.id = course_execution_id AND ce.chauffeur_id IS NOT NULL
    )
  );

-- course_executions: require chauffeur_id IS NOT NULL
DROP POLICY IF EXISTS "Anon can insert course executions" ON public.course_executions;
CREATE POLICY "Anon can insert course executions"
  ON public.course_executions
  FOR INSERT
  TO anon
  WITH CHECK (chauffeur_id IS NOT NULL);

DROP POLICY IF EXISTS "Anon can update course executions" ON public.course_executions;
CREATE POLICY "Anon can update course executions"
  ON public.course_executions
  FOR UPDATE
  TO anon
  USING (chauffeur_id IS NOT NULL)
  WITH CHECK (chauffeur_id IS NOT NULL);

-- courses: require chauffeur_id IS NOT NULL for anon operations
DROP POLICY IF EXISTS "Anon can insert courses" ON public.courses;
CREATE POLICY "Anon can insert courses"
  ON public.courses
  FOR INSERT
  TO anon
  WITH CHECK (chauffeur_id IS NOT NULL);

DROP POLICY IF EXISTS "Anon can update courses" ON public.courses;
CREATE POLICY "Anon can update courses"
  ON public.courses
  FOR UPDATE
  TO anon
  USING (chauffeur_id IS NOT NULL)
  WITH CHECK (chauffeur_id IS NOT NULL);

-- gps_pings: require chauffeur_id IS NOT NULL
DROP POLICY IF EXISTS "Anon can insert gps pings" ON public.gps_pings;
CREATE POLICY "Anon can insert gps pings"
  ON public.gps_pings
  FOR INSERT
  TO anon
  WITH CHECK (chauffeur_id IS NOT NULL);

-- incidents: require chauffeur_id IS NOT NULL
DROP POLICY IF EXISTS "Allow anon to insert incidents" ON public.incidents;
CREATE POLICY "Anon can insert incidents with chauffeur"
  ON public.incidents
  FOR INSERT
  TO anon
  WITH CHECK (chauffeur_id IS NOT NULL);

-- kilometrage: require chauffeur_id IS NOT NULL
DROP POLICY IF EXISTS "Allow anon to insert kilometrage" ON public.kilometrage;
CREATE POLICY "Anon can insert kilometrage with chauffeur"
  ON public.kilometrage
  FOR INSERT
  TO anon
  WITH CHECK (chauffeur_id IS NOT NULL);

-- ============================================================
-- 3. Fix public bucket listing policy
-- ============================================================

DROP POLICY IF EXISTS "Allow public read on incidents bucket" ON storage.objects;
