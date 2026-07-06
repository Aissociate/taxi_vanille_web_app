-- Prix d'un trajet centralise en base (source unique de verite).
-- Regle : heure de MAYOTTE (UTC+3 fixe) + jours feries + astreinte, et UNE seule
-- plage tarifaire (specifique a la ligne d'abord, sinon generique).
-- Corrige : feries jamais factures, incoherence de fuseau, plages en double,
-- et montant des courses terminees hors-ligne qui restait a 0 (remonte a la synchro).

-- 1) Dedoublonnage des plages globales redondantes (on garde la plage la plus large).
delete from public.tarif_plages where id in (
  'a30add01-a150-4f87-af4f-cfa3f2174833',  -- dimanche 08-19 (doublon de 05-22)
  'a1668166-346a-442e-9702-271562f32a63',  -- feries 08-19 (doublon de 05-22)
  'a85883ab-ee90-4c19-811c-3fc4b992fae0'   -- samedi 05-21 (doublon de 05-22)
);

-- 2) Fonction de tarification d'un trajet.
create or replace function public.tarif_course(
  p_date_heure timestamptz,
  p_is_astreinte boolean,
  p_ligne_id uuid
) returns numeric
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_local timestamp;
  v_dow int;
  v_date date;
  v_hhmm text;
  v_type text;
  v_tarif numeric;
begin
  if p_date_heure is null then return 0; end if;
  v_local := p_date_heure at time zone 'Indian/Mayotte';  -- heure de Mayotte
  v_date  := v_local::date;
  v_dow   := extract(dow from v_local);                   -- 0=dimanche .. 6=samedi
  v_hhmm  := to_char(v_local, 'HH24:MI');

  if coalesce(p_is_astreinte, false) then
    v_type := 'astreinte';
  elsif exists (select 1 from public.jours_feries jf where jf.date = v_date) then
    v_type := 'feries';
  elsif v_dow = 0 then v_type := 'dimanche';
  elsif v_dow = 6 then v_type := 'samedi';
  else v_type := 'lun_ven';
  end if;

  -- Une seule plage : specifique a la ligne d'abord, sinon generique.
  select tp.tarif into v_tarif
  from public.tarif_plages tp
  where tp.type_jour = v_type
    and v_hhmm >= tp.heure_debut and v_hhmm < tp.heure_fin
    and (tp.ligne_id = p_ligne_id or tp.ligne_id is null)
  order by (tp.ligne_id = p_ligne_id) desc nulls last, tp.ordre asc
  limit 1;

  return coalesce(v_tarif, 0);
end;
$$;

-- 3) Trigger : montant fixe automatiquement quand une course passe a 'termine'
--    (en ligne ET a la resynchro hors-ligne -> le montant "remonte").
create or replace function public.set_course_montant() returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.statut_realisation = 'termine' then
    new.montant := public.tarif_course(new.date_heure, coalesce(new.is_astreinte, false), new.ligne_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_course_montant on public.courses;
create trigger trg_course_montant
before insert or update on public.courses
for each row execute function public.set_course_montant();

-- 4) Recalcul des courses terminees existantes.
update public.courses
set montant = public.tarif_course(date_heure, coalesce(is_astreinte, false), ligne_id)
where statut_realisation = 'termine';
