import { API_BASE_URL } from '../../config';

// Convert VAPID public key string to Uint8Array
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0)));
};

export const fetchVapidPublicKey = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/adult/push/public-key`);
    if (!response.ok) {
      throw new Error(`Failed to fetch VAPID public key: ${response.status}`);
    }
    const data = await response.json();
    if (data && data.success && data.publicKey) {
      return data.publicKey;
    }
    return null;
  } catch (err) {
    console.error('[Push] Error fetching dynamic VAPID public key:', err);
    return null;
  }
};

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[SW] Registered:', registration.scope);
    return registration;
  } catch (err) {
    console.error('[SW] Registration failed:', err);
    return null;
  }
};

export const subscribeToPush = async (
  registration: ServiceWorkerRegistration,
  userId: string
): Promise<boolean> => {
  console.log('[Push] subscribeToPush called:', {
    userId,
    currentPermission: Notification.permission,
  });

  // At this point permission must already be 'granted'
  // (requestPermission was called in the button click handler)
  if (Notification.permission !== 'granted') {
    console.warn('[Push] subscribeToPush called without granted permission — aborting');
    return false;
  }

  try {
    // Dynamic key retrieval
    const activeVapidKey = await fetchVapidPublicKey();
    if (!activeVapidKey) {
      console.error('[Push] Dynamic VAPID public key is empty or missing. Aborting subscription.');
      return false;
    }

    // Get or create subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(activeVapidKey),
        });
      } catch (subErr) {
        console.warn('[Push] Direct subscription failed, attempting to unsubscribe first:', subErr);
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          await existingSub.unsubscribe();
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(activeVapidKey),
        });
      }
    }

    // Send subscription to backend
    const token = localStorage.getItem('adultAccessToken');
    await fetch(`${API_BASE_URL}/v1/adult/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userId,
      })
    });

    console.log('[Push] Subscribed successfully');
    return true;

  } catch (err) {
    console.error('[Push] Subscription failed:', err);
    return false;
  }
};

export const unsubscribeFromPush = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      const token = localStorage.getItem('adultAccessToken');
      await fetch(`${API_BASE_URL}/v1/adult/push/subscribe`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    }
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err);
  }
};

// Update badge count from within the app (when app is open/focused)
export const updateBadgeCount = async (count: number): Promise<void> => {
  // Try native Badging API first
  if ('setAppBadge' in navigator) {
    try {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch (err) {
      // Ignore
    }
  }

  // Also tell the service worker (for when badge API isn't on navigator)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'UPDATE_BADGE', count });
    } catch (err) {
      // Ignore
    }
  }
};
