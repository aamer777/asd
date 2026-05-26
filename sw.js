// ── خزنة المرور السحابية — Service Worker v1.0 ──
const CACHE_NAME = 'vault-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&display=swap',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
];

// ── التثبيت: تخزين الأصول الأساسية ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(['./', './index.html']).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ── التفعيل: حذف الكاش القديم ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── الاعتراض: Network First ثم الكاش ──
self.addEventListener('fetch', event => {
  // تجاهل طلبات Firebase وCloudinary (تحتاج إنترنت دائماً)
  const url = event.request.url;
  if (
    url.includes('firebasejs') ||
    url.includes('firestore') ||
    url.includes('googleapis.com/identitytoolkit') ||
    url.includes('cloudinary') ||
    url.includes('emailjs') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // تخزين النسخة الجديدة في الكاش
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // عند انقطاع الإنترنت، ارجع للكاش
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // إذا لم يوجد في الكاش، أرجع الصفحة الرئيسية
          return caches.match('./index.html');
        });
      })
  );
});
