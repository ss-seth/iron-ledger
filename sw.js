// Iron Ledger service worker — offline-capable, but fresh-first for the app.
// Everything cached here is either public (icons, manifest) or encrypted
// (index.html payload, cookbook.enc), so caching is safe.
//
// Strategy:
//   • Page / app shell  -> NETWORK-FIRST: always try the latest build, fall
//     back to cache only when offline. This means a new deploy shows up on the
//     next load with signal — no "relaunch twice" dance.
//   • Static assets (icons, manifest, cookbook.enc, fonts) -> CACHE-FIRST with
//     background refresh: they're big and/or rarely change.
const CACHE = 'iron-ledger-v2';
const PRECACHE = ['./', 'manifest.json', 'cookbook.enc', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  // The app shell is a single page — every in-scope navigation maps to './'.
  const isShell = req.mode === 'navigate' ||
    (url.origin === self.location.origin && (url.pathname === '/' || url.pathname.endsWith('/index.html')));

  if (isShell) {
    // Network-first: latest build wins; cache is the offline safety net.
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        try {
          const fresh = await fetch('./', { cache: 'no-store' });
          if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put('./', fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await cache.match('./');
          return cached || new Response('Offline — and this page is not cached yet.',
            { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })
    );
    return;
  }

  // Everything else: cache-first, refresh in the background.
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const refresh = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) return cached;
      const fresh = await refresh;
      return fresh || new Response('Offline — asset not cached.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })
  );
});
