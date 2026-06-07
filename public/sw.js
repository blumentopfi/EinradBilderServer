// Service worker for Einrad Bildergalerie
// - Precaches the static shell so the app opens fast and works offline for assets.
// - Stale-while-revalidate for same-origin static assets (CSS/JS/PNG).
// - Never caches /api/*, /share/*, or /api/share/* (auth + tokens — caching would leak data
//   across sessions and keep expired share pages alive).

const CACHE_VERSION = 'v1-2026-06-07-cyan-png2';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/medien.html',
  '/faq.html',
  '/styles.css',
  '/admin.css',
  '/faq.css',
  '/app.js',
  '/admin.js',
  '/faq.js',
  '/dark-mode.js',
  '/onewheel-logo.png',
  '/onewheel-header-logo.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => {
        // If precache fails (e.g. offline first load), don't block install.
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// Paths we must never cache. These are auth-gated or token-scoped; caching them could
// leak a previous user's data or keep a revoked/expired share visible.
function isUncacheable(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/share/') ||
    url.pathname === '/login' ||
    url.pathname === '/logout' ||
    url.pathname === '/check-auth'
  );
}

function isStaticAsset(url) {
  return /\.(css|js|png|webmanifest)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GETs; everything else (POST/PUT/DELETE) passes through.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only same-origin. Let the browser handle cross-origin normally.
  if (url.origin !== self.location.origin) return;

  // Hands off anything auth- or token-gated.
  if (isUncacheable(url)) return;

  // Stale-while-revalidate for static assets.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Navigation requests: try network, fall back to cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      // Only cache basic 200 responses. Opaque/redirect/error stays uncached.
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkPromise || fetch(request);
}
