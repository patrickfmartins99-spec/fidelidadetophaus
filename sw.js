const CACHE_NAME = 'tophaus-fidelidade-v19';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo.jpg'
];

// Instala o novo cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache atualizado para:', CACHE_NAME);
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting(); // Força a instalação imediata
});

// Limpa os caches antigos (Faxina)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Apagando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Assume o controle da página imediatamente
});

// Intercepta as requisições (Offline)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Retorna o arquivo do cache se ele existir
      if (response) {
        return response;
      }
      // Caso contrário, busca na internet
      return fetch(event.request);
    })
  );
});
