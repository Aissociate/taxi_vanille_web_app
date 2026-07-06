import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

/**
 * Mise a jour a distance (OTA) de l'app chauffeur/coordinateur.
 *
 * Principe : l'APK installe sur le telephone ne change plus. A chaque
 * correctif, on publie un nouveau bundle web (le contenu de web/dist) sur
 * Supabase Storage via `npm run publish:ota`. Au lancement suivant, l'app
 * telecharge ce bundle et l'applique. Aucun passage par un store.
 *
 * Cote web (tableau de bord directeur ouvert dans un navigateur), ce module
 * ne fait rien : tout est garde derriere `Capacitor.isNativePlatform()`.
 */

// Manifeste public ecrit par le script de publication (scripts/publish-ota.mjs).
const MANIFEST_URL =
  'https://decmcmviiknbkcsamuow.supabase.co/storage/v1/object/public/ota/manifest/chauffeur.json';

type OtaManifest = {
  version: string; // ex: "1.4.0"
  url: string; // URL publique du .zip du bundle web
  notes?: string;
};

// Compare deux versions "x.y.z". Renvoie true si `candidate` est plus recente.
// Le bundle natif d'origine a pour version "builtin" -> traite comme la plus ancienne.
function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * A appeler une fois au demarrage de l'app.
 * - Confirme d'abord que le bundle actif fonctionne (notifyAppReady), sinon
 *   Capgo restaure automatiquement le bundle precedent (securite anti-brique).
 * - Si une version plus recente est disponible, la telecharge en silence et la
 *   programme pour le PROCHAIN lancement : aucune interruption en cours d'usage.
 */
export async function initOTA(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Valide le bundle courant. Indispensable : sans cet appel, Capgo considere
  // le demarrage comme un echec et revient a l'ancienne version.
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch {
    // Plugin natif absent (ex: ancien APK sans OTA) : rien a faire.
    return;
  }

  try {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return; // aucun manifeste publie pour l'instant
    const manifest = (await res.json()) as OtaManifest;
    if (!manifest?.version || !manifest?.url) return;

    const current = await CapacitorUpdater.current();
    const currentVersion = current?.bundle?.version ?? 'builtin';
    if (!isNewer(manifest.version, currentVersion)) return;

    // Telechargement silencieux en arriere-plan.
    const bundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
    });

    // Active au prochain demarrage (pas de rechargement brutal de l'ecran).
    await CapacitorUpdater.next({ id: bundle.id });
    console.info(`[OTA] Version ${manifest.version} prete, active au prochain lancement.`);
  } catch (err) {
    console.warn('[OTA] Verification/telechargement echoue:', err);
  }
}
