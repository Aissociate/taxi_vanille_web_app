-- Roles des utilisateurs du back office (ticket "Role des utilisateurs",
-- 17/09/2026) :
--   administrateur : tous les droits
--   exploitation   : dashboard, planning, statistiques, developpement,
--                    incidents, carte GPS, chauffeurs en lecture
--   facturation    : dashboard, carte GPS, chauffeurs, clients, facturation,
--                    stats par ligne, planning en lecture
--   gerant         : dashboard, planning en lecture, carte GPS, chauffeurs en
--                    lecture, clients, facturation en lecture, stats par ligne
--                    en lecture
--
-- Un compte SANS ligne ici reste administrateur : personne n'est enferme dehors
-- le jour de la mise en ligne. Seul un administrateur peut attribuer un role.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('administrateur', 'exploitation', 'facturation', 'gerant')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.user_roles enable row level security;

-- Role effectif de l'utilisateur connecte (administrateur par defaut).
create or replace function public.mon_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'administrateur');
$$;

grant execute on function public.mon_role() to authenticated;

drop policy if exists "user_roles lecture" on public.user_roles;
create policy "user_roles lecture" on public.user_roles
  for select to authenticated using (true);

drop policy if exists "user_roles ecriture admin" on public.user_roles;
create policy "user_roles ecriture admin" on public.user_roles
  for all to authenticated
  using (public.mon_role() = 'administrateur')
  with check (public.mon_role() = 'administrateur');

-- Aucun role n'est attribue d'office : l'administrateur les pose depuis
-- Parametrage > Utilisateurs, pour ne couper l'acces de personne par surprise.
