import { getInstallContext } from './context';
import { getOrCreateDeviceId } from './deviceId';
import { API_BASE_URL } from '../../config';
import { fetchVapidPublicKey } from '../push/pushSubscription';

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0)));
};

export const syncPushSubscription = async (userId: string): Promise<void> => {
  console.log('[PushSync] Starting subscription sync for user:', userId);

  const ctx      = getInstallContext();
  const deviceId = getOrCreateDeviceId();

  // Step 1: Check permission
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  console.log('[PushSync] Notification permission:', permission);

  if (permission === 'denied') {
    console.log('[PushSync] Permission denied — cannot sync');
    return;
  }

  if (permission === 'default') {
    console.log('[PushSync] Permission not yet granted — will show prompt separately');
    return;
  }

  // permission === 'granted' from here

  // Step 2: Get SW registration
  if (!('serviceWorker' in navigator)) {
    console.warn('[PushSync] Service workers not supported');
    return;
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.ready;
    console.log('[PushSync] SW ready:', registration.scope);
  } catch (err: any) {
    console.error('[PushSync] SW not ready:', err.message);
    return;
  }

  // Step 3: Get existing subscription OR create new one
  let subscription = await registration.pushManager.getSubscription();

  console.log('[PushSync] Current browser subscription:', {
    exists:   !!subscription,
    endpoint: subscription?.endpoint?.slice(0, 60),
  });

  if (!subscription) {
    console.log('[PushSync] No subscription found despite granted permission — creating new one');
    try {
      const activeVapidKey = await fetchVapidPublicKey();
      if (!activeVapidKey) {
        console.error('[PushSync] Dynamic VAPID public key missing. Aborting silent subscription.');
        return;
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(activeVapidKey),
      });
      console.log('[PushSync] New subscription created:', {
        endpoint: subscription.endpoint.slice(0, 60),
      });
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        console.error('[PushSync] NotAllowedError — permission revoked at OS level');
        window.dispatchEvent(new CustomEvent('zippo:show_notif_settings'));
      } else {
        console.error('[PushSync] Subscribe failed:', err.message);
      }
      return;
    }
  }

  // Step 4: Save to backend — tied to current userId + deviceId
  try {
    const subJson = subscription.toJSON();
    const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('accessToken');

    const response = await fetch(`${API_BASE_URL}/v1/adult/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        subscription: subJson,
        deviceId,
        platform:     ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop',
        isStandalone: ctx.isStandalone,
      })
    });

    const data = await response.json();
    console.log('[PushSync] Subscription synced to backend:', {
      success:  data.success,
      isNew:    data.isNew,
      replaced: data.replaced,
    });

  } catch (err: any) {
    console.error('[PushSync] Failed to sync subscription to backend:', err.message);
  }
};
