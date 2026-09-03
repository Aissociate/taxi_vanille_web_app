// Valeurs par defaut des frais mensuels, partagees entre l'ecran
// Parametres > Tarifs et le formulaire de facture.
//
// Ticket "Facturation : frais de gestion" : l'ecran Tarifs affichait 30 EUR
// alors qu'AUCUNE ligne "frais_gestion" n'existait en base (le montant n'a
// jamais ete enregistre, c'etait une simple valeur d'affichage). La facture,
// elle, cherchait la ligne en base et retombait donc sur 0. Les deux ecrans
// lisent maintenant la meme constante tant que la direction n'a pas saisi son
// propre montant.
export const TARIF_DEFAUTS = {
  frais_gestion: 30,
  forfait_location: 180,
  seuil_km: 0,
  tarif_km_depassement: 0,
} as const;

export type CleTarifFrais = keyof typeof TARIF_DEFAUTS;

/** Valeur enregistree si elle existe, sinon la valeur par defaut affichee partout. */
export function valeurTarif(
  frais: { cle: string; valeur: number }[] | undefined | null,
  cle: CleTarifFrais,
): number {
  const row = (frais || []).find(f => f.cle === cle);
  return row ? row.valeur : TARIF_DEFAUTS[cle];
}
