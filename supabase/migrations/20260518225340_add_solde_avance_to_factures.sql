/*
  # Ajout du solde avances sur les factures

  1. Modifications table `factures`
    - `solde_avance_avant` (numeric) - Solde des avances du chauffeur AVANT remboursement
    - `solde_avance_apres` (numeric) - Solde des avances du chauffeur APRES remboursement

  2. Notes
    - Quand la facture passe au statut "payee", le remboursement_avance
      est impute sur les avances en cours du chauffeur
    - Le solde avant/apres est stocke sur la facture pour tracabilite
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'solde_avance_avant') THEN
    ALTER TABLE factures ADD COLUMN solde_avance_avant numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'solde_avance_apres') THEN
    ALTER TABLE factures ADD COLUMN solde_avance_apres numeric DEFAULT 0;
  END IF;
END $$;
