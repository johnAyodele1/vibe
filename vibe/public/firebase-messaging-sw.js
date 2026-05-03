importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Helper to get the correct API URL based on environment
const getApiUrl = () => {
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  // Hardcoded production backend URL as it differs from the frontend origin
  return 'https://zippo-r8hk.onrender.com/api';
};

const API_BASE_URL = getApiUrl();

const initFirebaseInSW = async () => {
  try {
    console.log('[firebase-messaging-sw.js] Fetching firebase config from:', `${API_BASE_URL}/config/firebase`);
    const response = await fetch(`${API_BASE_URL}/config/firebase`);
    if (!response.ok) {
      throw new Error(`Failed to fetch firebase config: ${response.status} ${response.statusText}`);
    }
    const firebaseConfig = await response.json();
    console.log('[firebase-messaging-sw.js] Initializing Firebase with config');
    firebase.initializeApp(firebaseConfig);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);

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
    console.error('Error initializing Firebase in Service Worker:', error);
  }
};

// Initialize as soon as possible
initFirebaseInSW();

// Cache core assets
const CACHE_NAME = 'vibe-v9'; // Bumped version
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] Service Worker installed');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Service Worker activated');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[firebase-messaging-sw.js] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

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

self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification.data);
  event.notification.close();

  const data = event.notification.data;
  let targetUrl = '/';

  if (data) {
    if (data.type === 'message' && data.conversationId) {
      targetUrl = `/chat/${data.conversationId}`;
    } else if (data.type === 'match') {
      targetUrl = '/chat';
    }
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
});
