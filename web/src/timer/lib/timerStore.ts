import { useState, useCallback } from 'react';
import type { Chauffeur } from '../../mobile/lib/types';

// Session d'auth de l'app TIMER, VOLONTAIREMENT separee de l'app chauffeur
// (cle localStorage distincte) : les deux apps n'interagissent pas. Acces
// chauffeur uniquement (pas de role coordinateur ici).
const SESSION_KEY = 'timer_auth_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredSession {
  chauffeur: Chauffeur;
  expiresAt: number;
}

function loadSession(): Chauffeur | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s: StoredSession = JSON.parse(raw);
    if (Date.now() > s.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s.chauffeur;
  } catch {
    return null;
  }
}

let currentChauffeur: Chauffeur | null = loadSession();
let listeners: (() => void)[] = [];
function notify() { listeners.forEach((l) => l()); }

export function setAuth(chauffeur: Chauffeur) {
  currentChauffeur = chauffeur;
  const session: StoredSession = { chauffeur, expiresAt: Date.now() + SESSION_TTL_MS };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notify();
}

export function clearAuth() {
  currentChauffeur = null;
  localStorage.removeItem(SESSION_KEY);
  notify();
}

export function refreshSessionExpiry() {
  if (!currentChauffeur) return;
  const session: StoredSession = { chauffeur: currentChauffeur, expiresAt: Date.now() + SESSION_TTL_MS };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* plein */ }
}

export function useAuth() {
  const [, setTick] = useState(0);
  const subscribe = useCallback(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.push(listener);
    return () => { listeners = listeners.filter((l) => l !== listener); };
  }, []);
  useState(() => subscribe());
  return { chauffeur: currentChauffeur };
}
