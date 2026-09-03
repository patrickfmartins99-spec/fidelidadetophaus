const CACHE_NAME = 'tophaus-fidelidade-v68-private-audit';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './logo.jpg',
  './style.css',
  './totem.css',
  './bootstrap.js',
  './core.js',
  './firebase.js',
  './auth.js',
  './clientes.js',
  './marketing.js',
  './totem.js',
  './dashboard.js',
  './fragments/access.html',
  './fragments/dashboard.html',
  './fragments/admin-modals.html',
  './fragments/totem.html',
  './fragments/print.html',
  './qrcode.png',
  './qrcode tophaus piçarras.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match('./index.html')) ||
          Response.error()
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const refreshed = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || refreshed;
    })
  );
});

