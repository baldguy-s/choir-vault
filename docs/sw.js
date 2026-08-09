/* Choir Materials — service worker
   Two caches:
   - shell cache: the app itself (HTML/CSS/JS/icons/manifest), precached on install
   - media cache: audio + sheet music images, cached on demand

   songs.json uses network-first so the song list is always current.
   Bump both version strings whenever app-shell files change.
*/

const SHELL_CACHE = 'choir-materials-shell-v5';
const MEDIA_CACHE = 'choir-materials-media-v2';

const SHELL_FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== SHELL_CACHE && key !== MEDIA_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isMediaRequest(url) {
  return url.pathname.includes('/audio/') || url.pathname.includes('/images/');
}

function isSongsJson(url) {
  return url.pathname.endsWith('songs.json');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isSongsJson(url)) {
    // Network-first: always try to get the latest song list;
    // fall back to cache only when offline.
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(MEDIA_CACHE).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  const cacheName = isMediaRequest(url) ? MEDIA_CACHE : SHELL_CACHE;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(cacheName).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') {
          return caches.match('index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline and not cached' });
      });
    })
  );
});
