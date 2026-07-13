-- Astreinte facturee au FORFAIT (par astreinte realisee) au lieu des heures :
-- l'app mobile confirme l'astreinte en un clic (duree ~0), donc on ne facture
-- plus a l'heure mais un forfait par astreinte confirmee sur le mois.
alter table public.factures
  add column if not exists nb_astreintes integer not null default 0,
  add column if not exists forfait_astreinte numeric not null default 0;

-- Cle tarif configurable "forfait_astreinte" (montant paye par astreinte realisee).
insert into public.tarif_frais (cle, valeur, periode, actif, description, user_id)
select 'forfait_astreinte', 50, 'astreinte', true,
       'Montant paye au chauffeur par astreinte realisee (forfait, remplace le tarif horaire)',
       (select user_id from public.tarif_frais where user_id is not null limit 1)
where not exists (select 1 from public.tarif_frais where cle = 'forfait_astreinte');
