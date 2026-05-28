/* ══════════════════════════════════════════════
   sw.js — Service Worker | خزنة المرور السحابية
   Network-First — يجلب دائماً من الشبكة أولاً
   الكاش فقط للوضع الـ Offline
══════════════════════════════════════════════ */

/* ── رقم الإصدار — يتغير تلقائياً بكل deploy ── */
const BUILD_TIME  = '1779929884'; /* يُستبدل بـ timestamp حقيقي */
const CACHE_NAME  = 'vault-v' + BUILD_TIME;

/* ── الملفات المهمة ── */
const CORE_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

/* ══════════════════════════════════════════════
   Install — تخزين أولي خفيف
══════════════════════════════════════════════ */
self.addEventListener('install', event => {
  console.log('[SW] 🔧 Installing...');
  /* skipWaiting فوراً — لا ننتظر إغلاق التبويبات القديمة */
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_FILES).catch(err => {
        console.warn('[SW] Cache prefetch partial fail:', err);
      });
    })
  );
});

/* ══════════════════════════════════════════════
   Activate — احذف كل الكاشات القديمة فوراً
══════════════════════════════════════════════ */
self.addEventListener('activate', event => {
  console.log('[SW] ✅ Activated — clearing old caches');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] 🗑️ Deleting:', k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      /* أخبر كل التبويبات المفتوحة بالتحديث فوراً */
      return self.clients.claim();
    })
  );
});

/* ══════════════════════════════════════════════
   Fetch — Network-First لكل الملفات المهمة
   الكاش فقط عند فشل الشبكة (Offline)
══════════════════════════════════════════════ */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* ── تجاهل طلبات Firebase / Cloudinary / API ── */
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('emailjs.com') ||
    url.hostname.includes('recaptcha') ||
    event.request.method !== 'GET'
  ) {
    return; /* اتركها تمر بدون تدخل */
  }

  /* ── الملفات الأساسية: Network-First ── */
  const isCore = CORE_FILES.some(f =>
    url.pathname.endsWith(f.replace('./', '/'))
  ) || url.pathname === '/' || url.pathname.endsWith('/asd/');

  if (isCore || url.origin === self.location.origin) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  /* ── الخطوط والمكتبات الخارجية: Cache-First ── */
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirst(event.request));
  }
});

/* ══════════════════════════════════════════════
   Network-First: جرّب الشبكة، فشل → الكاش
══════════════════════════════════════════════ */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    /* حاول جلب من الشبكة */
    const networkResponse = await fetch(request, { cache: 'no-store' });
    if (networkResponse && networkResponse.status === 200) {
      /* احفظ النسخة الجديدة في الكاش */
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    /* فشلت الشبكة → ارجع للكاش (Offline mode) */
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] 📦 Offline — serving from cache:', request.url);
      return cached;
    }
    /* لا شبكة ولا كاش → صفحة index.html */
    if (request.destination === 'document') {
      return cache.match('./index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

/* ══════════════════════════════════════════════
   Cache-First: للموارد الخارجية الثابتة فقط
══════════════════════════════════════════════ */
async function cacheFirst(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

/* ══════════════════════════════════════════════
   Message: أمر يدوي لمسح الكاش من التطبيق
══════════════════════════════════════════════ */
self.addEventListener('message', event => {
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => {
      event.source?.postMessage('CACHE_CLEARED');
      console.log('[SW] 🧹 All caches cleared');
    });
  }
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] 🔐 خزنة المرور — Network-First SW Loaded');
