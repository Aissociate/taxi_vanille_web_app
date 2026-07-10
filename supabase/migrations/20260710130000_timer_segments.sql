-- App "Taxi Vanille Timer" : table ISOLEE mesurant les temps de passage entre
-- arrets (segments Start/Stop). AUCUNE incidence sur planning/facturation :
-- aucun trigger, aucun montant, referencee nulle part ailleurs que dans le
-- back-office "Timer". FK vers courses en cascade delete uniquement.
create table if not exists public.timer_segments (
  id uuid primary key default gen_random_uuid(),
  course_id        uuid references public.courses(id) on delete cascade,
  ligne_id         uuid,
  chauffeur_id     uuid,
  arret_depart_id  uuid,
  arret_arrivee_id uuid,
  ordre            integer,
  heure_start      timestamptz not null,
  heure_stop       timestamptz,
  duree_secondes   integer,
  jour             date,
  user_id          uuid,
  created_at       timestamptz default now()
);

alter table public.timer_segments enable row level security;

-- App Timer = client anonyme (comme l'app chauffeur) : insert/update si chauffeur_id.
create policy "Anon can insert timer segments" on public.timer_segments
  for insert to anon with check (chauffeur_id is not null);
create policy "Anon can view timer segments" on public.timer_segments
  for select to anon using (true);
create policy "Anon can update timer segments" on public.timer_segments
  for update to anon using (chauffeur_id is not null) with check (chauffeur_id is not null);
-- Back-office (directeurs authentifies) : lecture + gestion.
create policy "Auth view timer segments" on public.timer_segments
  for select to authenticated using (auth.uid() is not null);
create policy "Auth manage timer segments" on public.timer_segments
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

create index if not exists idx_timer_segments_ligne on public.timer_segments(ligne_id);
create index if not exists idx_timer_segments_chauffeur on public.timer_segments(chauffeur_id);
create index if not exists idx_timer_segments_jour on public.timer_segments(jour);
