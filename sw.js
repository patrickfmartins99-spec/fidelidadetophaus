const CACHE_NAME = 'tophaus-fidelidade-v5';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo.jpg' /* <-- Adicione a logo aqui para ela funcionar sem internet */
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache aberto');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});
