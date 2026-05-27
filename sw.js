/* ══════════════════════════════════════════════
   sw.js — Service Worker | خزنة المرور السحابية
   v2.1 — Cache + Offline Support
══════════════════════════════════════════════ */

const CACHE_NAME   = 'vault-v2.1';
const ASSETS_CACHE = 'vault-assets-v1';

/* الملفات الأساسية للكاش */
const SHELL_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './auth.js',
  './manifest.json'
];

/* الخطوط والمكتبات الخارجية */
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&family=Inter:wght@300;400;600;700;900&display=swap',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
];

/* ─── Install: تثبيت وكاش الملفات الأساسية ─── */
self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Installing v2.1...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Cache shell failed:', err))
  );
});

/* ─── Activate: تنظيف الكاش القديم ─── */
self.addEventListener('activate', (event) => {
  console.log('[SW] ✅ Activated v2.1');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== ASSETS_CACHE)
          .map(k => {
            console.log('[SW] 🗑️ Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ─── Fetch: استراتيجية Cache-First للـ shell، Network-First للباقي ─── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  /* تجاهل طلبات Firebase/Cloudinary/API الديناميكية */
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('emailjs.com') ||
    url.pathname.includes('/v1/') ||
    event.request.method !== 'GET'
  ) {
    return; /* اتركها تمر عادي */
  }

  /* Shell files: Cache-First */
  const isShell = SHELL_FILES.some(f => url.pathname.endsWith(f.replace('./', '')));
  if (isShell || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          /* صفحة أوف لاين بسيطة */
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  /* الخطوط والأصول الخارجية: Cache-First with Network Fallback */
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('jsdelivr.net') || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
  }
});

/* ─── Push Notification (مستقبلاً) ─── */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'خزنة المرور', {
    body: data.body || '',
    icon: data.icon || './icon-192.png',
    badge: './icon-192.png',
    dir: 'rtl',
    lang: 'ar'
  });
});

console.log('[SW] 🔐 خزنة المرور — Service Worker Loaded v2.1');
