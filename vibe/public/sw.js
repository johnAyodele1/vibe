// public/sw.js

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

// ── Custom PWA / Web Push Integration ────────────────────────────────
const CACHE_NAME = 'zippo-v4'; // Bumped version
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

// ── Install ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// ── Activate ───────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// ── Fetch (Caching) ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only intercept same-origin GET requests
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Only intercept specific core assets to avoid interfering with the main bundle or other dynamic content
  const isAssetToCache = ASSETS_TO_CACHE.some(asset =>
    url.pathname === asset || (asset === '/' && url.pathname === '/index.html')
  );

  if (!isAssetToCache) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        return new Response('Network error occurred', { status: 408, headers: { 'Content-Type': 'text/plain' } });
      });
    })
  );
});

// ── Push notification received ──────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (err) {
    console.warn('[SW] Push event data was not JSON:', err);
    return;
  }

  // If this push event is from FCM, let FCM SDK handle it.
  // FCM payloads typically contain `from` or have nested structures like `notification` or `collapse_key`.
  // Our custom notifications have `type` or `unreadCount` at root level.
  if (data.from || data.collapse_key || (!data.type && !data.title && !data.body)) {
    console.log('[SW] FCM push event detected, letting FCM SDK handle');
    return;
  }

  const {
    title,
    body,
    icon,
    badge,
    tag,
    url,            // where to navigate on click
    unreadCount,    // total unread messages
    type,           // 'new_message' | 'new_tip' | 'new_booking' | 'payout_update'
  } = data;

  const notificationOptions = {
    body,
    icon:   icon  || '/favicon.svg',
    badge:  badge || '/favicon.svg',   // fallback to favicon if badge-72x72 is not present
    tag:    tag   || type,                        // replaces previous notification of same type
    renotify: type === 'new_message',             // ring again for each new message
    data:   { url, unreadCount, isCustomPush: true },
    actions: type === 'new_message' ? [
      { action: 'open',    title: '💬 Reply' },
      { action: 'dismiss', title: 'Dismiss' },
    ] : [],
    vibrate: [200, 100, 200],    // vibration pattern (Android)
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, notificationOptions),
      // Update the home screen icon badge
      unreadCount > 0
        ? (navigator.setAppBadge ? navigator.setAppBadge(unreadCount).catch(() => {}) : Promise.resolve())
        : (navigator.clearAppBadge ? navigator.clearAppBadge().catch(() => {}) : Promise.resolve()),
    ])
  );
});

// ── Notification click ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
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
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      // Otherwise open a new window
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
