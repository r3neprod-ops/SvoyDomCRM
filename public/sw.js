const CACHE_NAME = 'svoydom-crm-static-v2';
const PRECACHE_URLS = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] push event received', event.data?.text?.() ?? '(no data)');
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch (err) {
    console.error('[SW] Failed to parse push payload as JSON:', err, event.data?.text?.());
  }
  console.log('[SW] push data:', data);

  event.waitUntil(
    self.registration.showNotification(data.title || 'Уведомление', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'svoydom-crm',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      data: { url: data.url || '/admin/dashboard' },
    }).then(() => {
      console.log('[SW] Notification shown successfully');
    }).catch((err) => {
      console.error('[SW] showNotification failed:', err);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] notificationclick', event.notification.data);
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/admin/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          console.log('[SW] Focusing existing window');
          return client.focus();
        }
      }
      console.log('[SW] Opening new window:', targetUrl);
      return clients.openWindow(targetUrl);
    })
  );
});
