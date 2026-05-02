importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

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
      const notificationTitle = payload.notification.title;
      const notificationOptions = {
        body: payload.notification.body,
        icon: '/favicon.svg',
        data: payload.data
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } catch (error) {
    console.error('Error initializing Firebase in Service Worker:', error);
  }
};

// Initialize as soon as possible
initFirebaseInSW();

// Cache core assets
const CACHE_NAME = 'vibe-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
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
  // This prevents 'unexpected error' when the service worker tries to fetch assets it hasn't cached
  const isAssetToCache = ASSETS_TO_CACHE.some(asset =>
    url.pathname === asset || (asset === '/' && url.pathname === '/index.html')
  );

  if (!isAssetToCache) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        // Fallback to nothing if both cache and network fail
        return new Response('Network error occurred', { status: 408, headers: { 'Content-Type': 'text/plain' } });
      });
    })
  );
});
