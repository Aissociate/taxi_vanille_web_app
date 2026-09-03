// Recap mensuel du chauffeur, jour par jour — modele demande par la DAF
// (piece jointe "C4 Ligne 4 07 2026 TOUMBOU.pdf", mail du 18/08/2026).
//
// La facture donne les TOTAUX ; ce recap donne la piece justificative qui va
// avec : une ligne par jour du mois, le detail planifie / non effectue / non
// planifie effectue, la ventilation des trajets realises par plage tarifaire,
// puis la valeur du jour.
//
// Regle d'or : la colonne "Valeur" est la somme des `montant` des courses (prix
// autoritatif pose par le trigger `tarif_course`) + l'astreinte du jour. Le
// total du recap reconcilie donc AU CENTIME avec le sous-total de la facture —
// c'est tout l'interet du document pour la DAF.
//
// L'astreinte est payee A L'HEURE, au tarif de l'onglet "Astreinte" de la
// grille tarifaire (Parametres > Tarification). Elle remplace l'ancien forfait
// par astreinte realisee.

import { mParts, mDateStr } from './mayotte';

export interface RecapCourse {
  id: string;
  date_heure: string;
  ligne_id: string | null;
  montant: number | null;
  is_astreinte: boolean | null;
  statut_planification: string | null;
  statut_realisation: string | null;
  /** Facultatifs : servent au detail d'une journee ouverte depuis le recap. */
  depart?: string | null;
  arrivee?: string | null;
  chauffeur_id?: string | null;
}

export interface RecapPlage {
  id: string;
  type_jour: string;
  heure_debut: string;
  heure_fin: string;
  tarif: number;
  libelle: string | null;
  ligne_id: string | null;
  ordre: number;
}

/**
 * Astreinte realisee : le mobile confirme d'un seul clic, sans duree
 * (heure_debut == heure_fin en base). Cette liste ne sert donc qu'a COMPTER les
 * astreintes du jour — c'est elle qui declenche le forfait.
 */
export interface RecapAstreinteSession {
  date: string;
}

/**
 * Creneau d'astreinte PLANIFIE (table `astreintes`) : lui porte une vraie plage
 * horaire (ex. 14:00 -> 17:00). C'est la seule source des "heures d'astreinte"
 * du tableau de la DAF ; les sessions realisees n'en portent pas.
 */
export interface RecapAstreinteCreneau {
  date_debut: string;
  date_fin: string | null;
}

/** Colonne de ventilation : une par plage tarifaire rencontree dans le mois. */
export interface RecapColonne {
  key: string;
  libelle: string;
  tarif: number;
  ordre: number;
}

export interface RecapJour {
  date: string;               // YYYY-MM-DD (jour calendaire de Mayotte)
  jourSemaine: number;        // 1 = lundi ... 7 = dimanche (comme le tableau DAF)
  libelle: string;            // "mercredi 1 juillet 2026"
  isFerie: boolean;
  minutesAstreinte: number;   // duree retenue (saisie manuelle, sinon creneaux planifies)
  minutesPlanifiees: number;  // ce que disent les creneaux, avant saisie manuelle
  heuresSaisies: boolean;     // true si la duree du jour a ete saisie a la main
  nbAstreintes: number;       // nombre de sessions confirmees par le chauffeur
  valeurAstreinte: number;    // EUR : heures retenues x tarif horaire
  planifies: number;
  nonEffectues: number;
  nonPlanifiesEffectues: number;
  effectues: number;
  parPlage: Record<string, number>;  // key de colonne -> nb de trajets realises
  valeur: number;             // EUR : courses realisees + forfait astreintes
  complementGreve: number;    // saisie manuelle (n'existe pas en base)
}

export interface RecapTotaux {
  minutesAstreinte: number;
  minutesPlanifiees: number;
  nbAstreintes: number;
  valeurAstreinte: number;
  planifies: number;
  nonEffectues: number;
  nonPlanifiesEffectues: number;
  effectues: number;
  parPlage: Record<string, number>;
  valeur: number;
  complementGreve: number;
}

export interface RecapMensuel {
  colonnes: RecapColonne[];
  jours: RecapJour[];
  totaux: RecapTotaux;
}

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

/** Type de jour tarifaire, exactement comme le trigger `tarif_course`. */
function typeJourDe(c: RecapCourse, isFerie: boolean, dow: number): string {
  if (c.is_astreinte) return 'astreinte';
  if (isFerie) return 'feries';
  if (dow === 0) return 'dimanche';
  if (dow === 6) return 'samedi';
  return 'lun_ven';
}

/**
 * Selection de la plage tarifaire d'une course : meme regle que le trigger
 * `tarif_course` cote base (plage specifique a la ligne prioritaire, sinon
 * plage generique ; a egalite, le plus petit `ordre`). Sans ca le decompte du
 * recap ne tomberait pas sur les montants reellement factures.
 */
export function plageDe(c: RecapCourse, plages: RecapPlage[], isFerie: boolean): RecapPlage | null {
  const p = mParts(c.date_heure);
  const typeJour = typeJourDe(c, isFerie, p.dow);
  const hhmm = `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
  return plages
    .filter(pl => pl.type_jour === typeJour && hhmm >= pl.heure_debut && hhmm < pl.heure_fin
      && (pl.ligne_id === c.ligne_id || pl.ligne_id == null))
    .sort((a, b) =>
      (Number(b.ligne_id === c.ligne_id) - Number(a.ligne_id === c.ligne_id)) || (a.ordre - b.ordre))[0] || null;
}

function colonneKey(plage: RecapPlage | null, c: RecapCourse, isFerie: boolean, dow: number): string {
  if (plage) return `p:${plage.id}`;
  // Course hors plage tarifaire : on la garde visible plutot que de la perdre.
  return `x:${typeJourDe(c, isFerie, dow)}`;
}

function colonneLibelle(plage: RecapPlage | null, typeJour: string): string {
  if (!plage) return `Hors plage (${typeJour})`;
  if (plage.libelle && plage.libelle.trim()) return plage.libelle.trim();
  return `${plage.heure_debut}-${plage.heure_fin}`;
}

const ORDRE_TYPE_JOUR: Record<string, number> = { lun_ven: 0, samedi: 1, dimanche: 2, feries: 3, astreinte: 4 };

/** Duree d'un creneau d'astreinte planifie, en minutes. */
function dureeMinutes(a: RecapAstreinteCreneau): number {
  if (!a.date_fin) return 0;
  const d = new Date(a.date_debut).getTime();
  const f = new Date(a.date_fin).getTime();
  if (!Number.isFinite(d) || !Number.isFinite(f) || f <= d) return 0;
  return Math.round((f - d) / 60000);
}

export function buildRecapMensuel(params: {
  annee: number;
  mois: number;                   // 1-12
  courses: RecapCourse[];         // TOUTES les courses du mois (pas seulement les realisees)
  plages: RecapPlage[];
  feries: Set<string>;
  /** Astreintes realisees (compte + forfait). */
  sessions: RecapAstreinteSession[];
  /** Creneaux d'astreinte planifies (colonne "heures d'astreinte"). */
  creneaux: RecapAstreinteCreneau[];
  /** EUR par heure d'astreinte (onglet "Astreinte" de la grille tarifaire). */
  tarifHeureAstreinte: number;
  /** Complements greve deja saisis, par date : conserves entre deux recalculs. */
  complements?: Record<string, number>;
  /**
   * Heures d'astreinte saisies a la main (minutes, par date). Les creneaux
   * planifies ne couvrent pas toujours les astreintes reellement faites (un
   * chauffeur peut avoir 15 sessions confirmees pour 12 h planifiees) : la
   * saisie manuelle prend alors le pas sur le planning.
   */
  heuresManuelles?: Record<string, number>;
}): RecapMensuel {
  const { annee, mois, courses, plages, feries, sessions, creneaux, tarifHeureAstreinte } = params;
  const complements = params.complements || {};
  const heuresManuelles = params.heuresManuelles || {};

  const nbJours = new Date(annee, mois, 0).getDate();
  const jours: RecapJour[] = [];
  const colonnes = new Map<string, RecapColonne>();

  // Index des courses et des astreintes par jour calendaire de Mayotte.
  const coursesParJour = new Map<string, RecapCourse[]>();
  courses.forEach(c => {
    const d = mDateStr(c.date_heure);
    const list = coursesParJour.get(d);
    if (list) list.push(c); else coursesParJour.set(d, [c]);
  });
  const sessionsParJour = new Map<string, number>();
  sessions.forEach(s => sessionsParJour.set(s.date, (sessionsParJour.get(s.date) || 0) + 1));
  const creneauxParJour = new Map<string, RecapAstreinteCreneau[]>();
  creneaux.forEach(a => {
    const d = mDateStr(a.date_debut);
    const list = creneauxParJour.get(d);
    if (list) list.push(a); else creneauxParJour.set(d, [a]);
  });

  for (let d = 1; d <= nbJours; d++) {
    const date = `${annee}-${String(mois).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const jsDow = new Date(annee, mois - 1, d).getDay();
    const isFerie = feries.has(date);
    const dayCourses = coursesParJour.get(date) || [];
    const nbSessions = sessionsParJour.get(date) || 0;
    const dayCreneaux = creneauxParJour.get(date) || [];

    const parPlage: Record<string, number> = {};
    let planifies = 0, nonEffectues = 0, nonPlanifiesEffectues = 0, effectues = 0, valeur = 0;

    dayCourses.forEach(c => {
      const estPlanifie = c.statut_planification !== 'non_planifie';
      const estRealise = c.statut_realisation === 'termine';
      if (estPlanifie) planifies++;
      if (estPlanifie && !estRealise) nonEffectues++;
      if (!estPlanifie && estRealise) nonPlanifiesEffectues++;
      if (!estRealise) return;

      effectues++;
      valeur += c.montant || 0;
      const plage = plageDe(c, plages, isFerie);
      const key = colonneKey(plage, c, isFerie, mParts(c.date_heure).dow);
      parPlage[key] = (parPlage[key] || 0) + 1;
      if (!colonnes.has(key)) {
        const typeJour = typeJourDe(c, isFerie, mParts(c.date_heure).dow);
        colonnes.set(key, {
          key,
          libelle: colonneLibelle(plage, typeJour),
          tarif: plage?.tarif ?? 0,
          ordre: (ORDRE_TYPE_JOUR[plage?.type_jour || typeJour] ?? 9) * 100 + (plage?.ordre ?? 99),
        });
      }
    });

    const minutesPlanifiees = dayCreneaux.reduce((s, a) => s + dureeMinutes(a), 0);
    const heuresSaisies = Object.prototype.hasOwnProperty.call(heuresManuelles, date);
    const minutesAstreinte = heuresSaisies ? heuresManuelles[date] : minutesPlanifiees;
    const valeurAstreinte = Math.round((minutesAstreinte / 60) * tarifHeureAstreinte * 100) / 100;
    valeur += valeurAstreinte;

    jours.push({
      date,
      jourSemaine: jsDow === 0 ? 7 : jsDow,
      libelle: `${JOURS_FR[jsDow]} ${d} ${MOIS_FR[mois - 1]} ${annee}`,
      isFerie,
      minutesAstreinte,
      minutesPlanifiees,
      heuresSaisies,
      nbAstreintes: nbSessions,
      valeurAstreinte,
      planifies,
      nonEffectues,
      nonPlanifiesEffectues,
      effectues,
      parPlage,
      valeur,
      complementGreve: complements[date] || 0,
    });
  }

  const colonnesTriees = [...colonnes.values()].sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle));

  const totaux: RecapTotaux = {
    minutesAstreinte: 0, minutesPlanifiees: 0, nbAstreintes: 0, valeurAstreinte: 0,
    planifies: 0, nonEffectues: 0,
    nonPlanifiesEffectues: 0, effectues: 0, parPlage: {}, valeur: 0, complementGreve: 0,
  };
  jours.forEach(j => {
    totaux.minutesAstreinte += j.minutesAstreinte;
    totaux.minutesPlanifiees += j.minutesPlanifiees;
    totaux.nbAstreintes += j.nbAstreintes;
    totaux.valeurAstreinte += j.valeurAstreinte;
    totaux.planifies += j.planifies;
    totaux.nonEffectues += j.nonEffectues;
    totaux.nonPlanifiesEffectues += j.nonPlanifiesEffectues;
    totaux.effectues += j.effectues;
    totaux.valeur += j.valeur;
    totaux.complementGreve += j.complementGreve;
    colonnesTriees.forEach(col => {
      totaux.parPlage[col.key] = (totaux.parPlage[col.key] || 0) + (j.parPlage[col.key] || 0);
    });
  });

  return { colonnes: colonnesTriees, jours, totaux };
}

/** "03:00" a partir de minutes — format du tableau DAF. */
export function formatHeures(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "03:00" ou "3" ou "3,5" -> minutes. `null` si la saisie est illisible. */
export function parseHeures(saisie: string): number | null {
  const v = saisie.trim().replace(',', '.');
  if (v === '') return null;
  const hm = v.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const dec = Number(v);
  return Number.isFinite(dec) && dec >= 0 ? Math.round(dec * 60) : null;
}
