// Offline shell. Bump VERSION when files change.
const VERSION = 'deli-books-v1.3.1';
const FILES = ['./', 'index.html', 'app.css', 'db.js', 'sync.js', 'app.js', 'logo.svg', 'manifest.webmanifest', 'fonts/geist-latin-wght-normal.woff2', 'fonts/clash-display.woff2', 'fonts/logo-bricolage.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Sheets sync goes straight to the network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match('index.html'))));
});
