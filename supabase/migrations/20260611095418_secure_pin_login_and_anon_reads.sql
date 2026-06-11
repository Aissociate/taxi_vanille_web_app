/*
  # Secure PIN login and anon reads
*/

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_code_time
  ON public.login_attempts (code, attempted_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.chauffeur_login(p_code text, p_pin text, p_role text DEFAULT 'chauffeur')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
  v_failed int;
  v_row public.chauffeurs%ROWTYPE;
BEGIN
  IF v_code = '' OR length(v_code) > 20 OR coalesce(p_pin, '') !~ '^[0-9]{4}$' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_failed
  FROM public.login_attempts
  WHERE code = v_code
    AND success = false
    AND attempted_at > now() - interval '15 minutes';

  IF v_failed >= 5 THEN
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  IF p_role = 'coordinateur' THEN
    SELECT * INTO v_row
    FROM public.chauffeurs
    WHERE code = v_code
      AND pin_android = p_pin
      AND is_coordinateur = true
      AND statut = 'actif'
    LIMIT 1;
  ELSE
    SELECT * INTO v_row
    FROM public.chauffeurs
    WHERE code = v_code
      AND pin = p_pin
      AND statut = 'actif'
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO public.login_attempts (code, success) VALUES (v_code, false);
    RETURN NULL;
  END IF;

  INSERT INTO public.login_attempts (code, success) VALUES (v_code, true);

  DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '7 days';

  RETURN to_jsonb(v_row) - 'pin' - 'pin_android';
END;
$$;

REVOKE ALL ON FUNCTION public.chauffeur_login(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chauffeur_login(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.chauffeur_login(text, text, text) TO authenticated;

DROP POLICY IF EXISTS "Allow anon to verify login credentials" ON public.chauffeurs;

CREATE POLICY "Anon can view chauffeurs basic info"
  ON public.chauffeurs
  FOR SELECT
  TO anon
  USING (true);

REVOKE SELECT ON public.chauffeurs FROM anon;
GRANT SELECT (
  id,
  code,
  nom,
  prenom,
  telephone,
  statut,
  is_coordinateur,
  ligne_id,
  vehicule_immatriculation,
  vehicule_places,
  user_id,
  created_at
) ON public.chauffeurs TO anon;

DROP POLICY IF EXISTS "Anon can view gps pings" ON public.gps_pings;

CREATE POLICY "Authenticated can view gps pings"
  ON public.gps_pings
  FOR SELECT
  TO authenticated
  USING (true);
