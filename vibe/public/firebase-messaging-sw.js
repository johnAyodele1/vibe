importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Helper to get the correct API URL based on environment
const getApiUrl = () => {
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  // This should match the production URL in config.ts
  return 'https://zippo-r8hk.onrender.com/api';
};

const API_BASE_URL = getApiUrl();

const initFirebaseInSW = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/config/firebase`);
    if (!response.ok) {
      throw new Error('Failed to fetch firebase config');
    }
    const firebaseConfig = await response.json();
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
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
