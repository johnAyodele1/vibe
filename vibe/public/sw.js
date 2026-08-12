// vibe/public/sw.js

// ── Firebase Cloud Messaging (FCM) Integration ───────────────────────
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Helper to get the correct API URL based on environment
const getApiUrl = () => {
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  return 'https://zippo-r8hk.onrender.com/api';
};

const API_BASE_URL = getApiUrl();

const initFirebaseInSW = async () => {
  try {
    console.log('[SW] Fetching firebase config from:', `${API_BASE_URL}/config/firebase`);
    const response = await fetch(`${API_BASE_URL}/config/firebase`);
    if (!response.ok) {
      throw new Error(`Failed to fetch firebase config: ${response.status} ${response.statusText}`);
    }
    const firebaseConfig = await response.json();
    console.log('[SW] Initializing Firebase with config');
    firebase.initializeApp(firebaseConfig);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[SW] Received background FCM message ', payload);

      const title = payload.notification?.title || payload.data?.title || 'New Notification';
      const body = payload.notification?.body || payload.data?.body || 'You have a new update';

      const notificationOptions = {
        body: body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        data: payload.data,
        vibrate: [100, 50, 100],
        tag: payload.data?.type || 'general',
        renotify: true
      };

      return self.registration.showNotification(title, notificationOptions);
    });
  } catch (error) {
    console.error('[SW] Error initializing Firebase in Service Worker:', error);
  }
};

// Initialize FCM in background
initFirebaseInSW();

// ── Custom PWA / Web Push Cache versioning & update management ───────
const SW_VERSION  = 'zippo-v5';      // INCREMENTED VERSION
const CACHE_NAME  = `${SW_VERSION}-static`;

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',    // fallback page
  '/manifest.json',
  '/favicon.svg',
];

// ── Install: cache only essential assets ─────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', SW_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching essential assets...');
      return cache.addAll(PRECACHE_ASSETS)
        .then(() => console.log('[SW] Assets cached successfully'))
        .catch(err => console.error('[SW] Cache pre-fill failed:', err.message));
    }).then(() => {
      // CRITICAL: skip waiting so new SW takes over immediately
      return self.skipWaiting();
    })
  );
});

// ── Activate: delete old caches immediately ───────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', SW_VERSION);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Old caches cleared. Taking control of clients...');
      return self.clients.claim();  // take control of all open pages NOW
    }).then(() => {
      // Tell all open clients to reload with the new version
      return self.clients.matchAll({ type: 'window' }).then(clientsList => {
        console.log('[SW] Notifying', clientsList.length, 'client(s) to reload');
        clientsList.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
        });
      });
    })
  );
});

// ── Fetch: Network First strategy for app assets ──────────────────────
// NEVER serve stale JS/CSS for the app — always try network first
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls — always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/api/v1/')) return;

  // Skip socket.io connections
  if (url.pathname.startsWith('/socket.io/')) return;

  // For app assets (JS/CSS/fonts): Network First, fall back to cache
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => {
          console.log('[SW] Network failed for asset, trying cache:', url.pathname);
          return caches.match(event.request);
        })
    );
    return;
  }

  // For HTML pages: Network First, fall back to '/' cached, then offline.html
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(async () => {
          console.log('[SW] Network failed for HTML, serving offline fallback');
          const cached = await caches.match(event.request)
                      || await caches.match('/')
                      || await caches.match('/offline.html');
          return cached;
        })
    );
    return;
  }
});

// ── Custom Push event listener with proper options ──────────────────
self.addEventListener('push', (event) => {
  console.log('[SW][Push] Push event received');

  if (!event.data) {
    console.warn('[SW][Push] No data in push event');
    return;
  }

  let data;
  try {
    data = event.data.json();
    console.log('[SW][Push] Parsed push data:', data);
  } catch (err) {
    console.error('[SW][Push] Failed to parse push data:', err.message);
    return;
  }

  // If this push event is from FCM, let FCM SDK handle it.
  if (data.from || data.collapse_key || (!data.type && !data.title && !data.body)) {
    console.log('[SW][Push] FCM push event detected, letting FCM SDK handle');
    return;
  }

  const isCall = data.type === 'incoming_call';

  const notificationOptions = {
    body:    data.body || '',
    icon:    data.icon || '/icons/icon-192x192.png',

    // ── BADGE: must be a monochrome PNG (white on transparent) ────
    badge:   '/icons/badge-72x72.png',

    // ── TAG: group same-conversation messages ─────────────────────
    tag:     data.tag || `zippo-${data.type}`,

    // ── RENOTIFY: always true so lock screen lights up ─────────────
    renotify: true,

    // ── REQUIRE INTERACTION: for calls — notification stays until tapped ──
    requireInteraction: isCall,

    // ── SILENT: never silent ──────────────────────────────────────
    silent: false,

    // ── VIBRATE: pattern in milliseconds [vibrate, pause, vibrate] ─
    vibrate: isCall ? [500, 200, 500, 200, 500] : [200, 100, 200],

    // ── TIMESTAMP: when the event happened ────────────────────────
    timestamp: data.timestamp || Date.now(),

    // ── DATA: for click handler ───────────────────────────────────
    data: {
      url:         data.url || '/adult',
      unreadCount: data.unreadCount || 0,
      type:        data.type,
      isCustomPush: true
    },

    // ── ACTIONS: quick reply options (Android only) ───────────────
    actions: data.type === 'new_message' ? [
      { action: 'open',    title: 'Reply' },
    ] : data.type === 'incoming_call' ? [
      { action: 'open',    title: '📞 Answer' },
      { action: 'dismiss', title: 'Decline' },
    ] : [],
  };

  event.waitUntil(
    self.registration.getNotifications({ tag: notificationOptions.tag }).then(existing => {
      // If there's already a notification for this conversation
      // and more than 1 unread — update the title to show count
      const title = existing.length > 0 && data.unreadCount > 1
        ? `${data.title || 'Zippo'} (${data.unreadCount} messages)`
        : (data.title || 'Zippo');

      console.log('[SW][Push] Showing notification:', { title, tag: notificationOptions.tag });

      return Promise.all([
        self.registration.showNotification(title, notificationOptions)
          .then(() => console.log('[SW][Push] Notification shown successfully'))
          .catch(err => console.error('[SW][Push] showNotification failed:', err.message)),

        // Update home screen badge safely
        (() => {
          const count = data.unreadCount;
          if (count > 0) {
            return navigator.setAppBadge
              ? navigator.setAppBadge(count).catch(e => console.warn('[SW][Badge] setAppBadge failed:', e.message))
              : Promise.resolve();
          } else {
            return navigator.clearAppBadge
              ? navigator.clearAppBadge().catch(e => console.warn('[SW][Badge] clearAppBadge failed:', e.message))
              : Promise.resolve();
          }
        })(),
      ]);
    })
  );
});

// ── Custom Notificationclick event listener ─────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[SW][Click] Notification clicked:', {
    tag:    event.notification.tag,
    action: event.action,
    url:    event.notification.data?.url,
  });

  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = event.notification.data;

  // If it's FCM notification
  if (data && !data.isCustomPush) {
    let targetUrl = '/';
    if (data.type === 'message' && data.conversationId) {
      targetUrl = `/chat/${data.conversationId}`;
    } else if (data.type === 'match') {
      targetUrl = '/chat';
    }

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then((c) => c.navigate(targetUrl));
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
    return;
  }

  // Else it's our custom VAPID push
  const url = data?.url || '/adult/sext';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      console.log('[SW][Click] Open clients:', clientList.length);

      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          console.log('[SW][Click] Focusing existing window and navigating to:', url);
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }

      console.log('[SW][Click] Opening new window:', url);
      return clients.openWindow(url);
    })
  );
});

// ── Message from app (for badge updates when app is open) ───────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'UPDATE_BADGE') {
    const count = event.data.count;
    if (count > 0) {
      if (navigator.setAppBadge) {
        navigator.setAppBadge(count).catch(() => {});
      }
    } else {
      if (navigator.clearAppBadge) {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  }
});
