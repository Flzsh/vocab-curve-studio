const CACHE = 'vocab-curve-studio-v7-capacity-polish';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './sample_100_words_import.txt', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith('vocab-curve-studio')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match('./index.html'))));
});
