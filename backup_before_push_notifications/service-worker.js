const CACHE_NAME = 'dayikatik-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // API isteklerini cache'leme
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const cloned = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        return response;
      });
    })
  );
});

// ==========================================
// WEB PUSH NOTIFICATION HANDLERS
// ==========================================

self.addEventListener('push', event => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'Dayı Katık';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      image: data.image || undefined,
      tag: data.tag || 'dayikatik-notification',
      renotify: true,
      requireInteraction: data.priority === 'critical' || data.priority === 'high',
      data: {
        id: data.id,
        url: data.url || '/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('[Service Worker] Error displaying push notification:', err);
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('Dayı Katık', {
        body: text,
        icon: '/icons/icon-192.png',
        data: { url: '/' }
      })
    );
  }
});

self.addEventListener('notificationclick', event => {
  const notif = event.notification;
  notif.close();

  const targetUrl = new URL(notif.data.url, self.location.origin).href;

  event.waitUntil(
    fetch('/api/notifications/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notif.data.id })
    }).catch(err => console.error('[SW] Failed to track notification click:', err))
    .then(() => {
      return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        for (const client of clientList) {
          if (client.url === targetUrl || 'navigate' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      });
    })
  );
});
