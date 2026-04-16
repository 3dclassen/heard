const CACHE_NAME = 'heard-v2';

// Statische App-Dateien die gecacht werden
const STATIC_ASSETS = [
  './',
  './index.html',
  './timetable.html',
  './crew.html',
  './admin.html',
  './css/style.css',
  './js/firebase.js',
  './js/app.js',
  './js/rating.js',
  './js/timetable.js',
  './js/sync.js',
  './js/admin.js',
  './js/crew.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: statische Assets vorab cachen
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).then(() => self.skipWaiting())
  );
});

// Activate: alte Caches löschen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache first für statische Assets, Network first für Firebase
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase und Google Auth: immer Network (kein Cache)
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return; // Browser-Standard verwenden
  }

  // Statische Assets: Cache first, dann Network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline-Fallback: index.html für Navigation-Requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Sync-Event: Pending Ratings nach Firebase hochladen (wenn wieder online)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-ratings') {
    event.waitUntil(syncPendingRatings());
  }
});

async function syncPendingRatings() {
  // Die eigentliche Sync-Logik läuft in sync.js im App-Kontext
  // Hier nur ein Signal senden dass Sync gestartet werden soll
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }));
}
