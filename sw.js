// Iron Ledger service worker — offline-first for the gym.
// Everything cached here is either public (icons, manifest) or encrypted
// (index.html payload, cookbook.enc), so caching is safe.
// Strategy: serve from cache immediately, refresh the cache in the background;
// updates apply on the next launch.
const CACHE = 'iron-ledger-v1';
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

  // All navigations within scope are the same single page.
  const cacheKey = req.mode === 'navigate' ? './' : req;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(cacheKey);
      const refresh = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(cacheKey, res.clone());
        return res;
      }).catch(() => null);
      if (cached) return cached;
      const fresh = await refresh;
      return fresh || new Response('Offline — and this page is not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })
  );
});
