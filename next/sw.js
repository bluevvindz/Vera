/* V.E.R.A. service worker — offline shell + voice cache.
   Shell: network-first with forced revalidation ({ cache: 'no-cache' }), so
   deploys win the moment a visitor is online — the HTTP cache never interposes.
   Voice MP3s: cache-first under rangeless keys; ranged media requests get
   synthesized 206 slices (Cache.put rejects real 206s, so never store them).
   Voice entries migrate across versions; filenames are content-stable
   (the build re-voices a line whenever its text changes).
   Cross-origin (brain worker, data feeds) is never intercepted or cached. */
const VERSION = 'vera-20260809162812-stage';
const SHELL = VERSION + '-shell';
const VOICE = VERSION + '-voice';
/* Scope-relative, never root-absolute: on a subpath deploy (a GitHub Pages
   project site at user.github.io/repo/) root paths resolve to the ORIGIN
   root, 404 silently, and install "succeeds" with an empty cache. Every
   asset resolves against registration scope so any mount path works. */
const SHELL_ASSETS = ['./', './index.html', './reactor.html', './map.html',
  './demo_pwa.js', './demo_config.js', './voice_map.js', './demo_wake.js',
  './demo_entry.js', './demo_panels.js', './demo_boot.js', './demo_live.js', './map_interview.js',
  './brain_data.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const inScope = u => new URL(u, self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(SHELL_ASSETS.map(u => {
      const abs = inScope(u);
      return fetch(abs, { cache: 'no-cache' })
        .then(r => r.status === 200 ? c.put(abs, r) : undefined)
        .catch(() => {});
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const oldVoice = keys.find(k => k.endsWith('-voice') && !k.startsWith(VERSION));
    if (oldVoice) {  // a deploy must not re-download 26 MP3s
      const src = await caches.open(oldVoice);
      const dst = await caches.open(VOICE);
      for (const req of await src.keys()) {
        const hit = await src.match(req);
        if (hit) await dst.put(req, hit);
      }
    }
    for (const k of keys)
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
      const full = await c.match(url.href);
      if (!full) {
        const r = await fetch(e.request);
        if (r.status === 200) e.waitUntil(c.put(url.href, r.clone()).catch(() => {}));
        else if (r.status === 206)  // media asked for a range: cache a rangeless copy aside
          e.waitUntil(fetch(url.href).then(f => f.status === 200 ? c.put(url.href, f) : undefined).catch(() => {}));
        return r;
      }
      const range = e.request.headers.get('range');
      const m = range && /bytes=(\d+)-(\d*)/.exec(range);
      if (!m) return full;
      const buf = await full.arrayBuffer();
      const start = +m[1];
      const end = m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
      return new Response(buf.slice(start, end + 1), {
        status: 206,
        headers: {
          'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg',
          'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
          'Content-Length': String(end - start + 1),
        },
      });
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    try {
      const r = await fetch(e.request, { cache: 'no-cache' });
      if (r.status === 200) e.waitUntil(c.put(e.request, r.clone()).catch(() => {}));
      return r;
    } catch {
      let hit = await c.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
      if (!hit && e.request.mode === 'navigate') {
        // The scope root and its index are one page — derived, never '/' literals.
        const root = inScope('./'), index = inScope('./index.html');
        if (url.href.split('?')[0] === root)
          hit = await c.match(index, { ignoreSearch: true });
        else if (url.href.split('?')[0] === index)
          hit = await c.match(root, { ignoreSearch: true });
      }
      return hit || Response.error();
    }
  })());
});
