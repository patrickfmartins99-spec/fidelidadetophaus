const CACHE_NAME = 'tophaus-fidelidade-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Instala o Service Worker e guarda os ficheiros em cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache aberto');
      return cache.addAll(urlsToCache);
    })
  );
});

// Intercepta os pedidos para funcionar sem internet
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Se encontrar no cache, retorna o cache. Se não, tenta a rede.
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});

