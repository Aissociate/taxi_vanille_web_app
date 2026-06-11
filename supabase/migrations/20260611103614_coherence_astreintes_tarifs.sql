/*
  # Coherence fixes: astreintes & tarifs km
*/

DROP POLICY IF EXISTS "Anon can view published astreintes" ON public.astreintes;
CREATE POLICY "Anon can view published astreintes"
  ON public.astreintes
  FOR SELECT
  TO anon
  USING (is_brouillon IS DISTINCT FROM true);

ALTER TABLE public.astreinte_sessions
  ADD COLUMN IF NOT EXISTS astreinte_id uuid REFERENCES public.astreintes(id) ON DELETE SET NULL;

INSERT INTO public.tarif_frais (cle, valeur, periode, actif, user_id)
SELECT 'seuil_km', 0, 'mois', true, u.user_id
FROM (SELECT user_id FROM public.tarif_frais LIMIT 1) u
WHERE NOT EXISTS (SELECT 1 FROM public.tarif_frais WHERE cle = 'seuil_km');

INSERT INTO public.tarif_frais (cle, valeur, periode, actif, user_id)
SELECT 'tarif_km_depassement', 0, 'km', true, u.user_id
FROM (SELECT user_id FROM public.tarif_frais LIMIT 1) u
WHERE NOT EXISTS (SELECT 1 FROM public.tarif_frais WHERE cle = 'tarif_km_depassement');
