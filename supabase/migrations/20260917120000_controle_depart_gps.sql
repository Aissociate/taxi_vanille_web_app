-- Controle des demarrages de trajet a distance du point de depart
-- (ticket "Appli chauffeur" du 17/09/2026 : des chauffeurs demarrent le trajet
-- alors qu'ils ne sont pas sur place).
--
-- Aucune modification de l'appli chauffeur : l'appli envoie deja sa position
-- (gps_pings, rattachee a l'execution du trajet). Pour chaque trajet demarre,
-- on prend le point GPS le plus proche de l'heure de demarrage (a 3 minutes au
-- plus) et on mesure la distance a l'arret de depart de la course.
--
-- Arret de depart : nom identique, sinon nom qui commence par / contient le
-- depart saisi (ex. "VAHIBE" -> "VAHIBE CHENDRA"). S'il reste introuvable, on
-- mesure a l'arret le plus proche de la ligne (controle plus tolerant, signale
-- par arret_reconnu = false). Les arrets sans coordonnees (0, 0) sont ignores.
--
-- SECURITY INVOKER : la fonction ne voit que ce que la RLS laisse voir a
-- l'utilisateur connecte (back office).

create or replace function public.controle_depart_gps(
  p_debut timestamptz,
  p_fin timestamptz,
  p_ligne_id uuid default null
)
returns table (
  course_id uuid,
  execution_id uuid,
  chauffeur_id uuid,
  ligne_id uuid,
  date_heure timestamptz,
  heure_debut timestamptz,
  depart text,
  arrivee text,
  arret_reference text,
  arret_reconnu boolean,
  distance_km numeric,
  ecart_position_min numeric,
  latitude numeric,
  longitude numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with ex as (
    select e.id as execution_id, e.heure_debut, c.id as course_id, c.chauffeur_id, c.ligne_id,
           c.date_heure, c.depart, c.arrivee
    from course_executions e
    join courses c on c.id = e.course_id
    where e.heure_debut >= p_debut and e.heure_debut < p_fin
      and (p_ligne_id is null or c.ligne_id = p_ligne_id)
  ),
  pos as (
    select distinct on (ex.execution_id) ex.*, g.latitude, g.longitude,
           abs(extract(epoch from (g.recorded_at - ex.heure_debut))) / 60 as ecart_min
    from ex
    join gps_pings g on g.course_execution_id = ex.execution_id
    where g.recorded_at between ex.heure_debut - interval '3 minutes' and ex.heure_debut + interval '3 minutes'
      and g.latitude <> 0 and g.longitude <> 0
    order by ex.execution_id, abs(extract(epoch from (g.recorded_at - ex.heure_debut)))
  ),
  mesure as (
    select pos.*, ref.nom as arret_nom, ref.reconnu,
           2 * 6371 * asin(sqrt(
             power(sin(radians(ref.latitude - pos.latitude) / 2), 2)
             + cos(radians(pos.latitude)) * cos(radians(ref.latitude))
             * power(sin(radians(ref.longitude - pos.longitude) / 2), 2)
           )) as km
    from pos
    cross join lateral (
      select a.nom, a.latitude, a.longitude, true as reconnu
      from ligne_arrets a
      where a.ligne_id = pos.ligne_id and a.latitude <> 0 and a.longitude <> 0
        and pos.depart is not null and trim(pos.depart) <> ''
        and (lower(trim(a.nom)) = lower(trim(pos.depart))
          or a.nom ilike trim(pos.depart) || '%'
          or a.nom ilike '%' || trim(pos.depart) || '%')
      order by (lower(trim(a.nom)) = lower(trim(pos.depart))) desc,
               (a.nom ilike trim(pos.depart) || '%') desc,
               a.ordre
      limit 1
    ) ref
    union all
    select pos.*, near.nom, false,
           near.km
    from pos
    cross join lateral (
      select a.nom,
             2 * 6371 * asin(sqrt(
               power(sin(radians(a.latitude - pos.latitude) / 2), 2)
               + cos(radians(pos.latitude)) * cos(radians(a.latitude))
               * power(sin(radians(a.longitude - pos.longitude) / 2), 2)
             )) as km
      from ligne_arrets a
      where a.ligne_id = pos.ligne_id and a.latitude <> 0 and a.longitude <> 0
      order by 2
      limit 1
    ) near
    where not exists (
      select 1 from ligne_arrets a
      where a.ligne_id = pos.ligne_id and a.latitude <> 0 and a.longitude <> 0
        and pos.depart is not null and trim(pos.depart) <> ''
        and (lower(trim(a.nom)) = lower(trim(pos.depart))
          or a.nom ilike trim(pos.depart) || '%'
          or a.nom ilike '%' || trim(pos.depart) || '%')
    )
  )
  select course_id, execution_id, chauffeur_id, ligne_id, date_heure, heure_debut, depart, arrivee,
         arret_nom, reconnu, round(km::numeric, 2), round(ecart_min::numeric, 1), latitude, longitude
  from mesure
  order by km desc;
$$;

grant execute on function public.controle_depart_gps(timestamptz, timestamptz, uuid) to authenticated;
