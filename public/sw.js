const CACHE_NAME = 'svoydom-crm-static-v6';
const PRECACHE_URLS = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      ),
      self.clients.claim(),
    ])
  );
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

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (error) {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

async function setBadge(count = 1) {
  try {
    if (self.navigator?.setAppBadge) {
      await self.navigator.setAppBadge(count);
    }
  } catch {
    // Badge support is browser-specific. Push delivery must not depend on it.
  }
}

async function clearBadge() {
  try {
    if (self.navigator?.clearAppBadge) {
      await self.navigator.clearAppBadge();
    }
  } catch {
    // Ignore unsupported badge API.
  }
}

self.addEventListener('push', (event) => {
  const data = readPushPayload(event);
  const title = data.title || 'СвойДом CRM';
  const targetUrl = data.url || '/admin/dashboard';
  const badgeCount = Number(data.badgeCount || 1);
  const actions = self.Notification?.maxActions > 0
    ? [{ action: 'open', title: 'Открыть CRM' }]
    : [];

  event.waitUntil((async () => {
    await setBadge(badgeCount);
    await self.registration.showNotification(title, {
      body: data.body || 'Новое событие в CRM',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/favicon-96x96.png',
      image: data.image,
      tag: data.tag || `svoydom-crm-${Date.now()}`,
      renotify: Boolean(data.tag),
      vibrate: [180, 80, 180],
      requireInteraction: Boolean(data.requireInteraction),
      timestamp: data.timestamp || Date.now(),
      actions,
      data: {
        url: targetUrl,
        type: data.type || 'crm',
      },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/admin/dashboard', self.location.origin).href;

  event.waitUntil((async () => {
    await clearBadge();
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        return 'navigate' in client ? client.navigate(targetUrl) : client;
      }
    }
    return clients.openWindow(targetUrl);
  })());
});

self.addEventListener('notificationclose', (event) => {
  event.waitUntil(clearBadge());
});
