import { useEffect } from 'react';

type WakeLockLike = { release: () => Promise<void> };

/**
 * Maintient l'ecran allume tant que la page est affichee (Screen Wake Lock API).
 * Utile pour les chauffeurs/coordinateurs qui consultent leur planning sans
 * toucher l'ecran. Le navigateur relache le verrou quand l'onglet passe en
 * arriere-plan : on le reacquiert automatiquement au retour au premier plan.
 * Sans effet si l'API n'est pas disponible (contexte non securise, vieux navigateur).
 */
export function useKeepAwake() {
  useEffect(() => {
    let sentinel: WakeLockLike | null = null;
    let cancelled = false;
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: string) => Promise<WakeLockLike> };
    };

    const acquire = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === 'visible') {
          sentinel = await nav.wakeLock.request('screen');
        }
      } catch {
        // Non supporte ou refuse : on ignore silencieusement.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel && !cancelled) acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) {
        sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, []);
}
