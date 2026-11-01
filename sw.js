/* Nessa-Schreib-App: isolierter Cache ohne Eingriff in Caches anderer Apps. */
const CACHE = 'nessa-writer-v12-repair';
const SHELL = ['./','./index.html','./styles-v10.css','./app-v10.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const SCOPE = new URL('./', self.registration.scope);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('nessa-writer-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, {cache: 'no-store'}).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy)).catch(() => {});
        }
        return response;
      }).catch(async () => (await caches.match('./index.html')) || (await caches.match('./')))
    );
    return;
  }
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
