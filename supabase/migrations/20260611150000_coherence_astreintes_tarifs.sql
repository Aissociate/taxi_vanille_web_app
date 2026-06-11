/*
  # Coherence fixes: astreintes & tarifs km

  1. Astreintes
    - The director plans astreintes in the `astreintes` table, but the driver
      app only reacted to `courses.is_astreinte` — planned astreintes never
      reached the field. Add an anon SELECT policy (non-draft rows only) so the
      driver app can read its planned astreintes.
    - Add `astreinte_sessions.astreinte_id` to link a realized session back to
      the planned astreinte (nullable: sessions can still be started ad hoc).

  2. Tarifs km
    - FacturationPage reads the `seuil_km` and `tarif_km_depassement` keys from
      `tarif_frais` but no UI ever created them — seed them (inactive-neutral
      defaults) so the settings page can edit them.
*/

-- ============================================================
-- 1. Astreintes: driver app can read planned (non-draft) astreintes
-- ============================================================

DROP POLICY IF EXISTS "Anon can view published astreintes" ON public.astreintes;
CREATE POLICY "Anon can view published astreintes"
  ON public.astreintes
  FOR SELECT
  TO anon
  USING (is_brouillon IS DISTINCT FROM true);

-- Link realized sessions to the planned astreinte
ALTER TABLE public.astreinte_sessions
  ADD COLUMN IF NOT EXISTS astreinte_id uuid REFERENCES public.astreintes(id) ON DELETE SET NULL;

-- ============================================================
-- 2. Seed missing tarif_frais keys used by FacturationPage
-- ============================================================

INSERT INTO public.tarif_frais (cle, valeur, periode, actif, user_id)
SELECT 'seuil_km', 0, 'mois', true, u.user_id
FROM (SELECT user_id FROM public.tarif_frais LIMIT 1) u
WHERE NOT EXISTS (SELECT 1 FROM public.tarif_frais WHERE cle = 'seuil_km');

INSERT INTO public.tarif_frais (cle, valeur, periode, actif, user_id)
SELECT 'tarif_km_depassement', 0, 'km', true, u.user_id
FROM (SELECT user_id FROM public.tarif_frais LIMIT 1) u
WHERE NOT EXISTS (SELECT 1 FROM public.tarif_frais WHERE cle = 'tarif_km_depassement');
