/*
  # Jours feries : tarif correct a la cloture d'une course, et re-tarification
  # quand la liste des feries change

  Ticket "Facturation : erreur de calcul !!" (C5, 15/08 et 26/08).

  CAUSE 1 - RLS. tarif_course() s'executait avec les droits de l'APPELANT. Quand
  un chauffeur termine sa course depuis son telephone, il est connecte en `anon`
  (login par code + PIN, pas de session Supabase). Or la table jours_feries
  n'est lisible que par `authenticated` : le `exists (... jours_feries ...)` de
  tarif_course renvoyait donc toujours faux cote chauffeur. Resultat : le
  trigger set_course_montant re-tarifait la course au tarif SAMEDI ou LUN-VEN
  au moment de la cloture, alors qu'elle avait ete creee au tarif FERIE.
  Exemple trace dans les logs (course du 15/08 08:30) : creee a 27,50 le 04/08,
  ramenee a 18,50 le 15/08 a 05:55 par la cloture du chauffeur.
  Correctif : tarif_course() passe en SECURITY DEFINER - c'est une fonction de
  calcul de prix, elle doit voir la grille et le calendrier en entier quel que
  soit l'appelant.

  CAUSE 2 - un jour ferie declare APRES coup ne re-tarifait rien. Le Maoulid du
  26/08 n'a ete saisi que le 01/09 : les courses de ce jour restaient au tarif
  ordinaire. Correctif : un trigger sur jours_feries re-tarife les courses
  TERMINEES du (ou des) jour(s) concerne(s), a l'ajout, a la modification comme
  a la suppression.

  CAUSE 3 (latente) - les feries "recurrents" n'etaient pas tarifes. L'ecran
  Planning etend un ferie recurrent a toutes les annees, mais tarif_course ne
  comparait que la date exacte. Aligne : on compare aussi le jour et le mois
  quand recurrent = true.

  Le rattrapage des courses deja clôturees (14/07, 15/08, 26/08) est fait a
  part, avec sauvegarde prealable.
*/

CREATE OR REPLACE FUNCTION public.tarif_course(p_date_heure timestamp with time zone, p_is_astreinte boolean, p_ligne_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_local timestamp;
  v_dow int;
  v_date date;
  v_hhmm text;
  v_type text;
  v_tarif numeric;
begin
  if p_date_heure is null then return 0; end if;
  v_local := p_date_heure at time zone 'Indian/Mayotte';
  v_date  := v_local::date;
  v_dow   := extract(dow from v_local);
  v_hhmm  := to_char(v_local, 'HH24:MI');

  if coalesce(p_is_astreinte, false) then
    v_type := 'astreinte';
  elsif exists (
    select 1 from public.jours_feries jf
    where jf.date = v_date
       or (coalesce(jf.recurrent, false) and to_char(jf.date, 'MM-DD') = to_char(v_date, 'MM-DD'))
  ) then
    v_type := 'feries';
  elsif v_dow = 0 then v_type := 'dimanche';
  elsif v_dow = 6 then v_type := 'samedi';
  else v_type := 'lun_ven';
  end if;

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

-- Re-tarification des courses terminees quand la liste des jours feries change.
CREATE OR REPLACE FUNCTION public.reprice_courses_jour_ferie()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_dates date[];
  v_recurrent boolean;
begin
  v_dates := case TG_OP
    when 'INSERT' then array[NEW.date]
    when 'DELETE' then array[OLD.date]
    else array[OLD.date, NEW.date]
  end;
  v_recurrent := coalesce(
    case TG_OP when 'DELETE' then OLD.recurrent else NEW.recurrent end,
    case TG_OP when 'INSERT' then false else OLD.recurrent end,
    false);

  update public.courses c
     set montant = public.tarif_course(c.date_heure, coalesce(c.is_astreinte, false), c.ligne_id)
   where c.statut_realisation = 'termine'
     and (
       ((c.date_heure at time zone 'Indian/Mayotte')::date = any(v_dates))
       or (
         v_recurrent
         and to_char((c.date_heure at time zone 'Indian/Mayotte')::date, 'MM-DD')
             = any (select to_char(d, 'MM-DD') from unnest(v_dates) d)
       )
     )
     and c.montant is distinct from public.tarif_course(c.date_heure, coalesce(c.is_astreinte, false), c.ligne_id);

  return coalesce(NEW, OLD);
end;
$$;

DROP TRIGGER IF EXISTS trg_jours_feries_reprice ON public.jours_feries;
CREATE TRIGGER trg_jours_feries_reprice
AFTER INSERT OR UPDATE OR DELETE ON public.jours_feries
FOR EACH ROW EXECUTE FUNCTION public.reprice_courses_jour_ferie();
