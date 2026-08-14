const API_BASE_URL = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : 'https://zippo-r8hk.onrender.com/api';

const SW_VERSION = 'zippo-v9';
const CACHE_NAME = `${SW_VERSION}-static`;
const PRECACHE_ASSETS = ['/', '/offline.html', '/manifest.json', '/favicon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS).catch(err => console.warn('[SW] Precache failed:', err)).then(() => self.skipWaiting())));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }))),
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  if (url.pathname.startsWith('/assets/') || /\.(js|css|woff2)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }

  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match('/')) || caches.match('/offline.html')));
  }
});

const acknowledgePushTest = async data => {
  if (data.type !== 'push_test' || !data.testId || !data.ackToken || !data.deviceId || !data.ackUrl) return;
  try {
    const response = await fetch(`${self.location.origin}${data.ackUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: data.deviceId, testId: data.testId, ackToken: data.ackToken }),
    });
    if (!response.ok) console.warn('[SW][PushTest] Acknowledgement failed:', response.status);
  } catch (error) {
    console.error('[SW][PushTest] Acknowledgement error:', error);
  }
};

self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); } catch { data = { title: 'Zippo', body: event.data.text(), type: 'general' }; }

  const isCall = data.type === 'incoming_call';
  const notificationOptions = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.tag || `zippo-${data.type || 'general'}`,
    renotify: true,
    requireInteraction: isCall,
    silent: false,
    vibrate: isCall ? [500, 200, 500, 200, 500] : [200, 100, 200],
    timestamp: data.timestamp || Date.now(),
    data: {
      url: data.url || '/adult',
      unreadCount: data.unreadCount || 0,
      type: data.type,
      callId: data.callId,
      callType: data.callType,
      token: data.token,
      isCustomPush: true,
    },
    actions: data.type === 'new_message'
      ? [{ action: 'open', title: 'Reply' }]
      : data.type === 'incoming_call'
        ? [{ action: 'open', title: 'Answer' }, { action: 'decline', title: 'Decline' }]
        : [],
  };

  event.waitUntil((async () => {
    await acknowledgePushTest(data);
    const existing = await self.registration.getNotifications({ tag: notificationOptions.tag });
    const title = existing.length > 0 && data.unreadCount > 1
      ? `${data.title || 'Zippo'} (${data.unreadCount} messages)`
      : (data.title || 'Zippo');
    await self.registration.showNotification(title, notificationOptions);
    if (data.unreadCount > 0 && navigator.setAppBadge) await navigator.setAppBadge(data.unreadCount).catch(() => {});
  })());
});

self.addEventListener('notificationclick', event => {
  const { action, notification } = event;
  const data = notification.data || {};
  notification.close();

  if (action === 'decline' && data.type === 'incoming_call') {
    event.waitUntil(fetch(`/api/v1/adult/sext/calls/${data.callId}/decline`, { method: 'PUT', headers: { Authorization: `Bearer ${data.token}` } }).catch(console.error));
    return;
  }

  const url = data.url || '/adult';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
    for (const client of clientList) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.focus();
        client.postMessage({ type: 'NAVIGATE', url });
        if (data.type === 'incoming_call') client.postMessage({ type: 'INCOMING_CALL', callId: data.callId, callType: data.callType });
        return;
      }
    }
    return clients.openWindow(url);
  }));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'UPDATE_BADGE') {
    const count = event.data.count;
    if (count > 0 && navigator.setAppBadge) navigator.setAppBadge(count).catch(() => {});
    if (!count && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  }
});

const urlBase64ToUint8Array = base64String => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0)));
};

const fetchVapidKeyInSW = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/adult/push/public-key`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.publicKey || null;
  } catch { return null; }
};

self.addEventListener('pushsubscriptionchange', event => {
  // Do not keep authentication tokens in the service-worker cache. The next
  // foreground health check will reconcile the rotated subscription securely.
  event.waitUntil((async () => {
    const vapidKey = await fetchVapidKeyInSW();
    if (!vapidKey) return;
    try {
      const subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsList.forEach(client => client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: subscription.toJSON() }));
    } catch (error) {
      console.error('[SW] pushsubscriptionchange failed:', error);
    }
  })());
});
