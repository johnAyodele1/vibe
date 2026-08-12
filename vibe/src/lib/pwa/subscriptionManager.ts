// vibe/src/lib/pwa/subscriptionManager.ts
import { API_BASE_URL } from '../../config';
import { getInstallContext } from './context';
import { getOrCreateDeviceId, clearDeviceId } from './deviceId';

const DEVICE_ID_KEY = 'zippo_device_id';

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

// THE KEY FUNCTION — call this on every login and app open
export const syncDeviceRegistration = async (userId: string): Promise<void> => {
  const deviceId  = getOrCreateDeviceId();
  const ctx       = getInstallContext();
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const token = localStorage.getItem('adultAccessToken');

  if (!token) {
    console.log('[Sync] No auth token, skipping syncDeviceRegistration');
    return;
  }

  const platform = ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop';

  console.log('[Sync] Starting device sync:', { userId, deviceId, permission, platform, isStandalone: ctx.isStandalone });

  // Step 1: Register basic device info (no subscription yet)
  try {
    await fetch(`${API_BASE_URL}/v1/adult/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        deviceId,
        platform,
        isStandalone: ctx.isStandalone,
        notificationPermission: permission,
      })
    });
  } catch (err: any) {
    console.error('[Sync] Basic register failed:', err.message);
  }

  if (permission === 'denied') {
    console.log('[Sync] Permission denied — no subscription possible');
    return;
  }

  if (permission === 'default') {
    console.log('[Sync] Permission not granted — dispatching onboarding event');
    window.dispatchEvent(new CustomEvent('zippo:needs_push_onboarding', {
      detail: { userId, deviceId }
    }));
    return;
  }

  // permission === 'granted' — ensure subscription exists
  if (!('serviceWorker' in navigator)) {
    console.warn('[Sync] Service workers not supported');
    return;
  }

  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.ready;
  } catch (err) {
    console.error('[Sync] SW not ready:', err);
    return;
  }

  // Check existing subscription
  let sub = await reg.pushManager.getSubscription();
  console.log('[Sync] Existing browser subscription:', {
    exists:   !!sub,
    endpoint: sub?.endpoint?.slice(0, 60),
  });

  // Dynamic public key
  const activeVapidKey = await fetchVapidPublicKey();
  if (!activeVapidKey) {
    console.error('[Sync] Dynamic VAPID public key missing. Aborting silent subscription.');
    return;
  }

  // ── KEY FIX: unsubscribe if applicationServerKey might be stale ──
  // This is the #1 cause of dead push. Old sub may use different VAPID key.
  if (sub) {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/devices/current?deviceId=${deviceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const { device } = await response.json();
        const endpointMatches = device?.pushEndpoint === sub.endpoint || device?.endpoint === sub.endpoint;
        console.log('[Sync] DB endpoint matches browser:', endpointMatches);
        if (!endpointMatches) {
          console.warn('[Sync] VAPID key might have rotated or endpoint mismatched — forcing renew');
          await sub.unsubscribe();
          sub = null;
        }
      }
    } catch (err: any) {
      console.warn('[Sync] Failed to verify subscription endpoint match:', err.message);
    }
  }

  // Create subscription if missing
  if (!sub) {
    console.log('[Sync] No subscription — creating with current VAPID key');
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(activeVapidKey),
      });
      console.log('[Sync] ✅ Subscription created:', sub.endpoint.slice(0, 60));
    } catch (err: any) {
      if (err.message?.includes('different applicationServerKey') || err.message?.includes('registration failed')) {
        // VAPID key changed — force unsubscribe and resubscribe
        console.warn('[Sync] VAPID key mismatch — unsubscribing and resubscribing');
        const oldSub = await reg.pushManager.getSubscription();
        if (oldSub) await oldSub.unsubscribe();

        sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(activeVapidKey),
        });
        console.log('[Sync] ✅ Resubscribed after key mismatch');
      } else {
        console.error('[Sync] Subscribe failed:', err.name, err.message);
        return;
      }
    }
  }

  // Step 2: Save subscription to backend
  try {
    const response = await fetch(`${API_BASE_URL}/v1/adult/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        deviceId,
        platform,
        isStandalone: ctx.isStandalone,
        notificationPermission: 'granted',
        subscription: sub.toJSON(),
      })
    });
    const data = await response.json();
    console.log('[Sync] ✅ Device registered with subscription:', {
      deviceId,
      isNew: data.isNew,
    });
  } catch (err: any) {
    console.error('[Sync] Save subscription failed:', err.message);
  }
};

// For use in logout flow
export const deregisterDevice = async (): Promise<void> => {
  const deviceId = getOrCreateDeviceId();
  const token = localStorage.getItem('adultAccessToken');
  console.log('[Device] Deregistering on logout:', deviceId);

  if (token) {
    try {
      await fetch(`${API_BASE_URL}/v1/adult/devices/current`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ deviceId }),
      });
    } catch (err) {
      console.error('[Device] Deregister failed (non-fatal):', err);
    }
  }
  clearDeviceId();
};

// Grant permission — must be called from direct user gesture (button click)
export const requestAndSubscribe = async (userId: string): Promise<boolean> => {
  const ctx = getInstallContext();
  console.log('[Push] User requested notifications:', ctx);
  const token = localStorage.getItem('adultAccessToken');

  if (ctx.isIOS && !ctx.isStandalone) {
    window.dispatchEvent(new CustomEvent('zippo:show_install_guide'));
    return false;
  }

  const permission = await Notification.requestPermission();
  console.log('[Push] Permission result:', permission);

  if (permission !== 'granted') {
    if (token) {
      const platform = ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop';
      await fetch(`${API_BASE_URL}/v1/adult/devices/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: getOrCreateDeviceId(),
          platform,
          isStandalone: ctx.isStandalone,
          notificationPermission: permission,
        })
      }).catch(() => {});
    }
    return false;
  }

  await syncDeviceRegistration(userId);
  return true;
};
