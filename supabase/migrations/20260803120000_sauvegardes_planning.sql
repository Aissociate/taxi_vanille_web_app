-- =============================================================================
-- SAUVEGARDES AUTOMATIQUES DU PLANNING (courses, astreintes, creneaux coordinateur)
--
-- Contexte : depuis le 01/08 il n'y a plus de feuille de pointage papier, le
-- planning en base est la seule source. Une suppression en lot malheureuse
-- (ou un incident) ne doit plus pouvoir faire perdre de donnees.
--
-- Principe :
--  - `create_backup()` photographie les 3 tables du planning dans backup_rows
--    (1 ligne jsonb par enregistrement). Portee courses : date_heure >= now()-60j
--    + tout le futur (l'historique ancien reste dans `courses` et dans `logs`).
--  - pg_cron l'execute toutes les 12 h ('backup-planning-12h').
--  - Retention : 14 sauvegardes auto (7 jours) + 10 manuelles. Au-dela, purge.
--  - `restore_backup(id, mode)` restaure depuis le back office :
--       mode 'manquants' (defaut) : reinsere UNIQUEMENT les lignes disparues
--         (meme id absent de la table vivante) -> ne touche jamais l'existant.
--       mode 'ecraser' : en plus, remet les lignes existantes dans l'etat de la
--         sauvegarde (upsert). Ne supprime jamais rien.
--  - `backup_diff(id)` : apercu (par table : total sauvegarde / manquants now)
--    pour afficher une confirmation chiffree avant de restaurer.
--
-- Securite : tables en RLS lecture-authentifie ; aucune policy d'ecriture (les
-- ecritures passent par les fonctions SECURITY DEFINER). Fonctions executables
-- par `authenticated` uniquement (+ pg_cron qui tourne en superuser).
-- =============================================================================

create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null default 'auto' check (type in ('auto', 'manuel')),
  note text,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.backup_rows (
  backup_id uuid not null references public.backups(id) on delete cascade,
  table_name text not null,
  row_id uuid not null,
  row_data jsonb not null
);

create index if not exists backup_rows_backup_idx
  on public.backup_rows (backup_id, table_name);

alter table public.backups enable row level security;
alter table public.backup_rows enable row level security;

drop policy if exists "Auth can view backups" on public.backups;
create policy "Auth can view backups" on public.backups
  for select using (auth.uid() is not null);

drop policy if exists "Auth can view backup_rows" on public.backup_rows;
create policy "Auth can view backup_rows" on public.backup_rows
  for select using (auth.uid() is not null);

-- -----------------------------------------------------------------------------
create or replace function public.create_backup(p_type text default 'auto', p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_courses int; v_astreintes int; v_creneaux int;
begin
  if p_type not in ('auto', 'manuel') then
    raise exception 'type de sauvegarde invalide: %', p_type;
  end if;

  insert into backups (type, note) values (p_type, p_note) returning id into v_id;

  insert into backup_rows (backup_id, table_name, row_id, row_data)
    select v_id, 'courses', c.id, to_jsonb(c)
    from courses c
    where c.date_heure >= now() - interval '60 days';
  get diagnostics v_courses = row_count;

  insert into backup_rows (backup_id, table_name, row_id, row_data)
    select v_id, 'astreintes', a.id, to_jsonb(a) from astreintes a;
  get diagnostics v_astreintes = row_count;

  insert into backup_rows (backup_id, table_name, row_id, row_data)
    select v_id, 'coordinateur_creneaux', cc.id, to_jsonb(cc) from coordinateur_creneaux cc;
  get diagnostics v_creneaux = row_count;

  update backups
  set stats = jsonb_build_object(
    'courses', v_courses,
    'astreintes', v_astreintes,
    'coordinateur_creneaux', v_creneaux)
  where id = v_id;

  -- Retention
  delete from backups where id in (
    select id from backups where type = 'auto'
    order by created_at desc offset 14);
  delete from backups where id in (
    select id from backups where type = 'manuel'
    order by created_at desc offset 10);

  return jsonb_build_object(
    'backup_id', v_id,
    'courses', v_courses,
    'astreintes', v_astreintes,
    'coordinateur_creneaux', v_creneaux);
end $$;

-- -----------------------------------------------------------------------------
create or replace function public.backup_diff(p_backup_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'courses', jsonb_build_object(
      'total', (select count(*) from backup_rows b where b.backup_id = p_backup_id and b.table_name = 'courses'),
      'manquants', (select count(*) from backup_rows b
                    where b.backup_id = p_backup_id and b.table_name = 'courses'
                      and not exists (select 1 from courses t where t.id = b.row_id))),
    'astreintes', jsonb_build_object(
      'total', (select count(*) from backup_rows b where b.backup_id = p_backup_id and b.table_name = 'astreintes'),
      'manquants', (select count(*) from backup_rows b
                    where b.backup_id = p_backup_id and b.table_name = 'astreintes'
                      and not exists (select 1 from astreintes t where t.id = b.row_id))),
    'coordinateur_creneaux', jsonb_build_object(
      'total', (select count(*) from backup_rows b where b.backup_id = p_backup_id and b.table_name = 'coordinateur_creneaux'),
      'manquants', (select count(*) from backup_rows b
                    where b.backup_id = p_backup_id and b.table_name = 'coordinateur_creneaux'
                      and not exists (select 1 from coordinateur_creneaux t where t.id = b.row_id))));
$$;

-- -----------------------------------------------------------------------------
create or replace function public.restore_backup(p_backup_id uuid, p_mode text default 'manquants')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins_courses int := 0; v_upd_courses int := 0;
  v_ins_astr int := 0;    v_upd_astr int := 0;
  v_ins_cren int := 0;    v_upd_cren int := 0;
begin
  if auth.uid() is null then
    raise exception 'Restauration reservee aux utilisateurs connectes';
  end if;
  if p_mode not in ('manquants', 'ecraser') then
    raise exception 'mode invalide: % (attendu: manquants | ecraser)', p_mode;
  end if;
  if not exists (select 1 from backups where id = p_backup_id) then
    raise exception 'Sauvegarde introuvable';
  end if;

  -- Lignes disparues -> reinsertion a l'identique (meme id).
  insert into courses
    select (jsonb_populate_record(null::courses, b.row_data)).*
    from backup_rows b
    where b.backup_id = p_backup_id and b.table_name = 'courses'
      and not exists (select 1 from courses t where t.id = b.row_id);
  get diagnostics v_ins_courses = row_count;

  insert into astreintes
    select (jsonb_populate_record(null::astreintes, b.row_data)).*
    from backup_rows b
    where b.backup_id = p_backup_id and b.table_name = 'astreintes'
      and not exists (select 1 from astreintes t where t.id = b.row_id);
  get diagnostics v_ins_astr = row_count;

  insert into coordinateur_creneaux
    select (jsonb_populate_record(null::coordinateur_creneaux, b.row_data)).*
    from backup_rows b
    where b.backup_id = p_backup_id and b.table_name = 'coordinateur_creneaux'
      and not exists (select 1 from coordinateur_creneaux t where t.id = b.row_id);
  get diagnostics v_ins_cren = row_count;

  if p_mode = 'ecraser' then
    -- Lignes encore presentes -> remises dans l'etat de la sauvegarde.
    update courses t
    set (id, date_heure, depart, arrivee, statut, statut_planification, statut_realisation,
         montant, notes, chauffeur_id, client_id, ligne_id, coordinateur_id, periode,
         duree_minutes, is_astreinte, is_brouillon)
      = (r.id, r.date_heure, r.depart, r.arrivee, r.statut, r.statut_planification, r.statut_realisation,
         r.montant, r.notes, r.chauffeur_id, r.client_id, r.ligne_id, r.coordinateur_id, r.periode,
         r.duree_minutes, r.is_astreinte, r.is_brouillon)
    from (select (jsonb_populate_record(null::courses, b.row_data)).*
          from backup_rows b
          where b.backup_id = p_backup_id and b.table_name = 'courses') r
    where t.id = r.id;
    get diagnostics v_upd_courses = row_count;

    update astreintes t
    set (id, chauffeur_id, ligne_id, coordinateur_id, date_debut, date_fin, is_brouillon, notes)
      = (r.id, r.chauffeur_id, r.ligne_id, r.coordinateur_id, r.date_debut, r.date_fin, r.is_brouillon, r.notes)
    from (select (jsonb_populate_record(null::astreintes, b.row_data)).*
          from backup_rows b
          where b.backup_id = p_backup_id and b.table_name = 'astreintes') r
    where t.id = r.id;
    get diagnostics v_upd_astr = row_count;

    update coordinateur_creneaux t
    set (id, coordinateur_id, ligne_id, date_debut, date_fin, is_brouillon, notes)
      = (r.id, r.coordinateur_id, r.ligne_id, r.date_debut, r.date_fin, r.is_brouillon, r.notes)
    from (select (jsonb_populate_record(null::coordinateur_creneaux, b.row_data)).*
          from backup_rows b
          where b.backup_id = p_backup_id and b.table_name = 'coordinateur_creneaux') r
    where t.id = r.id;
    get diagnostics v_upd_cren = row_count;
  end if;

  return jsonb_build_object(
    'courses', jsonb_build_object('reinserees', v_ins_courses, 'ecrasees', v_upd_courses),
    'astreintes', jsonb_build_object('reinserees', v_ins_astr, 'ecrasees', v_upd_astr),
    'coordinateur_creneaux', jsonb_build_object('reinserees', v_ins_cren, 'ecrasees', v_upd_cren));
end $$;

-- Droits : personne d'autre que les comptes connectes (les fonctions sont
-- SECURITY DEFINER, la RLS des tables sous-jacentes ne s'applique pas).
revoke all on function public.create_backup(text, text) from public, anon;
revoke all on function public.backup_diff(uuid) from public, anon;
revoke all on function public.restore_backup(uuid, text) from public, anon;
grant execute on function public.create_backup(text, text) to authenticated;
grant execute on function public.backup_diff(uuid) to authenticated;
grant execute on function public.restore_backup(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Planification : toutes les 12 h (00:00 et 12:00 UTC = 03:00 / 15:00 a Mayotte).
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('backup-planning-12h');
exception when others then
  null; -- pas encore planifie
end $$;

select cron.schedule('backup-planning-12h', '0 */12 * * *',
  $$select public.create_backup('auto', null)$$);
