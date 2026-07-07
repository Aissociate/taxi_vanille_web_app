-- Trou tarifaire avant 05:00 : les plages "matin" demarraient a 05:00, or les
-- premiers departs sont a 04:40 (voire plus tot) -> ces courses etaient tarifees 0.
-- On etend le debut de chaque plage du matin a 00:00 (couverture totale, tarif jour).
update public.tarif_plages set heure_debut = '00:00' where id in (
  '675b3baa-fd99-4a6b-adec-b9fa906abf40',
  'd64bf825-908e-4ddd-b74b-77813134a2b8',
  'dc61c85f-b713-4fd6-9dfb-4c7d3b6605ba',
  'dcef3a12-c708-4463-b411-2effaa4de153',
  'c659fd33-e055-40c7-b778-380371a71d48'
);

-- Recalcul des courses terminees avec la grille etendue.
update public.courses
set montant = public.tarif_course(date_heure, coalesce(is_astreinte, false), ligne_id)
where statut_realisation = 'termine';