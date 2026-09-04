// Facturation / statistiques PAR LIGNE — modele de donnees.
//
// Regle metier (cf. demande) :
//  - Les lignes de base (1 ligne = 1 depart programme du jour) sont TOUJOURS
//    recalculees depuis `courses` / `course_executions`.
//  - Les modifications a la main sont stockees A PART, cellule par cellule, dans
//    `stat_ligne_overrides`. On ne touche jamais la source.
//  - Donc, hors edition, on retrouve les donnees reelles NON modifiees des
//    chauffeurs ; seules les cellules saisies gardent la valeur editee.
//  - Si pas de donnee source -> 0 / vide, et tout reste editable.
import { supabase } from './supabase';
import { mDateStr, mMidnightISO, mAddDaysStr, mParts, fmtHM } from './mayotte';

export interface LigneLite {
  id: string;
  code: string;
  nom: string;
}

export type ChampId =
  | 'arret'
  | 'heure_theo'
  | 'horaire'
  | 'chauffeur'
  | 'heure_reelle'
  | 'non_effectue'
  | 'retard'
  | 'avance'
  | 'montees'
  | 'descentes'
  | 'heure_arrivee'
  | 'commentaires'
  | 'temps_aller'
  | 'capacite';

export type ChampType = 'text' | 'time' | 'int' | 'bool';

export interface ColDef {
  id: ChampId;
  label: string;
  type: ChampType;
  width: number;
}

// Colonnes identiques a la feuille "L3-Stat-JJ-MM-AAAA" de l'exemple.
export const COLONNES: ColDef[] = [
  { id: 'arret', label: 'Arret', type: 'text', width: 140 },
  { id: 'heure_theo', label: 'Heure theo. depart', type: 'time', width: 92 },
  { id: 'horaire', label: 'Horaire', type: 'text', width: 74 },
  { id: 'chauffeur', label: 'Chauffeur', type: 'text', width: 160 },
  { id: 'heure_reelle', label: 'Heure reelle depart', type: 'time', width: 92 },
  { id: 'non_effectue', label: 'Trajet non effectue', type: 'bool', width: 66 },
  { id: 'retard', label: 'Depart > 10 mn retard', type: 'bool', width: 66 },
  { id: 'avance', label: 'Depart > 10 mn avance', type: 'bool', width: 66 },
  { id: 'montees', label: 'Nbre montees', type: 'int', width: 74 },
  { id: 'descentes', label: 'Nbre descentes', type: 'int', width: 74 },
  { id: 'heure_arrivee', label: 'Heure arrivee finale', type: 'time', width: 92 },
  { id: 'commentaires', label: 'Commentaires', type: 'text', width: 170 },
  { id: 'temps_aller', label: 'Temps aller (min)', type: 'int', width: 84 },
  { id: 'capacite', label: 'Capacite max', type: 'int', width: 74 },
];

export const CHAMP_DELETED = '__deleted';
export const CHAMP_MANUAL = '__manual';
const DEFAULT_CAPACITE = '8';

export type Cellules = Record<ChampId, string>;

export interface StatRow {
  rowKey: string; // 'c:<course_id>' (base) ou 'm:<uuid>' (ajout manuel)
  courseId: string | null;
  manual: boolean;
  base: Cellules; // valeurs source recalculees (avant override)
  values: Cellules; // base + overrides appliques
  overridden: Set<ChampId>; // champs modifies a la main
  sortKey: number; // minutes de l'heure theorique (tri)
}

function emptyCells(): Cellules {
  return {
    arret: '',
    heure_theo: '',
    horaire: '',
    chauffeur: '',
    heure_reelle: '',
    non_effectue: '0',
    retard: '0',
    avance: '0',
    montees: '0',
    descentes: '0',
    heure_arrivee: '',
    commentaires: '',
    temps_aller: '',
    capacite: DEFAULT_CAPACITE,
  };
}

// ---- Valeurs derivees (non stockees) -------------------------------------

/**
 * Nombre d'usagers d'un depart = MAX(montees, descentes) — regle metier :
 * un usager peut monter sans etre compte a la descente (et inversement), le
 * plus grand des deux compteurs est le plus proche de la realite.
 * Avant : seules les montees etaient comptees.
 */
export function usagers(v: Cellules): number {
  return Math.max(toInt(v.montees), toInt(v.descentes));
}

/** Capacite d'un trajet (places du vehicule, chauffeur exclu). */
export function capaciteTrajet(v: Cellules): number {
  return toInt(v.capacite);
}

/** Taux de frequentation d'un trajet = usagers / capacite (0..1). */
export function tauxFrequentation(v: Cellules): number {
  const cap = capaciteTrajet(v);
  return cap > 0 ? usagers(v) / cap : 0;
}

/**
 * Taux de frequentation MOYEN d'un ensemble de trajets =
 * somme des usagers / somme des capacites max.
 * Ce n'est PAS la moyenne des taux ligne a ligne (qui donnait un chiffre faux
 * des que les capacites differaient d'un trajet a l'autre).
 */
export function tauxFrequentationMoyen(rows: { values: Cellules }[]): number {
  let u = 0, cap = 0;
  for (const r of rows) { u += usagers(r.values); cap += capaciteTrajet(r.values); }
  return cap > 0 ? u / cap : 0;
}

export function toInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Ecart signale (en minutes) au-dela duquel un depart est retard / en avance. */
export const ECART_TOLERANCE_MN = 10;

/** 'HH:MM' -> minutes depuis minuit, ou null si vide/illisible. */
function hmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((hhmm || '').trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Champs CALCULES a partir des heures de la ligne. Recalcules a chaque fois sur
 * les valeurs finales (base + saisies manuelles), sauf si l'utilisateur a lui-meme
 * saisi le champ (l'override reste prioritaire).
 *  - temps_aller = heure d'arrivee finale - heure reelle de depart (demande metier :
 *    c'est le temps REELLEMENT mis, pas la duree planifiee de la course).
 *  - retard / avance = ecart heure reelle - heure theorique, > 10 mn dans un sens
 *    ou dans l'autre (l'avance n'etait pas signalee du tout).
 */
function derive(values: Cellules, overridden: Set<ChampId>, fallbackTempsAller: string): void {
  if (!overridden.has('temps_aller')) {
    const dep = hmToMinutes(values.heure_reelle);
    const arr = hmToMinutes(values.heure_arrivee);
    if (dep != null && arr != null) {
      const diff = arr - dep;
      values.temps_aller = String(diff < 0 ? diff + 24 * 60 : diff); // passage minuit
    } else {
      values.temps_aller = fallbackTempsAller;
    }
  }
  const theo = hmToMinutes(values.heure_theo);
  const reel = hmToMinutes(values.heure_reelle);
  const ecart = theo != null && reel != null ? reel - theo : null;
  if (!overridden.has('retard')) {
    values.retard = ecart != null && ecart > ECART_TOLERANCE_MN ? '1' : '0';
  }
  if (!overridden.has('avance')) {
    values.avance = ecart != null && ecart < -ECART_TOLERANCE_MN ? '1' : '0';
  }
}

// ---- Type Supabase (course + jointures) ----------------------------------

interface CourseRaw {
  id: string;
  date_heure: string;
  depart: string | null;
  passagers_depart: number | null;
  passagers_arrivee: number | null;
  duree_minutes: number | null;
  statut_realisation: string | null;
  notes: string | null;
  chauffeurs: { code: string | null; nom: string | null; prenom: string | null; vehicule_places: number | null } | null;
  course_executions: { heure_debut: string | null; heure_fin: string | null }[] | null;
}

// `courses` a deux FK vers `chauffeurs` (chauffeur_id + coordinateur_id) : on
// desambiguise l'embed via le nom de contrainte, sinon PostgREST refuse.
const COURSE_SELECT =
  'id,date_heure,depart,passagers_depart,passagers_arrivee,duree_minutes,statut_realisation,notes,' +
  'chauffeurs!courses_chauffeur_id_fkey(code,nom,prenom,vehicule_places),course_executions(heure_debut,heure_fin)';

/** Une course -> valeurs de base d'une ligne du tableau. */
function courseToBase(c: CourseRaw): Cellules {
  const cells = emptyCells();
  const p = mParts(c.date_heure);
  cells.arret = c.depart || '';
  cells.heure_theo = fmtHM(c.date_heure);
  // Code chauffeur en prefixe (ex: "D5 - AMINA Selemani") -> visible dans la
  // colonne Chauffeur, repris dans l'export, et exploitable pour le tri.
  const chNom = `${c.chauffeurs?.nom || ''} ${c.chauffeurs?.prenom || ''}`.trim();
  cells.chauffeur = [c.chauffeurs?.code, chNom].filter(Boolean).join(' - ');
  // "Non effectue" est desormais DEDUIT du statut, sans avoir a cocher la case :
  // un trajet annule ou en incident, mais aussi un trajet dont l'heure est
  // passee et qui n'a jamais ete termine par le chauffeur (reste "programme" ou
  // "en cours"). La case reste modifiable a la main : la saisie prend le pas.
  const statut = c.statut_realisation || '';
  const passe = new Date(c.date_heure).getTime() < Date.now();
  const nonEffectue = statut === 'annule' || statut === 'annulee' || statut === 'non_effectue'
    || statut === 'incident'
    || (passe && statut !== 'termine' && statut !== 'terminee');
  cells.non_effectue = nonEffectue ? '1' : '0';
  cells.montees = String(c.passagers_depart ?? 0);
  cells.descentes = String(c.passagers_arrivee ?? 0);
  cells.commentaires = c.notes || '';
  cells.temps_aller = c.duree_minutes != null ? String(c.duree_minutes) : '';
  // Capacite = places du vehicule MOINS le chauffeur (un 9 places transporte
  // 8 usagers). Avant : `vehicule_places` brut -> taux de frequentation
  // sous-evalue d'un neuvieme.
  const places = c.chauffeurs?.vehicule_places ?? 0;
  cells.capacite = places > 1 ? String(places - 1) : DEFAULT_CAPACITE;
  // Trajet reellement effectue : on renseigne l'heure reelle de depart / arrivee
  // depuis l'execution du chauffeur (course_executions). Ainsi un trajet effectue
  // se distingue d'un trajet seulement planifie (avant : colonnes vides -> il
  // "n'apparaissait pas" comme effectue). Les valeurs restent editables a la main.
  const exec = c.course_executions?.[0];
  if (exec?.heure_debut) cells.heure_reelle = fmtHM(exec.heure_debut);
  if (exec?.heure_fin) cells.heure_arrivee = fmtHM(exec.heure_fin);
  // temps_aller / retard / avance sont CALCULES depuis les heures ci-dessus.
  // A defaut d'execution, on retombe sur la duree planifiee de la course.
  derive(cells, new Set(), c.duree_minutes != null ? String(c.duree_minutes) : '');
  void p;
  return cells;
}

function sortKeyFromHeure(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 9999;
}

// ---- Chargement pagine (respecte la limite 1000 lignes de Supabase) ------

async function fetchCoursesRange(ligneId: string, startISO: string, endISO: string): Promise<CourseRaw[]> {
  const all: CourseRaw[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('courses')
      .select(COURSE_SELECT)
      .eq('ligne_id', ligneId)
      // Un trajet REMPLACE fait double emploi avec la course du remplacant, qui
      // porte les vraies donnees : on ne le liste plus.
      // `or(is.null, neq)` et non `neq` seul : en SQL `colonne <> 'remplace'`
      // vaut NULL (donc faux) quand la colonne est NULL.
      .or('statut_realisation.is.null,statut_realisation.neq.remplace')
      .gte('date_heure', startISO)
      .lt('date_heure', endISO)
      .order('date_heure', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as unknown as CourseRaw[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

interface OverrideRow {
  row_key: string;
  champ: string;
  valeur: string | null;
  jour?: string;
}

async function fetchOverridesRange(ligneId: string, jourStart: string, jourEndInclusive: string): Promise<OverrideRow[]> {
  const all: OverrideRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('stat_ligne_overrides')
      .select('row_key,champ,valeur,jour')
      .eq('ligne_id', ligneId)
      .gte('jour', jourStart)
      .lte('jour', jourEndInclusive)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as OverrideRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Fusionne les courses de base + overrides d'UN jour en lignes de tableau. */
function mergeRows(baseByKey: Map<string, Cellules>, overrides: OverrideRow[]): StatRow[] {
  // Regrouper les overrides par row_key.
  const ovByKey = new Map<string, Map<string, string | null>>();
  for (const o of overrides) {
    let m = ovByKey.get(o.row_key);
    if (!m) {
      m = new Map();
      ovByKey.set(o.row_key, m);
    }
    m.set(o.champ, o.valeur);
  }

  const rows: StatRow[] = [];

  // 1) Lignes de base (courses), sauf celles marquees supprimees.
  for (const [rowKey, base] of baseByKey) {
    const ov = ovByKey.get(rowKey);
    if (ov?.get(CHAMP_DELETED) === '1') continue;
    const values = { ...base };
    const overridden = new Set<ChampId>();
    if (ov) {
      for (const [champ, val] of ov) {
        if (champ === CHAMP_DELETED || champ === CHAMP_MANUAL) continue;
        values[champ as ChampId] = val ?? '';
        overridden.add(champ as ChampId);
      }
    }
    // Les heures ont pu etre corrigees a la main -> on recalcule les champs
    // derives non saisis explicitement.
    derive(values, overridden, base.temps_aller);
    rows.push({
      rowKey,
      courseId: rowKey.startsWith('c:') ? rowKey.slice(2) : null,
      manual: false,
      base,
      values,
      overridden,
      sortKey: sortKeyFromHeure(values.heure_theo),
    });
  }

  // 2) Lignes ajoutees a la main (row_key 'm:...').
  for (const [rowKey, ov] of ovByKey) {
    if (!rowKey.startsWith('m:')) continue;
    if (ov.get(CHAMP_DELETED) === '1') continue;
    const base = emptyCells();
    const values = { ...base };
    const overridden = new Set<ChampId>();
    for (const [champ, val] of ov) {
      if (champ === CHAMP_DELETED || champ === CHAMP_MANUAL) continue;
      values[champ as ChampId] = val ?? '';
      overridden.add(champ as ChampId);
    }
    derive(values, overridden, base.temps_aller);
    rows.push({
      rowKey,
      courseId: null,
      manual: true,
      base,
      values,
      overridden,
      sortKey: sortKeyFromHeure(values.heure_theo),
    });
  }

  rows.sort((a, b) => a.sortKey - b.sortKey || a.values.arret.localeCompare(b.values.arret));
  return rows;
}

/** Charge le tableau editable d'UN jour (jour = 'YYYY-MM-DD' Mayotte). */
export async function loadDay(ligneId: string, jour: string): Promise<StatRow[]> {
  const startISO = mMidnightISO(jour);
  const endISO = mMidnightISO(mAddDaysStr(jour, 1));
  const [courses, overrides] = await Promise.all([
    fetchCoursesRange(ligneId, startISO, endISO),
    fetchOverridesRange(ligneId, jour, jour),
  ]);
  const baseByKey = new Map<string, Cellules>();
  for (const c of courses) baseByKey.set(`c:${c.id}`, courseToBase(c));
  return mergeRows(baseByKey, overrides);
}

/** Charge plusieurs jours d'un coup (semaine/mois) -> lignes par jour. */
export async function loadRange(ligneId: string, jours: string[]): Promise<Map<string, StatRow[]>> {
  const result = new Map<string, StatRow[]>();
  if (jours.length === 0) return result;
  const startISO = mMidnightISO(jours[0]);
  const endISO = mMidnightISO(mAddDaysStr(jours[jours.length - 1], 1));
  const [courses, overrides] = await Promise.all([
    fetchCoursesRange(ligneId, startISO, endISO),
    fetchOverridesRange(ligneId, jours[0], jours[jours.length - 1]),
  ]);

  // Bucketiser par jour de Mayotte.
  const coursesByDay = new Map<string, Map<string, Cellules>>();
  for (const c of courses) {
    const j = mDateStr(c.date_heure);
    let m = coursesByDay.get(j);
    if (!m) {
      m = new Map();
      coursesByDay.set(j, m);
    }
    m.set(`c:${c.id}`, courseToBase(c));
  }
  const ovByDay = new Map<string, OverrideRow[]>();
  for (const o of overrides) {
    const j = o.jour as string;
    const arr = ovByDay.get(j);
    if (arr) arr.push(o);
    else ovByDay.set(j, [o]);
  }

  for (const j of jours) {
    result.set(j, mergeRows(coursesByDay.get(j) || new Map(), ovByDay.get(j) || []));
  }
  return result;
}

// ---- Ecriture des overrides ----------------------------------------------

function nowISO(): string {
  return new Date().toISOString();
}

async function upsertCell(ligneId: string, jour: string, rowKey: string, champ: string, valeur: string) {
  const { error } = await supabase.from('stat_ligne_overrides').upsert(
    { ligne_id: ligneId, jour, row_key: rowKey, champ, valeur, updated_at: nowISO() },
    { onConflict: 'ligne_id,jour,row_key,champ' },
  );
  if (error) throw error;
}

async function deleteCell(ligneId: string, jour: string, rowKey: string, champ: string) {
  const { error } = await supabase
    .from('stat_ligne_overrides')
    .delete()
    .eq('ligne_id', ligneId)
    .eq('jour', jour)
    .eq('row_key', rowKey)
    .eq('champ', champ);
  if (error) throw error;
}

/**
 * Enregistre la saisie d'une cellule.
 * - Ligne de base : si la valeur revient a la valeur source, on SUPPRIME
 *   l'override (on "retrouve" la donnee reelle du chauffeur). Sinon on l'ecrit.
 * - Ligne manuelle : on ecrit toujours (base vide).
 */
export async function setCell(ligneId: string, jour: string, row: StatRow, champ: ChampId, value: string): Promise<void> {
  if (!row.manual && value === row.base[champ]) {
    await deleteCell(ligneId, jour, row.rowKey, champ);
  } else {
    await upsertCell(ligneId, jour, row.rowKey, champ, value);
  }
}

/** Ajoute une ligne manuelle vide ; renvoie son row_key. */
export async function addManualRow(ligneId: string, jour: string): Promise<string> {
  const rowKey = `m:${crypto.randomUUID()}`;
  await upsertCell(ligneId, jour, rowKey, CHAMP_MANUAL, '1');
  return rowKey;
}

/** Supprime une ligne : base -> marqueur '__deleted' ; manuelle -> purge totale. */
export async function deleteRow(ligneId: string, jour: string, row: StatRow): Promise<void> {
  if (row.manual) {
    const { error } = await supabase
      .from('stat_ligne_overrides')
      .delete()
      .eq('ligne_id', ligneId)
      .eq('jour', jour)
      .eq('row_key', row.rowKey);
    if (error) throw error;
  } else {
    await upsertCell(ligneId, jour, row.rowKey, CHAMP_DELETED, '1');
  }
}

/** Restaure une ligne de base masquee. */
export async function restoreRow(ligneId: string, jour: string, row: StatRow): Promise<void> {
  await deleteCell(ligneId, jour, row.rowKey, CHAMP_DELETED);
}

/** Efface TOUTES les modifications d'un jour (retour a la source). */
export async function resetDay(ligneId: string, jour: string): Promise<void> {
  const { error } = await supabase
    .from('stat_ligne_overrides')
    .delete()
    .eq('ligne_id', ligneId)
    .eq('jour', jour);
  if (error) throw error;
}

// ---- Consolidation (semaine / mois) --------------------------------------

export interface SlotConso {
  arret: string;
  heure_theo: string;
  sortKey: number;
  parJour: Map<string, { montees: number; usagers: number; taux: number; temps: number; present: boolean }>;
  nbDeparts: number;
  totMontees: number;
  totDescentes: number;
  /** Somme des usagers = MAX(montees, descentes) de chaque trajet. */
  totUsagers: number;
  /** Somme des capacites max de chaque trajet du creneau. */
  totCapacite: number;
  nbNonEffectue: number;
  nbRetard: number;
  nbAvance: number;
  tauxMoyen: number;
  tempsMoyen: number;
}

/** Agrege les lignes de plusieurs jours par creneau (arret + heure theorique). */
export function consolider(perDay: Map<string, StatRow[]>, jours: string[]): SlotConso[] {
  const slots = new Map<string, SlotConso>();
  const tempsAcc = new Map<string, { sum: number; n: number }>();
  // Taux consolide = somme des usagers / somme des capacites (et non moyenne
  // des taux de chaque jour, qui cumulait des ratios non comparables).
  const tauxAcc = new Map<string, { usagers: number; capacite: number }>();

  for (const j of jours) {
    const rows = perDay.get(j) || [];
    for (const r of rows) {
      const key = `${r.values.arret}||${r.values.heure_theo}`;
      let slot = slots.get(key);
      if (!slot) {
        slot = {
          arret: r.values.arret,
          heure_theo: r.values.heure_theo,
          sortKey: r.sortKey,
          parJour: new Map(),
          nbDeparts: 0,
          totMontees: 0,
          totDescentes: 0,
          totUsagers: 0,
          totCapacite: 0,
          nbNonEffectue: 0,
          nbRetard: 0,
          nbAvance: 0,
          tauxMoyen: 0,
          tempsMoyen: 0,
        };
        slots.set(key, slot);
        tempsAcc.set(key, { sum: 0, n: 0 });
        tauxAcc.set(key, { usagers: 0, capacite: 0 });
      }
      const montees = toInt(r.values.montees);
      const descentes = toInt(r.values.descentes);
      const taux = tauxFrequentation(r.values);
      const temps = toInt(r.values.temps_aller);
      slot.parJour.set(j, { montees, usagers: usagers(r.values), taux, temps, present: true });
      slot.nbDeparts += 1;
      slot.totMontees += montees;
      slot.totDescentes += descentes;
      if (r.values.non_effectue === '1') slot.nbNonEffectue += 1;
      if (r.values.retard === '1') slot.nbRetard += 1;
      if (r.values.avance === '1') slot.nbAvance += 1;
      const ta = tauxAcc.get(key)!;
      ta.usagers += usagers(r.values);
      ta.capacite += capaciteTrajet(r.values);
      if (temps > 0) {
        const te = tempsAcc.get(key)!;
        te.sum += temps;
        te.n += 1;
      }
    }
  }

  const out = [...slots.entries()].map(([key, slot]) => {
    const ta = tauxAcc.get(key)!;
    const te = tempsAcc.get(key)!;
    slot.totUsagers = ta.usagers;
    slot.totCapacite = ta.capacite;
    slot.tauxMoyen = ta.capacite > 0 ? ta.usagers / ta.capacite : 0;
    slot.tempsMoyen = te.n > 0 ? te.sum / te.n : 0;
    return slot;
  });
  out.sort((a, b) => a.sortKey - b.sortKey || a.arret.localeCompare(b.arret));
  return out;
}
