import { API_BASE_URL } from '../../config';

const PUBLIC_VAPID_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string) || 'BEl62v7sS7635AsZ5gTv98e578A62v6A38e55AsE_S_As7E38S68e_e-e8s';

// Convert VAPID public key string to Uint8Array
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0)));
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
  try {
    // Check permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Permission denied');
      return false;
    }

    // Get or create subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      });
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
