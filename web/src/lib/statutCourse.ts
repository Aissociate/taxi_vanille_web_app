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

export interface CourseStatut {
  date_heure: string;
  statut?: string | null;
  statut_realisation?: string | null;
  notes?: string | null;
}

export type EtatTrajet =
  | 'effectue'      // termine par le chauffeur
  | 'demarre'       // parti mais jamais cloture : effectue, mais non facture
  | 'remplace'      // repris par un remplacant
  | 'non_effectue'  // programme, jamais parti (ou annule / incident)
  | 'a_venir';      // programme, l'heure n'est pas encore passee

/** Marqueur pose par le planning sur la course creee pour le remplacant. */
export function estRemplacement(c: CourseStatut): boolean {
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
  /** Tous les trajets de la selection. */
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
  /** Trajets assures A LA PLACE d'un autre chauffeur. */
  remplacements: number;
  /** Trajets a venir (heure pas encore passee). */
  aVenir: number;
  /** (non effectues + remplaces) / planifies, en %. */
  tauxNonEffectues: number;
}

export function compterTrajets(courses: CourseStatut[], maintenant: number = Date.now()): CompteTrajets {
  let termines = 0, demarres = 0, remplaces = 0, nonEffectues = 0, aVenir = 0, remplacements = 0;
  for (const c of courses) {
    if (estRemplacement(c)) remplacements++;
    switch (etatTrajet(c, maintenant)) {
      case 'effectue': termines++; break;
      case 'demarre': demarres++; break;
      case 'remplace': remplaces++; break;
      case 'non_effectue': nonEffectues++; break;
      default: aVenir++; break;
    }
  }
  const planifies = courses.length;
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
