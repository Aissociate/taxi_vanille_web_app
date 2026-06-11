/*
  # Facturation integrity
*/

DO $$
DECLARE
  v_dups int;
BEGIN
  SELECT count(*) INTO v_dups
  FROM (
    SELECT chauffeur_id, mois_reference
    FROM public.factures
    WHERE chauffeur_id IS NOT NULL AND mois_reference IS NOT NULL
    GROUP BY chauffeur_id, mois_reference
    HAVING count(*) > 1
  ) d;

  IF v_dups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_factures_chauffeur_mois
      ON public.factures (chauffeur_id, mois_reference)
      WHERE chauffeur_id IS NOT NULL AND mois_reference IS NOT NULL;
  ELSE
    RAISE WARNING 'uq_factures_chauffeur_mois NOT created: % duplicate (chauffeur, mois) pairs exist in factures. Clean them up then create the index manually.', v_dups;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.payer_facture(p_facture_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_fac public.factures%ROWTYPE;
  v_av RECORD;
  v_restant numeric;
  v_demande numeric;
BEGIN
  SELECT * INTO v_fac
  FROM public.factures
  WHERE id = p_facture_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'facture_introuvable';
  END IF;

  IF v_fac.statut = 'payee' THEN
    RAISE EXCEPTION 'facture_deja_payee';
  END IF;

  v_demande := coalesce(v_fac.remboursement_avance, 0);
  v_restant := v_demande;

  IF v_fac.chauffeur_id IS NOT NULL AND v_restant > 0 THEN
    FOR v_av IN
      SELECT id, montant
      FROM public.chauffeur_avances
      WHERE chauffeur_id = v_fac.chauffeur_id
        AND statut = 'en_cours'
      ORDER BY date_avance ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_restant <= 0;
      IF v_av.montant <= v_restant THEN
        UPDATE public.chauffeur_avances
        SET montant = 0, statut = 'rembourse'
        WHERE id = v_av.id;
        v_restant := v_restant - v_av.montant;
      ELSE
        UPDATE public.chauffeur_avances
        SET montant = montant - v_restant
        WHERE id = v_av.id;
        v_restant := 0;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.factures SET statut = 'payee' WHERE id = p_facture_id;

  RETURN jsonb_build_object(
    'facture_id', p_facture_id,
    'avance_demandee', v_demande,
    'avance_imputee', v_demande - v_restant,
    'avance_non_imputee', v_restant
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payer_facture(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payer_facture(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.payer_facture(uuid) TO authenticated;
