/*
  # Fiche chauffeur : lien avec le véhicule

  Ajoute le type de lien entre le chauffeur et son véhicule, demandé en recette :
  propriétaire, locataire, locataire crédit-bail, ou loué à Taxi Vanille.
  Valeurs applicatives : proprietaire | locataire | credit_bail | loue_tv.
*/

ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS vehicule_type_lien text;

COMMENT ON COLUMN chauffeurs.vehicule_type_lien IS
  'Lien du chauffeur avec son vehicule: proprietaire, locataire, credit_bail, loue_tv (loue a Taxi Vanille).';
