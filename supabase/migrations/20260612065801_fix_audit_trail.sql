/*
  # Fix audit trail for mobile (anon) writes + missing audit triggers
*/

CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

  BEGIN
    INSERT INTO public.logs (action, entite, entite_id, details, user_id, user_email, old_data, new_data, source)
    VALUES (v_action, TG_TABLE_NAME, v_entity_id, v_details, v_user_id, v_user_email, v_old_data, v_new_data, v_source);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.audit_log_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_log_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_log_trigger() FROM authenticated;

ALTER TABLE public.kilometrage ADD COLUMN IF NOT EXISTS user_id uuid;

DROP TRIGGER IF EXISTS audit_trigger_kilometrage ON public.kilometrage;
CREATE TRIGGER audit_trigger_kilometrage
  AFTER INSERT OR UPDATE OR DELETE ON public.kilometrage
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS audit_trigger_astreintes ON public.astreintes;
CREATE TRIGGER audit_trigger_astreintes
  AFTER INSERT OR UPDATE OR DELETE ON public.astreintes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS audit_trigger_astreinte_sessions ON public.astreinte_sessions;
CREATE TRIGGER audit_trigger_astreinte_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.astreinte_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
