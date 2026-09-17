// Etat d'un trajet et comptage, definis UNE fois pour toute l'application.
//
// Regles fixees par la direction le 08/09/2026 (tickets "Dashboard : trajets
// non effectues = trajet programme non remplace" et "le trajet de C3 du 07
// septembre sort en non effectue alors qu'il apparait fait") :
//
//   - Un trajet REMPLACE n'est PAS un trajet non effectue : il a bien ete
//     assure, par le remplacant. Le compter comme non effectue affichait 19
//     trajets manquants sur la L4 le 04/09 alors qu'il n'y en avait qu'un.
//   - Un trajet DEMARRE par le chauffeur mais jamais cloture a bien eu lieu :
//     c'est une cloture qui manque, pas un trajet manquant. Le trajet de 16h40
//     de C3 le 07/09, parti a 16h35 avec 8 passagers, doit compter comme
//     effectue. Il reste signale a part, car sans cloture il n'est pas facture.
//   - Un trajet NON EFFECTUE est donc un trajet programme, jamais parti, non
//     remplace, et dont l'heure est passee (ou annule / en incident).
//
// Ces definitions sont utilisees par le planning, le tableau de bord, les
// graphiques et les statistiques par ligne : les chiffres doivent concorder
// d'un ecran a l'autre.
//
// Complement du 17/09/2026 (ticket "les chiffres ne sont pas bons", exemples de
// la L3 les 01/08 et 11/08) :
//
//   - La course creee pour le REMPLACANT n'est pas un trajet planifie de plus :
//     c'est le meme trajet, assure par un autre. Le 01/08 : 89 planifies et non
//     102 ; le 11/08 : 155 et non 157.
//   - Trajets EFFECTUES = planifies - non effectues - remplaces + remplacements
//     (le 01/08 : 89 - 14 - 13 + 13 = 75). Un remplacement ne compte donc que
//     s'il a eu lieu ; un remplacant qui ne part jamais laisse le trajet NON
//     EFFECTUE.

export interface CourseStatut {
  date_heure: string;
  statut?: string | null;
  statut_realisation?: string | null;
  statut_planification?: string | null;
  notes?: string | null;
}

export type EtatTrajet =
  | 'effectue'      // termine par le chauffeur
  | 'demarre'       // parti mais jamais cloture : effectue, mais non facture
  | 'remplace'      // repris par un remplacant
  | 'non_effectue'  // programme, jamais parti (ou annule / incident)
  | 'a_venir';      // programme, l'heure n'est pas encore passee

/**
 * Course creee pour le remplacant (planning ou appli coordinateur) : elle est
 * posee "non planifiee" avec la note "[Remplacement]".
 *
 * Le statut de planification fait foi quand il est connu : la duplication d'une
 * semaine recopie la note "[Remplacement]" sur des courses redevenues de vrais
 * trajets planifies (353 en base au 17/09), qui ne sont pas des remplacements.
 */
export function estRemplacement(c: CourseStatut): boolean {
  if (c.statut_planification) return c.statut_planification === 'non_planifie';
  return (c.notes || '').startsWith('[Remplacement]');
}

export function etatTrajet(c: CourseStatut, maintenant: number = Date.now()): EtatTrajet {
  const st = c.statut_realisation || c.statut || '';
  if (st === 'termine' || st === 'terminee') return 'effectue';
  if (st === 'remplace') return 'remplace';
  if (st === 'annule' || st === 'annulee' || st === 'incident' || st === 'non_effectue') return 'non_effectue';
  if (st === 'en_cours' || st === 'en_retard') {
    // "en_retard" est un statut d'affichage : le trajet n'est pas parti pour
    // autant. Seul "en_cours" atteste d'un depart reel.
    return st === 'en_cours' ? 'demarre' : (new Date(c.date_heure).getTime() < maintenant ? 'non_effectue' : 'a_venir');
  }
  return new Date(c.date_heure).getTime() < maintenant ? 'non_effectue' : 'a_venir';
}

/** Le trajet a eu lieu (cloture ou non). */
export function aEuLieu(c: CourseStatut, maintenant?: number): boolean {
  const e = etatTrajet(c, maintenant);
  return e === 'effectue' || e === 'demarre';
}

export interface CompteTrajets {
  /** Trajets du planning, hors courses creees pour les remplacants. */
  planifies: number;
  /** Termines par le chauffeur. */
  termines: number;
  /** Partis mais jamais clotures : a regulariser, sinon non factures. */
  demarres: number;
  /** Termines + demarres : les trajets qui ont eu lieu. */
  effectues: number;
  /** Repris par un remplacant. */
  remplaces: number;
  /** Programmes, jamais partis, non remplaces (+ annules / incidents). */
  nonEffectues: number;
  /** Colonne demandee par la direction : non effectues + remplaces. */
  nonEffectuesOuRemplaces: number;
  /** Trajets assures A LA PLACE d'un autre chauffeur (ayant eu lieu). */
  remplacements: number;
  /** Trajets a venir (heure pas encore passee). */
  aVenir: number;
  /** (non effectues + remplaces) / planifies, en %. */
  tauxNonEffectues: number;
}

export function compterTrajets(courses: CourseStatut[], maintenant: number = Date.now()): CompteTrajets {
  let termines = 0, demarres = 0, remplaces = 0, nonEffectues = 0, aVenir = 0, remplacements = 0;
  let planifies = 0;
  for (const c of courses) {
    const rempl = estRemplacement(c);
    if (!rempl) planifies++;
    const etat = etatTrajet(c, maintenant);
    if (rempl && (etat === 'effectue' || etat === 'demarre')) remplacements++;
    switch (etat) {
      case 'effectue': termines++; break;
      case 'demarre': demarres++; break;
      case 'remplace': remplaces++; break;
      case 'non_effectue': nonEffectues++; break;
      default: aVenir++; break;
    }
  }
  const nonEffectuesOuRemplaces = nonEffectues + remplaces;
  return {
    planifies,
    termines,
    demarres,
    effectues: termines + demarres,
    remplaces,
    nonEffectues,
    nonEffectuesOuRemplaces,
    remplacements,
    aVenir,
    tauxNonEffectues: planifies > 0 ? (nonEffectuesOuRemplaces / planifies) * 100 : 0,
  };
}
