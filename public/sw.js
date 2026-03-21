const CACHE_NAME = 'whiteboards-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
];

// Install: cache the app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for static assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // External requests (APIs, fonts, CDNs) — let browser handle natively, don't intercept
  if (url.origin !== self.location.origin) return;

  // Static assets (JS, CSS, fonts) — cache first, update in background
  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // HTML pages — network first, fallback to cache
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Everything else — stale while revalidate
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ── Push Notifications (v8) ─────────────────────────────────────────

self.addEventListener('push', (e) => {
  if (!e.data) return;

  let data;
  try {
    data = e.data.json();
  } catch {
    data = { title: 'Whiteboards', body: e.data.text() };
  }

  const title = data.title || 'Whiteboards';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'whiteboards-push',
    data: {
      url: data.url || '/',
      taskId: data.taskId || null,
      action: data.action || 'open',
    },
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — open app or focus task
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const data = e.notification.data || {};
  const url = data.url || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if (data.taskId) {
            client.postMessage({ type: 'focus-task', taskId: data.taskId });
          }
          return;
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url);
    })
  );
});
