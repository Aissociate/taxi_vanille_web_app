-- Facturation sous-traitant : modele demande par la DAF (mails du 18/08/2026,
-- pieces jointes "C4 Ligne 4 07 2026 TOUMBOU.pdf" et "C4 ... Factures_CADEMA_2026.pdf").
--
-- 1. DETTES ETALEES. Une dette (ex. "dette moteur" de 1 500 EUR) se rembourse
--    par echeances mensuelles (500 EUR sur mai, juillet, aout). Les avances
--    existantes (`chauffeur_avances`) restent la saisie ponctuelle : ici on veut
--    un echeancier planifie a l'avance, impute automatiquement sur la facture du
--    mois et trace (quelle facture a solde quelle echeance).
-- 2. Champs manquants sur la facture pour reproduire le recap mensuel C4 :
--    nombre de jours de location, depot de garantie, et le detail jour par jour
--    (dont le "complement greve" qui n'existe nulle part ailleurs).
-- 3. Mentions du marche sur l'entete de facture (CADEMA / CARIBUS).

-- ---------------------------------------------------------------- 1. dettes
create table if not exists public.chauffeur_dettes (
  id uuid primary key default gen_random_uuid(),
  chauffeur_id uuid not null references public.chauffeurs(id) on delete cascade,
  libelle text not null,                       -- "Dette moteur", "Casse pare-brise"...
  montant_total numeric not null default 0,
  date_creation date not null default current_date,
  notes text not null default '',
  statut text not null default 'en_cours',     -- en_cours | soldee | annulee
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chauffeur_dettes_chauffeur_idx
  on public.chauffeur_dettes (chauffeur_id, statut);

-- Une echeance = le montant a retenir sur la facture d'UN mois donne.
create table if not exists public.chauffeur_dette_echeances (
  id uuid primary key default gen_random_uuid(),
  dette_id uuid not null references public.chauffeur_dettes(id) on delete cascade,
  mois date not null,                          -- 1er jour du mois d'imputation
  montant numeric not null default 0,
  statut text not null default 'prevue',       -- prevue | appliquee | annulee
  facture_id uuid references public.factures(id) on delete set null,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dette_id, mois)
);

create index if not exists chauffeur_dette_echeances_mois_idx
  on public.chauffeur_dette_echeances (mois, statut);

-- Visibilite org-wide pour les directeurs authentifies (meme modele que `courses`).
alter table public.chauffeur_dettes enable row level security;
alter table public.chauffeur_dette_echeances enable row level security;

do $$
declare t text;
begin
  foreach t in array array['chauffeur_dettes', 'chauffeur_dette_echeances'] loop
    execute format('drop policy if exists "Auth view %1$s" on public.%1$I', t);
    execute format('create policy "Auth view %1$s" on public.%1$I for select to authenticated using (auth.uid() is not null)', t);
    execute format('drop policy if exists "Auth insert %1$s" on public.%1$I', t);
    execute format('create policy "Auth insert %1$s" on public.%1$I for insert to authenticated with check (auth.uid() is not null)', t);
    execute format('drop policy if exists "Auth update %1$s" on public.%1$I', t);
    execute format('create policy "Auth update %1$s" on public.%1$I for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)', t);
    execute format('drop policy if exists "Auth delete %1$s" on public.%1$I', t);
    execute format('create policy "Auth delete %1$s" on public.%1$I for delete to authenticated using (auth.uid() is not null)', t);
  end loop;
end $$;

-- ------------------------------------------------------- 2. champs facture
-- Location facturee au prorata : la DAF compte les jours de location du mois
-- (30/30 dans l'exemple) a cote du forfait, pour justifier le montant retenu.
alter table public.factures add column if not exists nb_jours_location integer not null default 0;
alter table public.factures add column if not exists depot_garantie numeric not null default 0;
-- Total des echeances de dette imputees sur cette facture (trace du calcul).
alter table public.factures add column if not exists montant_dettes numeric not null default 0;
-- Recap jour par jour (colonnes du tableau C4) fige au moment de la validation,
-- + saisies manuelles qui n'existent pas ailleurs (complement greve).
alter table public.factures add column if not exists recap_journalier jsonb;

-- ------------------------------------------------- 3. entete facture marche
alter table public.entreprise add column if not exists marche_libelle text not null default '';
alter table public.entreprise add column if not exists marche_contrat_date date;
alter table public.entreprise add column if not exists facture_prefixe text not null default '';
alter table public.entreprise add column if not exists mention_tva text not null default 'TVA non applicable a Mayotte';
alter table public.entreprise add column if not exists mode_reglement text not null default 'Par virement bancaire';

-- --------------------------------------------------- depot de garantie
-- Inactif et a 0 par defaut : ne change aucune facture existante tant que la
-- direction n'a pas saisi le montant dans Parametres > Tarifs.
insert into public.tarif_frais (cle, valeur, periode, actif, description, user_id)
select 'depot_garantie', 0, 'mois', false,
       'Depot de garantie mensuel retenu sur la facture du chauffeur',
       (select user_id from public.tarif_frais order by created_at limit 1)
where not exists (select 1 from public.tarif_frais where cle = 'depot_garantie');
