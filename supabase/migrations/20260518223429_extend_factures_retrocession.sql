/*
  # Extension factures pour retrocession chauffeurs

  1. Modifications table `factures`
    - `chauffeur_id` (uuid, FK) - Le chauffeur emetteur de la facture
    - `mois_reference` (date) - Mois de reference de la facture
    - `nb_trajets_normaux` (integer) - Nombre de trajets normaux
    - `tarif_trajet_normal` (numeric) - Tarif unitaire trajet normal
    - `nb_trajets_astreinte` (integer) - Nombre de trajets en astreinte
    - `tarif_trajet_astreinte` (numeric) - Tarif unitaire astreinte
    - `nb_heures_astreinte` (numeric) - Heures d'astreinte
    - `tarif_heure_astreinte` (numeric) - Tarif horaire astreinte
    - `location_vehicule` (boolean) - Location de vehicule activee
    - `tarif_location` (numeric) - Montant location
    - `frais_gestion` (boolean) - Frais de gestion actifs (defaut: oui)
    - `tarif_frais_gestion` (numeric) - Montant frais de gestion
    - `km_debut_mois` (numeric) - Km debut de mois
    - `km_fin_mois` (numeric) - Km fin de mois
    - `seuil_km` (numeric) - Seuil km avant depassement
    - `tarif_km_depassement` (numeric) - Prix par km de surplus
    - `montant_depassement_km` (numeric) - Montant calcule du depassement
    - `lignes_supplementaires` (jsonb) - Lignes libres [{libelle, quantite, montant}]
    - `remboursement_avance` (numeric) - Montant d'avance remboursee
    - `net_a_payer` (numeric) - Net a payer final

  2. Notes
    - La facture est emise PAR le chauffeur VERS Taxi Vanille
    - Statuts Kanban: brouillon, recue, validee, payee
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'chauffeur_id') THEN
    ALTER TABLE factures ADD COLUMN chauffeur_id uuid REFERENCES chauffeurs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'mois_reference') THEN
    ALTER TABLE factures ADD COLUMN mois_reference date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'nb_trajets_normaux') THEN
    ALTER TABLE factures ADD COLUMN nb_trajets_normaux integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'tarif_trajet_normal') THEN
    ALTER TABLE factures ADD COLUMN tarif_trajet_normal numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'nb_trajets_astreinte') THEN
    ALTER TABLE factures ADD COLUMN nb_trajets_astreinte integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'tarif_trajet_astreinte') THEN
    ALTER TABLE factures ADD COLUMN tarif_trajet_astreinte numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'nb_heures_astreinte') THEN
    ALTER TABLE factures ADD COLUMN nb_heures_astreinte numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'tarif_heure_astreinte') THEN
    ALTER TABLE factures ADD COLUMN tarif_heure_astreinte numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'location_vehicule') THEN
    ALTER TABLE factures ADD COLUMN location_vehicule boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'tarif_location') THEN
    ALTER TABLE factures ADD COLUMN tarif_location numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'frais_gestion') THEN
    ALTER TABLE factures ADD COLUMN frais_gestion boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'tarif_frais_gestion') THEN
    ALTER TABLE factures ADD COLUMN tarif_frais_gestion numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'km_debut_mois') THEN
    ALTER TABLE factures ADD COLUMN km_debut_mois numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'km_fin_mois') THEN
    ALTER TABLE factures ADD COLUMN km_fin_mois numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'seuil_km') THEN
    ALTER TABLE factures ADD COLUMN seuil_km numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'tarif_km_depassement') THEN
    ALTER TABLE factures ADD COLUMN tarif_km_depassement numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'montant_depassement_km') THEN
    ALTER TABLE factures ADD COLUMN montant_depassement_km numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'lignes_supplementaires') THEN
    ALTER TABLE factures ADD COLUMN lignes_supplementaires jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'remboursement_avance') THEN
    ALTER TABLE factures ADD COLUMN remboursement_avance numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'net_a_payer') THEN
    ALTER TABLE factures ADD COLUMN net_a_payer numeric DEFAULT 0;
  END IF;
END $$;
