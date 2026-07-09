// Service worker Taxi Vanille — rend l'app installable (PWA) et permet de
// l'ouvrir hors-ligne. Strategie : network-first sur les fichiers de l'app
// (memes-origine), avec repli sur le cache. Les appels vers Supabase
// (origine differente) ne sont PAS interceptes : l'auth et les donnees passent
// directement au reseau, et la resilience hors-ligne des donnees est geree cote
// appli (cache localStorage du planning, file d'attente).
const CACHE = 'tv-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ne toucher qu'aux ressources de notre propre origine (le shell de l'app).
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await cache.match(req);
      if (cached) return cached;
      // Navigation hors-ligne : servir l'app shell deja en cache.
      if (req.mode === 'navigate') {
        const shell =
          (await cache.match('/mobile')) ||
          (await cache.match('/index.html')) ||
          (await cache.match('/'));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
