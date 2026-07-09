import { useState, useCallback } from 'react';
import type { Chauffeur, UserRole } from './types';

const SESSION_KEY = 'mobile_auth_session';
// Fenetre d'ouverture HORS-LIGNE sans re-saisir code+PIN. Volontairement longue
// (terrain : reseau instable a Mayotte) et glissante -> tant que le chauffeur
// utilise l'appli en ligne de temps en temps (voir refreshSessionExpiry), elle
// ne l'oblige jamais a se reconnecter. Le credential reste le code + PIN.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredSession {
  chauffeur: Chauffeur;
  role: UserRole;
  expiresAt: number;
}

function loadSession(): { chauffeur: Chauffeur; role: UserRole } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { chauffeur: session.chauffeur, role: session.role };
  } catch {
    return null;
  }
}

const stored = loadSession();
let currentChauffeur: Chauffeur | null = stored?.chauffeur ?? null;
let currentRole: UserRole | null = stored?.role ?? null;
let listeners: (() => void)[] = [];

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(chauffeur: Chauffeur, role: UserRole) {
  currentChauffeur = chauffeur;
  currentRole = role;
  const session: StoredSession = {
    chauffeur,
    role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notify();
}

export function clearAuth() {
  currentChauffeur = null;
  currentRole = null;
  localStorage.removeItem(SESSION_KEY);
  notify();
}

// Prolonge la fenetre hors-ligne a chaque usage reussi EN LIGNE : la session
// expire 30 jours apres la derniere fois ou l'appli a pu joindre le serveur,
// pas 30 jours apres le login. Un chauffeur actif n'est donc jamais deconnecte.
export function refreshSessionExpiry() {
  if (!currentChauffeur || !currentRole) return;
  const session: StoredSession = {
    chauffeur: currentChauffeur,
    role: currentRole,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage plein : sans effet, la session precedente reste valide.
  }
}

export function useAuth() {
  const [, setTick] = useState(0);

  const subscribe = useCallback(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  useState(() => {
    const unsub = subscribe();
    return unsub;
  });

  return { chauffeur: currentChauffeur, role: currentRole };
}
