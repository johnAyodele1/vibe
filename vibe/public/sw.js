// public/sw.js

const CACHE_NAME = 'zippo-v1';

// ── Install ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Push notification received ──────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
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
    data:   { url, unreadCount },
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
        ? self.registration.setAppBadge(unreadCount).catch(() => {})
        : self.registration.clearAppBadge().catch(() => {}),
    ])
  );
});

// ── Notification click ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/adult/sext';

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
      self.registration.setAppBadge(count).catch(() => {});
    } else {
      self.registration.clearAppBadge().catch(() => {});
    }
  }
});
