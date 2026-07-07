-- Facturation / statistiques PAR LIGNE : overlay des saisies manuelles.
--
-- Les lignes de base (1 ligne = 1 depart programme du jour) sont TOUJOURS
-- recalculees depuis `courses` / `course_executions`. Cette table ne stocke QUE
-- les cellules modifiees a la main (override par cellule) et les lignes ajoutees
-- manuellement. Hors edition, on retrouve donc les donnees reelles NON modifiees
-- des chauffeurs ; seules les cellules saisies gardent la valeur editee.
create table if not exists public.stat_ligne_overrides (
  id uuid primary key default gen_random_uuid(),
  ligne_id uuid not null references public.lignes(id) on delete cascade,
  jour date not null,                 -- jour calendaire de Mayotte (YYYY-MM-DD)
  row_key text not null,              -- 'c:<course_id>' (base) ou 'm:<uuid>' (ajout manuel)
  champ text not null,                -- id du champ, ou '__deleted' / '__manual'
  valeur text,                        -- valeur saisie (texte, interpretee selon le type du champ)
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ligne_id, jour, row_key, champ)
);

create index if not exists stat_ligne_overrides_ligne_jour_idx
  on public.stat_ligne_overrides (ligne_id, jour);

alter table public.stat_ligne_overrides enable row level security;

-- Visibilite org-wide pour les directeurs authentifies (meme modele que `courses`).
drop policy if exists "Auth view stat_ligne_overrides" on public.stat_ligne_overrides;
create policy "Auth view stat_ligne_overrides"
  on public.stat_ligne_overrides for select
  to authenticated using (auth.uid() is not null);

drop policy if exists "Auth insert stat_ligne_overrides" on public.stat_ligne_overrides;
create policy "Auth insert stat_ligne_overrides"
  on public.stat_ligne_overrides for insert
  to authenticated with check (auth.uid() is not null);

drop policy if exists "Auth update stat_ligne_overrides" on public.stat_ligne_overrides;
create policy "Auth update stat_ligne_overrides"
  on public.stat_ligne_overrides for update
  to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "Auth delete stat_ligne_overrides" on public.stat_ligne_overrides;
create policy "Auth delete stat_ligne_overrides"
  on public.stat_ligne_overrides for delete
  to authenticated using (auth.uid() is not null);
