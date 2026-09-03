/*
  # Trajets effectues pendant une astreinte

  Ticket "Facturation: trajet effectue pendant l'astreinte" (03/09/2026).
  Regle confirmee par la direction : un trajet effectue pendant un creneau
  d'astreinte est paye au tarif ASTREINTE de la grille (10 EUR, 15 EUR sur les
  lignes qui ont leur propre plage) A LA PLACE de son tarif horaire habituel,
  le chauffeur touchant par ailleurs ses heures d'astreinte.

  Etat avant correctif : `courses.is_astreinte` etait false sur les 25 795
  courses de la base alors que 221 creneaux d'astreinte etaient planifies.
  Rien ne marquait un trajet comme "fait pendant une astreinte" : la ligne
  "astreinte" de la grille tarifaire n'etait donc JAMAIS appliquee.

  Le marquage devient automatique et deduit du planning : une course est
  d'astreinte si son horaire tombe dans un creneau d'astreinte de SON chauffeur.
  Le nom du trigger commence par "astreinte" pour qu'il s'execute avant
  trg_course_montant (ordre alphabetique) : le montant est donc calcule avec le
  marquage a jour.
*/

CREATE OR REPLACE FUNCTION public.set_course_is_astreinte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  new.is_astreinte := exists (
    select 1 from public.astreintes a
    where a.chauffeur_id = new.chauffeur_id
      and new.date_heure >= a.date_debut
      and new.date_heure <  a.date_fin
  );
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_course_astreinte ON public.courses;
CREATE TRIGGER trg_course_astreinte
BEFORE INSERT OR UPDATE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.set_course_is_astreinte();

-- Creation / modification / suppression d'un creneau : les courses concernees
-- sont re-marquees, et le trigger de montant les re-tarife au passage.
CREATE OR REPLACE FUNCTION public.remarquer_courses_astreinte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_chauffeurs uuid[];
  v_debut timestamptz;
  v_fin timestamptz;
begin
  v_chauffeurs := array_remove(array[
    case TG_OP when 'INSERT' then null else OLD.chauffeur_id end,
    case TG_OP when 'DELETE' then null else NEW.chauffeur_id end
  ], null);
  v_debut := least(
    case TG_OP when 'INSERT' then null else OLD.date_debut end,
    case TG_OP when 'DELETE' then null else NEW.date_debut end);
  v_fin := greatest(
    case TG_OP when 'INSERT' then null else OLD.date_fin end,
    case TG_OP when 'DELETE' then null else NEW.date_fin end);

  if v_debut is null or v_fin is null then return coalesce(NEW, OLD); end if;

  update public.courses c
     set is_astreinte = exists (
       select 1 from public.astreintes a
       where a.chauffeur_id = c.chauffeur_id
         and c.date_heure >= a.date_debut
         and c.date_heure <  a.date_fin
     )
   where c.chauffeur_id = any(v_chauffeurs)
     and c.date_heure >= v_debut
     and c.date_heure <  v_fin;

  return coalesce(NEW, OLD);
end;
$$;

DROP TRIGGER IF EXISTS trg_astreintes_remarquer_courses ON public.astreintes;
CREATE TRIGGER trg_astreintes_remarquer_courses
AFTER INSERT OR UPDATE OR DELETE ON public.astreintes
FOR EACH ROW EXECUTE FUNCTION public.remarquer_courses_astreinte();
