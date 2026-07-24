/* V.E.R.A. service worker — offline shell + voice cache.
   Shell: network-first, so deploys always win when online.
   Voice MP3s: cache-first (immutable by convention — text edits rename keys).
   Cross-origin (brain worker, data feeds) is never intercepted or cached. */
const VERSION = 'vera-20260724064706';
const SHELL = VERSION + '-shell';
const VOICE = VERSION + '-voice';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys())
      if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;

  if (url.pathname.includes('/voice/')) {
    e.respondWith((async () => {
      const c = await caches.open(VOICE);
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    try {
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch {
      const hit = await c.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
      return hit || Response.error();
    }
  })());
});
