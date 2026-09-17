// Chargement des donnees du tableau de bord.
//
// Tickets du 16-17/09/2026 ("les jours de semaine devraient etre proches",
// "1185 usagers incoherent avec les chiffres au-dessus") :
//
//   - Les requetes n'etaient pas paginees : Supabase renvoie au plus 1000 lignes,
//     SANS erreur. Une semaine "toutes lignes" (~1400 trajets) etait coupee a
//     1000 et les derniers jours disparaissaient (semaine 36 sur la L3 : 154
//     trajets le lundi, 32 le mercredi, rien apres le jeudi dans certains
//     graphiques ; "999 executions", "1000 trajets planifies").
//   - Les montees / descendues additionnaient TOUTES les lignes alors que le
//     reste de la page suivait la ligne choisie (L3 le 16/09 : 2353 montees
//     affichees pour 1136 reelles sur la L3).
//
// Les corrections saisies dans "Stats par ligne" (heure reelle, heure
// d'arrivee, temps, montees, descentes) sont appliquees ici : corriger une
// anomalie la corrige aussi dans le tableau de bord.

import { supabase } from './supabase';
import { mDateStr, mInputToISO } from './mayotte';

const PAGE = 1000;

/** Charge toutes les pages d'une requete (limite de 1000 lignes de Supabase). */
export async function chargerTout<T>(
  requete: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const tout: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await requete(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    tout.push(...rows);
    if (rows.length < PAGE) break;
  }
  return tout;
}

/** Duree d'un trajet retenue dans les moyennes. En dessous, le chauffeur a
 *  demarre et cloture d'un meme geste ; au-dessus, il a oublie de cloturer
 *  (jusqu'a 17 h relevees). 1 % des trajets environ. */
export const DUREE_MIN_VALIDE = 2;
export const DUREE_MAX_VALIDE = 120;

export function dureeValide(minutes: number): boolean {
  return minutes >= DUREE_MIN_VALIDE && minutes <= DUREE_MAX_VALIDE;
}

export interface ExecutionTrajet {
  course_id: string;
  heure_debut: string;
  heure_fin: string | null;
  /** Duree saisie a la main dans Stats par ligne (prioritaire sur les heures). */
  duree_corrigee?: number | null;
}

export interface CoursePassagers {
  id: string;
  date_heure: string;
  passagers_depart?: number | null;
  passagers_arrivee?: number | null;
}

interface Correction {
  heure_reelle?: string;
  heure_arrivee?: string;
  temps_aller?: string;
  montees?: string;
  descentes?: string;
  supprime?: boolean;
}

const CHAMPS = ['heure_reelle', 'heure_arrivee', 'temps_aller', 'montees', 'descentes', '__deleted'];

/** Corrections "Stats par ligne" des trajets de la periode, par course. */
export async function chargerCorrections(debutISO: string, finISO: string): Promise<Map<string, Correction>> {
  const rows = await chargerTout<{ row_key: string; champ: string; valeur: string | null }>((from, to) =>
    supabase.from('stat_ligne_overrides')
      .select('row_key, champ, valeur')
      .gte('jour', mDateStr(debutISO))
      .lte('jour', mDateStr(finISO))
      .like('row_key', 'c:%')
      .in('champ', CHAMPS)
      .order('row_key')
      .range(from, to));
  const map = new Map<string, Correction>();
  rows.forEach(r => {
    const id = r.row_key.slice(2);
    const c = map.get(id) || {};
    if (r.champ === '__deleted') c.supprime = r.valeur === '1';
    else (c as Record<string, string>)[r.champ] = r.valeur ?? '';
    map.set(id, c);
  });
  return map;
}

const entier = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

/** 'HH:MM' saisi pour le jour du trajet -> ISO, ou null. */
function heureDuJour(dateHeure: string, hhmm: string | undefined): string | null {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm.trim())) return null;
  const [h, m] = hhmm.trim().split(':');
  return mInputToISO(`${mDateStr(dateHeure)}T${h.padStart(2, '0')}:${m.slice(0, 2)}`);
}

/**
 * Applique les corrections : passagers des courses, heures et durees des
 * executions. Un trajet supprime dans Stats par ligne sort des statistiques de
 * duree, de ponctualite et de frequentation (il reste compte dans le planning).
 */
export function appliquerCorrections<C extends CoursePassagers>(
  courses: C[],
  executions: ExecutionTrajet[],
  corrections: Map<string, Correction>,
): { courses: C[]; executions: ExecutionTrajet[]; exclus: Set<string> } {
  const exclus = new Set<string>();
  const coursesCorr = courses.map(c => {
    const k = corrections.get(c.id);
    if (!k) return c;
    if (k.supprime) exclus.add(c.id);
    const montees = entier(k.montees);
    const descentes = entier(k.descentes);
    if (montees === null && descentes === null) return c;
    return {
      ...c,
      passagers_depart: montees ?? c.passagers_depart,
      passagers_arrivee: descentes ?? c.passagers_arrivee,
    };
  });

  const parCourse = new Map(courses.map(c => [c.id, c]));
  const vus = new Set<string>();
  const execCorr: ExecutionTrajet[] = [];
  executions.forEach(e => {
    if (exclus.has(e.course_id)) return;
    vus.add(e.course_id);
    const k = corrections.get(e.course_id);
    const c = parCourse.get(e.course_id);
    if (!k || !c) { execCorr.push(e); return; }
    execCorr.push({
      course_id: e.course_id,
      heure_debut: heureDuJour(c.date_heure, k.heure_reelle) || e.heure_debut,
      heure_fin: heureDuJour(c.date_heure, k.heure_arrivee) || e.heure_fin,
      duree_corrigee: entier(k.temps_aller),
    });
  });
  // Trajet sans execution dans l'appli, mais dont l'heure reelle a ete saisie.
  corrections.forEach((k, id) => {
    if (vus.has(id) || k.supprime) return;
    const c = parCourse.get(id);
    const debut = c ? heureDuJour(c.date_heure, k.heure_reelle) : null;
    if (!c || !debut) return;
    execCorr.push({ course_id: id, heure_debut: debut, heure_fin: heureDuJour(c.date_heure, k.heure_arrivee), duree_corrigee: entier(k.temps_aller) });
  });
  return { courses: coursesCorr, executions: execCorr, exclus };
}

/** Duree en minutes d'une execution (corrigee si saisie), ou null. */
export function dureeExecution(e: ExecutionTrajet): number | null {
  if (e.duree_corrigee != null) return e.duree_corrigee;
  if (!e.heure_fin) return null;
  let min = (new Date(e.heure_fin).getTime() - new Date(e.heure_debut).getTime()) / 60000;
  if (min < 0) min += 24 * 60;
  return min;
}
