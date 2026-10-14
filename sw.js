// Offline shell. Bump VERSION when files change.
const VERSION = 'deli-books-v2.2.0';
const FILES = ['./', 'index.html', 'app.css', 'themes.css', 'db.js', 'sync.js', 'js/core.js', 'js/icons.js', 'js/charts.js', 'js/pad.js', 'js/ui.js', 'js/home.js', 'js/entry.js', 'js/money.js', 'js/checks.js', 'js/clover.js', 'js/settings.js', 'js/lock.js', 'js/notify.js', 'js/insights.js', 'js/report.js', 'js/main.js', 'logo.svg', 'manifest.webmanifest', 'fonts/inter-latin-wght-normal.woff2', 'fonts/satoshi-var.woff2', 'fonts/general-sans-var.woff2', 'fonts/cabinet-grotesk-var.woff2', 'fonts/fraunces-opsz.woff2', 'fonts/logo-bricolage.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Sheets sync goes straight to the network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match('index.html'))));
});
// Tapping a close-out reminder opens that shift's entry screen.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '#home';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'open', url }); return c.focus(); }
    return self.clients.openWindow(self.registration.scope + url);
  }));
});
