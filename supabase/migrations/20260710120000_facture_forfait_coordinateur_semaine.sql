-- Bug #5 : forfait coordinateur en JOUR DE SEMAINE (lun-ven).
-- Meme logique que les forfaits coordinateur samedi / dimanche deja presents
-- sur `factures`. Champs editables dans la facture de retrocession, defaut 150.
alter table factures
  add column if not exists nb_jours_coordinateur_semaine integer default 0,
  add column if not exists forfait_coordinateur_semaine  numeric default 150;
