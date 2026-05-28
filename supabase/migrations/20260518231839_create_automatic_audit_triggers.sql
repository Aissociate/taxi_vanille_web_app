/*
  # Automatic audit logging via database triggers

  1. Modified Tables
    - `logs`
      - Add `source` (text) - Origin of the action (admin, chauffeur_app, system)
      - Add `ip_address` (text) - IP address if available

  2. New Functions
    - `audit_log_trigger()` - Generic trigger function that logs INSERT/UPDATE/DELETE
      on any table automatically with old_data/new_data snapshots

  3. New Triggers
    Applied to ALL business tables:
    - chauffeurs, clients, lignes, tarifs, courses, factures
    - alertes_config, ia_prompts, entreprise
    - chauffeur_documents, chauffeur_avances, chauffeur_kilometres
    - course_executions, arret_executions, incidents
    - tarif_plages, tarif_km, tarif_frais, tarif_courses_non_prevues
    - jours_feries, data_report_client_consolidated, ligne_arrets

  4. Important Notes
    - Triggers fire AFTER INSERT/UPDATE/DELETE
    - The trigger captures the user from auth.uid() (works for both admin and chauffeur apps)
    - old_data and new_data are stored as JSONB snapshots
    - The source is determined by checking the request header 'x-app-source'
    - The logs table itself is excluded to avoid infinite loops
*/

-- Add source column to logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs' AND column_name = 'source'
  ) THEN
    ALTER TABLE logs ADD COLUMN source text DEFAULT 'admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE logs ADD COLUMN ip_address text DEFAULT '';
  END IF;
END $$;

-- Create the generic audit trigger function
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
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
  -- Determine action
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

  -- Get current user
  v_user_id := auth.uid();

  -- If no authenticated user (e.g. service role), try to get from record
  IF v_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      v_user_id := (OLD.user_id)::uuid;
    ELSE
      v_user_id := (NEW.user_id)::uuid;
    END IF;
  END IF;

  -- Skip if we still have no user_id (cannot insert without it due to FK)
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Determine source from request headers (set by client apps)
  BEGIN
    v_source := current_setting('request.headers', true)::json->>'x-app-source';
  EXCEPTION WHEN OTHERS THEN
    v_source := NULL;
  END;
  IF v_source IS NULL OR v_source = '' THEN
    v_source := 'system';
  END IF;

  -- Try to get user email from JWT
  BEGIN
    v_user_email := current_setting('request.jwt.claims', true)::json->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_user_email := '';
  END;
  IF v_user_email IS NULL THEN
    v_user_email := '';
  END IF;

  -- Insert the log entry
  INSERT INTO logs (action, entite, entite_id, details, user_id, user_email, old_data, new_data, source)
  VALUES (v_action, TG_TABLE_NAME, v_entity_id, v_details, v_user_id, v_user_email, v_old_data, v_new_data, v_source);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to create audit trigger on a table (idempotent)
CREATE OR REPLACE FUNCTION create_audit_trigger(target_table text)
RETURNS void AS $$
DECLARE
  trigger_name text;
BEGIN
  trigger_name := 'audit_trigger_' || target_table;

  -- Drop existing trigger if any
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, target_table);

  -- Create new trigger
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger()',
    trigger_name, target_table
  );
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to all business tables
SELECT create_audit_trigger('chauffeurs');
SELECT create_audit_trigger('clients');
SELECT create_audit_trigger('lignes');
SELECT create_audit_trigger('tarifs');
SELECT create_audit_trigger('courses');
SELECT create_audit_trigger('factures');
SELECT create_audit_trigger('alertes_config');
SELECT create_audit_trigger('ia_prompts');
SELECT create_audit_trigger('entreprise');
SELECT create_audit_trigger('chauffeur_documents');
SELECT create_audit_trigger('chauffeur_avances');
SELECT create_audit_trigger('chauffeur_kilometres');
SELECT create_audit_trigger('course_executions');
SELECT create_audit_trigger('arret_executions');
SELECT create_audit_trigger('incidents');
SELECT create_audit_trigger('tarif_plages');
SELECT create_audit_trigger('tarif_km');
SELECT create_audit_trigger('tarif_frais');
SELECT create_audit_trigger('tarif_courses_non_prevues');
SELECT create_audit_trigger('jours_feries');
SELECT create_audit_trigger('data_report_client_consolidated');
SELECT create_audit_trigger('ligne_arrets');
SELECT create_audit_trigger('ia_settings');

-- Clean up helper function (no longer needed at runtime)
DROP FUNCTION IF EXISTS create_audit_trigger(text);
