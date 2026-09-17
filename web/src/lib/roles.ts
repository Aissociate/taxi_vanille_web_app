// Roles du back office (ticket "Role des utilisateurs", 17/09/2026).
//
// Le role est stocke dans la table `user_roles` ; un compte sans role reste
// administrateur (personne n'est enferme dehors a la mise en ligne).
//
// "En lecture" : la page s'affiche, mais toute ecriture en base est refusee par
// le client Supabase (lib/supabase, setLectureSeule) avec un message clair, et
// un bandeau le signale en haut de page.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Page } from '../components/Sidebar';

export type Role = 'administrateur' | 'exploitation' | 'facturation' | 'gerant';

export const ROLES: { id: Role; libelle: string; description: string }[] = [
  { id: 'administrateur', libelle: 'Administrateur', description: 'Tous les droits' },
  { id: 'exploitation', libelle: 'Responsable exploitation', description: 'Dashboard, planning, statistiques, developpement, incidents, carte GPS, chauffeurs en lecture' },
  { id: 'facturation', libelle: 'Facturation', description: 'Dashboard, carte GPS, chauffeurs, clients, facturation, stats par ligne, planning en lecture' },
  { id: 'gerant', libelle: 'Gerant', description: 'Dashboard, planning en lecture, carte GPS, chauffeurs en lecture, clients, facturation en lecture, stats par ligne en lecture' },
];

type Acces = 'ecriture' | 'lecture';

const MATRICE: Record<Exclude<Role, 'administrateur'>, Partial<Record<Page, Acces>>> = {
  exploitation: {
    dashboard: 'ecriture',
    planning: 'ecriture',
    'stats-ligne': 'ecriture',
    developpement: 'ecriture',
    incidents: 'ecriture',
    'carte-gps': 'ecriture',
    chauffeurs: 'lecture',
  },
  facturation: {
    dashboard: 'ecriture',
    'carte-gps': 'ecriture',
    chauffeurs: 'ecriture',
    clients: 'ecriture',
    facturation: 'ecriture',
    'stats-ligne': 'ecriture',
    planning: 'lecture',
  },
  gerant: {
    dashboard: 'ecriture',
    planning: 'lecture',
    'carte-gps': 'ecriture',
    chauffeurs: 'lecture',
    clients: 'ecriture',
    facturation: 'lecture',
    'stats-ligne': 'lecture',
  },
};

/** Acces d'un role a une page : null si la page lui est fermee. */
export function accesPage(role: Role, page: Page): Acces | null {
  if (role === 'administrateur') return 'ecriture';
  return MATRICE[role][page] || null;
}

export function libelleRole(role: Role): string {
  return ROLES.find(r => r.id === role)?.libelle || role;
}

/** Role de l'utilisateur connecte (administrateur tant qu'il n'est pas charge
 *  ou si aucun role n'est pose). */
export function useRole(userId: string | undefined): { role: Role; charge: boolean } {
  const [role, setRole] = useState<Role>('administrateur');
  const [charge, setCharge] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let annule = false;
    supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle().then(({ data }) => {
      if (annule) return;
      setRole(((data as { role?: Role } | null)?.role) || 'administrateur');
      setCharge(true);
    });
    return () => { annule = true; };
  }, [userId]);
  return { role, charge };
}
